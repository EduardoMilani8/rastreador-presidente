import { LayoutError, parseAgenda, urlAgendaDia } from '../collectors/agenda';
import {
  chaveDoAto, ehRetificacao, parseDou, textoPlanaltoEhDoAto, urlDouEdicao, urlTextoPlanalto, type SecaoDou,
} from '../collectors/dou';
import { URL_AGENCIA_BRASIL, filtrarRelevantes, parseNoticias, urlBuscaGoogleNews } from '../collectors/noticias';
import { URL_FEED_PLANALTO, parsePlanaltoFeed, type Comunicado } from '../collectors/planalto';
import { mandatoDoDia, mandatoVigente } from '../config';
import { ACCEPT_HTML, ACCEPT_XML, type Resposta } from '../shared/http';
import type { EstadoFontes, Evento, Mandato, Noticia } from '../shared/schema';
import { dataSaoPaulo, ementaEhSoRemissao, limparEspacos, somarDias } from '../shared/text';
import { ligarComunicados } from './link';
import { aplicarStatus, mesclar } from './merge';
import { gravarDerivados } from './derivados';
import {
  gravarEstado, gravarEventos, gravarNoticias, lerEstado, lerEventos,
} from './store';

export interface Deps {
  buscar: (url: string, accept: string) => Promise<Resposta>;
  agora: () => Date;
  dataDir: string;
  mandatos: Mandato[];
}

/** Uma fonte só derruba o workflow depois de tanto tempo fora do ar: falha curta fica no aviso do site, sem e-mail. */
export const LIMITE_FALHA_PERSISTENTE_MS = 6 * 60 * 60 * 1000;

export interface ResumoAtualizacao {
  arquivosEscritos: number;
  falhasPersistentes: string[];
  /** Erros desta execução por fonte (o `status.json` guarda só o da primeira falha). */
  errosDestaExecucao: Record<string, string>;
}

interface Coleta {
  eventos: Evento[];
  diasCompletos: Set<string>;
  erros: string[];
  /** Dias cuja página existe mas só abre com login (sem agenda pública). */
  diasComLogin: string[];
}

function caminhoSemBarraFinal(url: string): string {
  return new URL(url).pathname.replace(/\/+$/, '');
}

// buscarTexto segue redirecionamentos: se a página do dia foi trocada por outra (ou por outro site), não pode virar
// dado desse dia.
function exigirAgendaDoDia(finalUrl: string, pedida: string, dia: string): void {
  let ok = false;
  try {
    ok = new URL(finalUrl).hostname === new URL(pedida).hostname && caminhoSemBarraFinal(finalUrl).endsWith(`/${dia}`);
  } catch {
    ok = false;
  }
  if (!ok) throw new Error(`Redirecionamento inesperado: a página de ${dia} respondeu como ${finalUrl}`);
}

// Plone: página que existe mas não está pública responde 200 na tela de login, com came_from = página pedida
// (verificado em 2024-10-20, 2024-12-10, 2025-08-03 e 2026-07-25; o dia sem agenda normal responde 404).
// Só vale se a tela for do mesmo site e o came_from for exatamente a página do dia pedida; qualquer outro destino
// segue sendo falha.
function ehLoginDaPaginaPedida(finalUrl: string, pedida: string): boolean {
  try {
    const f = new URL(finalUrl);
    if (f.hostname !== new URL(pedida).hostname) return false;
    if (!f.pathname.endsWith('/acl_users/credentials_cookie_auth/require_login')) return false;
    const origem = f.searchParams.get('came_from');
    return origem !== null && caminhoSemBarraFinal(origem) === caminhoSemBarraFinal(pedida);
  } catch {
    return false;
  }
}

function exigirEdicaoDou(finalUrl: string, pedida: string, dia: string): void {
  let ok = false;
  try {
    const f = new URL(finalUrl);
    const p = new URL(pedida);
    ok = f.hostname === p.hostname && f.searchParams.get('data') === p.searchParams.get('data');
  } catch {
    ok = false;
  }
  if (!ok) throw new Error(`Redirecionamento inesperado: a edição de ${dia} respondeu como ${finalUrl}`);
}

