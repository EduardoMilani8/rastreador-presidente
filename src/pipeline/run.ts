import { LayoutError, parseAgenda, urlAgendaDia } from '../collectors/agenda';
import { parseDou, urlDouEdicao, urlTextoPlanalto, type SecaoDou } from '../collectors/dou';
import { URL_AGENCIA_BRASIL, filtrarRelevantes, parseNoticias, urlBuscaGoogleNews } from '../collectors/noticias';
import { URL_FEED_PLANALTO, parsePlanaltoFeed, type Comunicado } from '../collectors/planalto';
import { mandatoDoDia, mandatoVigente } from '../config';
import { ACCEPT_HTML, ACCEPT_XML, type Resposta } from '../shared/http';
import type { EstadoFontes, Evento, Mandato, Noticia } from '../shared/schema';
import { dataSaoPaulo, somarDias } from '../shared/text';
import { ligarComunicados } from './link';
import { aplicarStatus, mesclar } from './merge';
import {
  gravarEstado, gravarEventos, gravarNoticias, lerEstado, lerEventos,
} from './store';

export interface Deps {
  buscar: (url: string, accept: string) => Promise<Resposta>;
  agora: () => Date;
  dataDir: string;
  mandatos: Mandato[];
}

export interface ResumoAtualizacao {
  arquivosEscritos: number;
  falhasPersistentes: string[];
}

interface Coleta {
  eventos: Evento[];
  diasCompletos: Set<string>;
  erros: string[];
}

function caminhoSemBarraFinal(url: string): string {
  return new URL(url).pathname.replace(/\/+$/, '');
}

// buscarTexto segue redirecionamentos: se a página do dia foi trocada por outra, não pode virar dado desse dia.
function exigirAgendaDoDia(finalUrl: string, dia: string): void {
  let ok = false;
  try {
    ok = caminhoSemBarraFinal(finalUrl).endsWith(`/${dia}`);
  } catch {
    ok = false;
  }
  if (!ok) throw new Error(`Redirecionamento inesperado: a página de ${dia} respondeu como ${finalUrl}`);
}