const intervalo = (de: string, ate: string): string[] => {
  const dias: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
};

const RECUO_MAXIMO_DIAS = 14;

// Normalmente a janela começa `recuo` dias antes de hoje. Se a última gravação é antiga (o agendador parou) ou a fonte
// vinha falhando, começa `recuo` dias antes disso, para recolher o que saiu no intervalo — senão esses dias nunca
// mais seriam lidos. O teto evita uma rajada de requisições depois de uma parada longa (aí é caso de `backfill`).
function inicioDaJanela(hoje: string, recuo: number, anterior: EstadoFontes, fonte: string): string {
  let referencia = hoje;
  const considerar = (instante: string | undefined) => {
    if (!instante) return;
    const dia = dataSaoPaulo(new Date(instante));
    if (dia < referencia) referencia = dia;
  };
  considerar(anterior.ultimaNovidadeEm);
  if (anterior.fontes[fonte]?.ok === false) considerar(anterior.fontes[fonte].desde);
  const inicio = somarDias(referencia, -recuo);
  const teto = somarDias(hoje, -RECUO_MAXIMO_DIAS);
  return inicio < teto ? teto : inicio;
}

// Em 46 meses de agenda houve 5 dias de página não pública, nunca dois a menos de 11 dias um do outro. Dois na mesma
// coleta é o site bloqueando o acesso: num bloqueio real os dias úteis pedem login e os fins de semana dão 404.
const LOGINS_QUE_INDICAM_BLOQUEIO = 2;

// Fonte que não responde custa 3 tentativas de 30 s por endereço; com ~11 endereços o job estouraria os 15 minutos do
// workflow antes de gravar status.json, e a falha nem seria registrada. Duas falhas de rede seguidas bastam para dar a
// fonte como fora do ar nesta execução; a seguinte tenta de novo e a janela recua para recolher o que faltou.
const FALHAS_DE_REDE_QUE_INTERROMPEM = 2;
const AVISO_INTERROMPIDA = `coleta interrompida depois de ${FALHAS_DE_REDE_QUE_INTERROMPEM} falhas de rede seguidas`;

async function coletarAgenda(deps: Deps, dias: string[], coletadoEm: string): Promise<Coleta> {
  const c: Coleta = { eventos: [], diasCompletos: new Set(), erros: [], diasComLogin: [] };
  let falhasDeRedeSeguidas = 0;
  for (const d of dias) {
    const mandato = mandatoDoDia(deps.mandatos, d);
    if (!mandato) continue; // dia que nenhum mandato configurado cobre: não há agenda certa para pedir
    const url = urlAgendaDia(mandato.agendaBase, d);
    let r: Resposta;
    try {
      r = await deps.buscar(url, ACCEPT_HTML);
      falhasDeRedeSeguidas = 0;
    } catch (e) {
      c.erros.push(`${d}: ${String(e)}`);
      if (++falhasDeRedeSeguidas >= FALHAS_DE_REDE_QUE_INTERROMPEM) {
        c.erros.push(AVISO_INTERROMPIDA);
        break;
      }
      continue;
    }
    try {
      if (ehLoginDaPaginaPedida(r.url, url)) {
        c.diasComLogin.push(d); // dia sem agenda pública: nada a gravar e, como não é "dia publicado", nada é removido
        continue;
      }
      exigirAgendaDoDia(r.url, url, d);
      const p = parseAgenda(r.corpo, r.status, d, coletadoEm, url);
      c.eventos.push(...p.eventos);
      if (p.diaPublicado) c.diasCompletos.add(d);
    } catch (e) {
      c.erros.push(`${d}: ${e instanceof LayoutError ? e.message : String(e)}`);
    }
  }
  if (c.diasComLogin.length >= LOGINS_QUE_INDICAM_BLOQUEIO) {
    c.erros.push(
      `${c.diasComLogin.length} páginas de agenda pediram login (${c.diasComLogin.join(', ')}): o site mudou ou bloqueou o acesso`,
    );
  }
  return c;
}

const semAsterisco = (titulo: string) => limparEspacos(titulo.replace(/\(\*\)\s*$/, ''));

// A retificação "(*)" só fica enquanto for a única publicação conhecida do ato (tipo + número): sai se existe (ou chega
// depois) a publicação comum, e de duas retificações fica a primeira.
function semRetificacaoRedundante(eventos: Evento[]): Evento[] {
  const comPublicacaoComum = new Set<string>();
  const primeiraRetificacao = new Map<string, Evento>();
  for (const e of eventos) {
    if (e.tipo !== 'ato') continue;
    const chave = chaveDoAto(e.titulo);
    if (!ehRetificacao(e.titulo)) {
      comPublicacaoComum.add(chave);
      continue;
    }
    const p = primeiraRetificacao.get(chave);
    if (!p || e.data < p.data || (e.data === p.data && e.id < p.id)) primeiraRetificacao.set(chave, e);
  }
  return eventos.filter((e) => {
    if (e.tipo !== 'ato' || !ehRetificacao(e.titulo)) return true;
    const chave = chaveDoAto(e.titulo);
    return !comPublicacaoComum.has(chave) && primeiraRetificacao.get(chave)?.id === e.id;
  });
}

/**
 * Cada ato aparece uma vez. O DOU repete o mesmo título em três situações: o ato listado duas vezes no mesmo dia, com
 * ids diferentes (MP 1.373, 29/06/2026); a retificação dias depois, com o "(*)" só no corpo (Decreto 11.906, 31/01 e
 * 01/02/2024); e a retificação com "(*)" no título. Fica a publicação mais antiga (no mesmo dia, a sem "(*)" e a de
 * menor id — nunca a ordem da lista, que muda), com os links das outras. Só título IDÊNTICO une: o DOU erra números,
 * e "Decreto 11.430" de 3/3 e de 8/3/2023 são atos diferentes.
 * Roda sobre a lista já mesclada, para valer também quando a cópia chega numa execução posterior.
 */
export function umPorAto(eventos: Evento[]): Evento[] {
  const vistos = new Set<string>();
  const unicos = eventos.filter((e) => !vistos.has(e.id) && vistos.add(e.id)); // id repetido: vale o primeiro

  const porTitulo = new Map<string, Evento[]>();
  for (const e of unicos) {
    if (e.tipo !== 'ato') continue;
    const t = semAsterisco(e.titulo);
    porTitulo.set(t, [...(porTitulo.get(t) ?? []), e]);
  }
  const resultado = new Map<string, Evento | null>();
  for (const copias of porTitulo.values()) {
    if (copias.length === 1) continue;
    const ordem = (e: Evento) => `${e.data} ${ehRetificacao(e.titulo) ? 1 : 0} ${e.id}`;
    const [fica, ...saem] = [...copias].sort((a, b) => (ordem(a) < ordem(b) ? -1 : 1));
    const urls = new Set<string>();
    const fontes = [fica, ...saem].flatMap((c) => c.fontes).filter((f) => !urls.has(f.url) && urls.add(f.url));
    const temResumo = (c: Evento) => c.ementa !== undefined && !ementaEhSoRemissao(c.ementa);
    const ementa = temResumo(fica) ? fica.ementa : saem.find(temResumo)?.ementa ?? fica.ementa;
    resultado.set(fica.id, { ...fica, ementa, fontes });
    for (const c of saem) resultado.set(c.id, null);
  }
  return semRetificacaoRedundante(unicos.flatMap((e) => {
    const r = resultado.get(e.id);
    return r === undefined ? [e] : r === null ? [] : [r];
  }));
}

// Só o ato que vai virar item merece a consulta ao Planalto: sem isto, uma cópia redundante seria consultada de novo
// a cada execução enquanto estivesse na janela.
function atosQueFicam(existentes: Evento[], coletados: Evento[]): Set<string> {
  return new Set(umPorAto([...existentes, ...coletados]).map((e) => e.id));
}