// Plone: página que existe mas não está pública responde 200 na tela de login, com came_from = página pedida
// (verificado em 2024-10-20, 2024-12-10, 2025-08-03 e 2026-07-25; o dia sem agenda normal responde 404).
// Só vale se o came_from for exatamente a página do dia pedida; qualquer outro destino segue sendo falha.
function ehLoginDaPaginaPedida(finalUrl: string, pedida: string): boolean {
  try {
    const f = new URL(finalUrl);
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

const janela = (hoje: string, de: number, ate: number) =>
  Array.from({ length: ate - de + 1 }, (_, i) => somarDias(hoje, de + i));

async function coletarAgenda(deps: Deps, mandato: Mandato, dias: string[], coletadoEm: string): Promise<Coleta> {
  const c: Coleta = { eventos: [], diasCompletos: new Set(), erros: [] };
  let semAgendaPublica = 0;
  for (const d of dias) {
    const url = urlAgendaDia(mandato.agendaBase, d);
    try {
      const r = await deps.buscar(url, ACCEPT_HTML);
      if (ehLoginDaPaginaPedida(r.url, url)) {
        semAgendaPublica++; // dia sem agenda pública: nada a gravar e, como não é "dia publicado", nada é removido
        continue;
      }
      exigirAgendaDoDia(r.url, d);
      const p = parseAgenda(r.corpo, r.status, d, coletadoEm, url);
      c.eventos.push(...p.eventos);
      if (p.diaPublicado) c.diasCompletos.add(d);
    } catch (e) {
      c.erros.push(`${d}: ${e instanceof LayoutError ? e.message : String(e)}`);
    }
  }
  // Um dia solto pedindo login é normal; todos os dias de uma coleta de 3+ dias pedindo login é o site que mudou.
  if (dias.length >= 3 && semAgendaPublica === dias.length) {
    c.erros.push('todas as páginas de agenda pediram login: o site mudou ou bloqueou o acesso');
  }
  return c;
}

async function coletarDou(deps: Deps, dias: string[], coletadoEm: string): Promise<Coleta> {
  const c: Coleta = { eventos: [], diasCompletos: new Set(), erros: [] };
  const edicoes: [SecaoDou, string][] = [['do1', 'edição'], ['do1e', 'edição extra']];
  for (const d of dias) {
    for (const [secao, rotulo] of edicoes) {
      try {
        const pedida = urlDouEdicao(d, secao);
        const r = await deps.buscar(pedida, ACCEPT_HTML);
        exigirEdicaoDou(r.url, pedida, d);
        if (r.status === 404) continue; // sem edição nesse dia
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
    if (r.status === 200) {
      ev.fontes.push({ nome: 'texto-planalto', rotulo: 'Planalto (texto do ato)', url, coletadoEm });
    }
  } catch {
    // sem o texto no Planalto, fica só o link do DOU
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

  const marcar = (nome: string, erro?: string) => {
    const ant = anterior.fontes[nome];
    const ok = erro === undefined;
    // Só uma transição ok <-> falha gera estado novo; enquanto o estado se mantém, o texto do erro não importa
    // (senão cada variação de mensagem reescreveria status.json e geraria um commit).
    estado.fontes[nome] = ant && ant.ok === ok
      ? ant
      : { ok, desde: agoraIso, ...(ok ? {} : { mensagem: erro?.slice(0, 300) }) };
  };

  const agenda = await coletarAgenda(deps, mandato, janela(hoje, -3, 7), agoraIso);
  marcar('agenda', agenda.erros.length ? agenda.erros.join('; ') : undefined);

  const dou = await coletarDou(deps, [somarDias(hoje, -1), hoje], agoraIso);
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
  for (const ato of dou.eventos.filter((e) => !idsExistentes.has(e.id))) {
    await adicionarTextoPlanalto(deps, ato, agoraIso);
  }

  let eventos = mesclar(existentes, [...agenda.eventos, ...dou.eventos], agenda.diasCompletos, agoraIso);
  eventos = ligarComunicados(eventos, comunicados, mandato);
  eventos = aplicarStatus(eventos, hoje);
  let escritos = await gravarEventos(deps.dataDir, eventos);

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
    .filter(([nome, s]) => !s.ok && anterior.fontes[nome]?.ok === false)
    .map(([nome]) => nome);
  return { arquivosEscritos: escritos, falhasPersistentes };
}

export async function retroagir(
  deps: Deps, de: string, ate: string, aoProgredir?: (dia: string) => void,
): Promise<string[]> {
  const agoraIso = deps.agora().toISOString();
  let eventos = await lerEventos(deps.dataDir);
  const falhas: string[] = [];
  const gravar = async (dia: string) => {
    await gravarEventos(deps.dataDir, aplicarStatus(eventos, dataSaoPaulo(deps.agora())));
    aoProgredir?.(dia);
  };

  let contador = 0;
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    let mandato: Mandato;
    try {
      mandato = mandatoVigente(deps.mandatos, d);
    } catch {
      continue; // dia fora de qualquer mandato configurado
    }
    const agenda = await coletarAgenda(deps, mandato, [d], agoraIso);
    const dou = await coletarDou(deps, [d], agoraIso);
    if (agenda.erros.length || dou.erros.length) falhas.push(d);

    const idsExistentes = new Set(eventos.map((e) => e.id));
    for (const ato of dou.eventos.filter((e) => !idsExistentes.has(e.id))) {
      await adicionarTextoPlanalto(deps, ato, agoraIso);
    }
    eventos = mesclar(eventos, [...agenda.eventos, ...dou.eventos], agenda.diasCompletos, agoraIso);
    if (++contador % 15 === 0) await gravar(d);
  }
  await gravar(ate);
  return falhas;
}