async function coletarDou(deps: Deps, dias: string[], coletadoEm: string): Promise<Coleta> {
  const c: Coleta = { eventos: [], diasCompletos: new Set(), erros: [], diasComLogin: [] };
  const edicoes: [SecaoDou, string][] = [['do1', 'edição'], ['do1e', 'edição extra']];
  let falhasDeRedeSeguidas = 0;
  coleta: for (const d of dias) {
    for (const [secao, rotulo] of edicoes) {
      const pedida = urlDouEdicao(d, secao);
      let r: Resposta;
      try {
        r = await deps.buscar(pedida, ACCEPT_HTML);
        falhasDeRedeSeguidas = 0;
      } catch (e) {
        c.erros.push(`${d} (${rotulo}): ${String(e)}`);
        if (++falhasDeRedeSeguidas >= FALHAS_DE_REDE_QUE_INTERROMPEM) {
          c.erros.push(AVISO_INTERROMPIDA);
          break coleta;
        }
        continue;
      }
      try {
        exigirEdicaoDou(r.url, pedida, d);
        // Dia sem edição responde 200 com lista vazia (verificado): 404 nunca é "sem edição", é o endereço que mudou.
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        // Lei sancionada pelo governo anterior e publicada já neste mandato não é ato de nenhum Presidente acompanhado.
        c.eventos.push(...parseDou(r.corpo, d, coletadoEm).filter((e) =>
          !e.datasAto?.assinatura || mandatoDoDia(deps.mandatos, e.datasAto.assinatura) !== undefined));
      } catch (e) {
        c.erros.push(`${d} (${rotulo}): ${String(e)}`);
      }
    }
  }
  return c;
}

async function adicionarTextoPlanalto(deps: Deps, ev: Evento, coletadoEm: string): Promise<void> {
  const url = urlTextoPlanalto(ev.titulo, ev.datasAto?.assinatura);
  if (!url) return;
  try {
    const r = await deps.buscar(url, ACCEPT_HTML);
    if (r.status === 200 && textoPlanaltoEhDoAto(r.corpo, ev.titulo)) {
      ev.fontes.push({ nome: 'texto-planalto', rotulo: 'Planalto (texto do ato)', url, coletadoEm });
    }
  } catch {
    // sem o texto confirmado no Planalto, fica só o link do DOU
  }
}

export async function atualizar(deps: Deps): Promise<ResumoAtualizacao> {
  const agora = deps.agora();
  const agoraIso = agora.toISOString();
  const hoje = dataSaoPaulo(agora);
  const mandato = mandatoVigente(deps.mandatos, hoje);
  const existentes = await lerEventos(deps.dataDir);
  const anterior = await lerEstado(deps.dataDir);
  const estado: EstadoFontes = { fontes: {}, ultimaNovidadeEm: anterior.ultimaNovidadeEm };

  const errosDestaExecucao: Record<string, string> = {};
  const marcar = (nome: string, erro?: string) => {
    if (erro !== undefined) errosDestaExecucao[nome] = erro;
    const ant = anterior.fontes[nome];
    const ok = erro === undefined;
    // Só uma transição ok <-> falha gera estado novo; enquanto o estado se mantém, o texto do erro não importa
    // (senão cada variação de mensagem reescreveria status.json e geraria um commit).
    estado.fontes[nome] = ant && ant.ok === ok
      ? ant
      : { ok, desde: agoraIso, ...(ok ? {} : { mensagem: erro?.slice(0, 300) }) };
  };

  const agenda = await coletarAgenda(
    deps, intervalo(inicioDaJanela(hoje, 3, anterior, 'agenda'), somarDias(hoje, 7)), agoraIso,
  );
  marcar('agenda', agenda.erros.length ? agenda.erros.join('; ') : undefined);

  const dou = await coletarDou(deps, intervalo(inicioDaJanela(hoje, 1, anterior, 'dou'), hoje), agoraIso);
  marcar('dou', dou.erros.length ? dou.erros.join('; ') : undefined);

  let comunicados: Comunicado[] = [];
  try {
    const r = await deps.buscar(URL_FEED_PLANALTO, ACCEPT_XML);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    comunicados = parsePlanaltoFeed(r.corpo, agoraIso);
    marcar('planalto');
  } catch (e) {
    marcar('planalto', String(e));
  }

  const idsExistentes = new Set(existentes.map((e) => e.id));
  const ficam = atosQueFicam(existentes, dou.eventos);
  for (const ato of dou.eventos.filter((e) => !idsExistentes.has(e.id) && ficam.has(e.id))) {
    await adicionarTextoPlanalto(deps, ato, agoraIso);
  }

  let eventos = mesclar(existentes, [...agenda.eventos, ...dou.eventos], agenda.diasCompletos, agoraIso);
  eventos = umPorAto(eventos);
  eventos = ligarComunicados(eventos, comunicados, mandato);
  eventos = aplicarStatus(eventos, hoje);
  let escritos = await gravarEventos(deps.dataDir, eventos);
  escritos += await gravarDerivados(deps.dataDir, eventos);

  const noticias: Noticia[] = [];
  const fontesNoticias: [string, string, Noticia['origem']][] = [
    ['noticias-google', urlBuscaGoogleNews(mandato.nomes[0]), 'google-news'],
    ['noticias-agencia-brasil', URL_AGENCIA_BRASIL, 'agencia-brasil'],
  ];
  for (const [nome, url, origem] of fontesNoticias) {
    try {
      const r = await deps.buscar(url, ACCEPT_XML);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      noticias.push(...filtrarRelevantes(parseNoticias(r.corpo, origem), mandato));
      marcar(nome);
    } catch (e) {
      marcar(nome, String(e));
    }
  }
  if (await gravarNoticias(deps.dataDir, noticias, hoje)) escritos++;

  if (escritos > 0) estado.ultimaNovidadeEm = agoraIso;
  if (await gravarEstado(deps.dataDir, estado)) escritos++;

  const falhasPersistentes = Object.entries(estado.fontes)
    .filter(([, s]) => !s.ok && agora.getTime() - Date.parse(s.desde) >= LIMITE_FALHA_PERSISTENTE_MS)
    .map(([nome]) => nome);
  return { arquivosEscritos: escritos, falhasPersistentes, errosDestaExecucao };
}

export async function retroagir(
  deps: Deps, de: string, ate: string, aoProgredir?: (dia: string) => void,
): Promise<string[]> {
  const agoraIso = deps.agora().toISOString();
  let eventos = await lerEventos(deps.dataDir);
  const falhas = new Set<string>();
  const gravar = async (dia: string) => {
    const comStatus = aplicarStatus(eventos, dataSaoPaulo(deps.agora()));
    await gravarEventos(deps.dataDir, comStatus);
    await gravarDerivados(deps.dataDir, comStatus);
    aoProgredir?.(dia);
  };

  let contador = 0;
  let loginsSeguidos: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    if (!mandatoDoDia(deps.mandatos, d)) continue; // dia fora de qualquer mandato configurado
    const agenda = await coletarAgenda(deps, [d], agoraIso);
    const dou = await coletarDou(deps, [d], agoraIso);
    if (agenda.erros.length || dou.erros.length) falhas.add(d);
    // Aqui cada coleta tem um dia só; o bloqueio por login aparece como dias seguidos (ver LOGINS_QUE_INDICAM_BLOQUEIO).
    loginsSeguidos = agenda.diasComLogin.length ? [...loginsSeguidos, d] : [];
    if (loginsSeguidos.length >= LOGINS_QUE_INDICAM_BLOQUEIO) for (const x of loginsSeguidos) falhas.add(x);

    const idsExistentes = new Set(eventos.map((e) => e.id));
    const ficam = atosQueFicam(eventos, dou.eventos);
    for (const ato of dou.eventos.filter((e) => !idsExistentes.has(e.id) && ficam.has(e.id))) {
      await adicionarTextoPlanalto(deps, ato, agoraIso);
    }
    eventos = umPorAto(mesclar(eventos, [...agenda.eventos, ...dou.eventos], agenda.diasCompletos, agoraIso));
    if (++contador % 15 === 0) await gravar(d);
  }
  await gravar(ate);
  return [...falhas].sort();
}
