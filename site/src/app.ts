import type { EstadoFontes } from '../../src/shared/schema';
import type { Dados } from './dados';
import { agruparPorDia, ehProximo, filtrarEventos, proximos, ultimoRegistro } from './filtrar';
import type { Filtros } from './params';
import { el, formatarDataCurta, formatarDataLonga, renderEvento, renderNoticia } from './render';

const NOME_FONTE: Record<string, string> = {
  agenda: 'Agenda do Planalto',
  dou: 'Diário Oficial',
  planalto: 'Comunicados do Planalto',
  'noticias-google': 'Google Notícias',
  'noticias-agencia-brasil': 'Agência Brasil',
};

function haQuanto(iso: string, agora: Date): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.round((agora.getTime() - t) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)} h`;
  const dias = Math.floor(min / 1440);
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

// O instante gravado é o da última ALTERAÇÃO nos dados, não o da última coleta: numa madrugada sem notícia nova ele
// fica até ~12 horas parado com tudo funcionando. Por isso o aviso só aparece depois de 24 horas e não afirma que a
// coleta parou — só diz até quando os dados vão.
const LIMITE_SEM_ALTERACAO_MS = 24 * 60 * 60 * 1000;

function avisoDesatualizado(iso: string | undefined, agora: Date): string | null {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(t) || agora.getTime() - t <= LIMITE_SEM_ALTERACAO_MS) return null;
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(t));
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '';
  return `Última alteração nos dados: ${p('day')}/${p('month')}/${p('year')} às ${p('hour')}:${p('minute')} (horário de Brasília). `
    + 'Se as fontes publicaram algo depois disso, ainda não aparece aqui.';
}

// Uma busca a partir de 2023 traz mais de 8 mil itens: desenhar tudo de uma vez trava o celular.
const DIAS_POR_LOTE = 60;

const numero = new Intl.NumberFormat('pt-BR');
const contar = (n: number, um: string, varios: string) => `${numero.format(n)} ${n === 1 ? um : varios}`;

const AVISO_INCOMPLETO = 'Alguns dados não puderam ser carregados; a lista pode estar incompleta.';

function limpar(e: HTMLElement): void {
  e.replaceChildren();
}

function textoAviso(estado: EstadoFontes): string | null {
  const falhas = Object.entries(estado.fontes).filter(([, s]) => !s.ok).map(([n]) => NOME_FONTE[n] ?? n);
  return falhas.length ? `Atenção: sem atualizar agora — ${falhas.join(', ')}. Os dados já exibidos continuam valendo.` : null;
}

export function montar(doc: Document, dados: Dados, f: Filtros, hoje: string, agora: Date): void {
  const $ = (id: string) => doc.getElementById(id) as HTMLElement;
  const linha = f.aba === 'linha';

  $('painel-linha').hidden = !linha;
  $('painel-noticias').hidden = linha;
  $(linha ? 'aba-linha' : 'aba-noticias').setAttribute('aria-current', 'page');
  $(linha ? 'aba-noticias' : 'aba-linha').removeAttribute('aria-current');

  const quando = dados.estado.ultimaNovidadeEm ? haQuanto(dados.estado.ultimaNovidadeEm, agora) : null;
  $('ultima-novidade').textContent = quando ? `Última alteração nos dados ${quando}` : '';
  const parado = avisoDesatualizado(dados.estado.ultimaNovidadeEm, agora);
  $('aviso-desatualizado').hidden = parado === null;
  $('aviso-desatualizado').textContent = parado ?? '';
  const aviso = textoAviso(dados.estado);
  $('aviso-fontes').hidden = aviso === null;
  $('aviso-fontes').textContent = aviso ?? '';
  $('aviso-incompleto').hidden = !dados.incompleto;
  $('aviso-incompleto').textContent = dados.incompleto ? AVISO_INCOMPLETO : '';

  for (const nome of ['de', 'ate', 'tipo', 'status'] as const) {
    const campo = doc.querySelector<HTMLInputElement | HTMLSelectElement>(`#filtros [name=${nome}]`);
    if (campo) campo.value = f[nome] ?? '';
  }

  if (!linha) {
    const lista = $('lista-noticias');
    limpar(lista);
    if (dados.noticias.length === 0) {
      lista.append(el(doc, 'li', { class: 'vazio' }, 'Nenhuma notícia disponível no momento.'));
    }
    for (const n of dados.noticias) lista.append(renderNoticia(doc, n));
    return;
  }

  const filtrando = Boolean(f.tipo || f.status || f.de || f.ate);
  // Recolhido, o formulário não empurra os destaques para fora da primeira tela; com filtro em uso, fica à vista.
  ($('caixa-filtros') as HTMLDetailsElement).open = filtrando;
  const ultimo = filtrando ? undefined : ultimoRegistro(dados.eventos, hoje);
  const prox = filtrando ? [] : proximos(dados.eventos, hoje);

  $('bloco-ultimo').hidden = !ultimo;
  limpar($('ultimo-registro'));
  if (ultimo) $('ultimo-registro').append(el(doc, 'ul', { class: 'lista' }, renderEvento(doc, ultimo, { nivelTitulo: 3, comId: false, comData: true })));

  $('bloco-proximos').hidden = prox.length === 0;
  limpar($('proximos'));
  for (const e of prox) $('proximos').append(renderEvento(doc, e, { nivelTitulo: 3, comId: false, comData: true }));

  // Sem filtro, exatamente o que aparece na faixa de próximos sai da linha do tempo;
  // agendados com data passada (defasados) continuam nela.
  const base = filtrando ? dados.eventos : dados.eventos.filter((e) => !ehProximo(e, hoje));
  const itens = filtrarEventos(base, f);
  const grupos = agruparPorDia(itens);

  // O período é o que foi de fato consultado: sem datas, só os meses carregados — e a página diz isso, para um
  // "nenhum registro" nunca ser lido como "não existe".
  const mesMaisAntigo = [...dados.mesesCarregados].sort()[0];
  // Pedir "desde 2020" não faz existirem dados de 2020: o período nunca começa antes do primeiro mês disponível.
  const primeiroDia = [...dados.mesesDisponiveis].sort()[0];
  const pedido = f.de ?? (mesMaisAntigo ? `${mesMaisAntigo}-01` : undefined);
  const inicio = pedido && primeiroDia && pedido < `${primeiroDia}-01` ? `${primeiroDia}-01` : pedido;
  const fim = f.ate ?? itens.reduce((max, e) => (e.data > max ? e.data : max), hoje);
  const contagem = itens.length ? `: ${contar(itens.length, 'registro', 'registros')} em ${contar(grupos.length, 'dia', 'dias')}` : '';
  $('periodo').textContent = !inicio ? ''
    : `Mostrando ${inicio > fim ? `a partir de ${formatarDataCurta(inicio)}` : `${formatarDataCurta(inicio)} a ${formatarDataCurta(fim)}`}${contagem}.`;

  const mesAnterior = inicio ? dados.mesesDisponiveis.filter((m) => m < inicio.slice(0, 7)).sort().pop() : undefined;
  const maisAntigos = $('mais-antigos');
  if (mesAnterior) {
    const q = new URLSearchParams({ aba: 'linha', de: `${mesAnterior}-01` });
    if (f.ate) q.set('ate', f.ate);
    if (f.tipo) q.set('tipo', f.tipo);
    if (f.status) q.set('status', f.status);
    maisAntigos.querySelector('a')?.setAttribute('href', `?${q.toString()}`);
  }

  const destino = $('linha-do-tempo');
  const maisDias = $('mais-dias');
  limpar(destino);
  let mostrados = 0;
  const mostrarLote = (): HTMLElement | undefined => {
    const lote = grupos.slice(mostrados, mostrados + DIAS_POR_LOTE).map((g) =>
      el(doc, 'section', { class: 'dia' },
        el(doc, 'h3', {}, el(doc, 'time', { datetime: g.data }, formatarDataLonga(g.data))),
        el(doc, 'ol', { class: 'lista' }, ...g.itens.map((e) => renderEvento(doc, e)))));
    destino.append(...lote);
    mostrados += lote.length;

    const resta = mostrados < grupos.length;
    limpar(maisDias);
    maisDias.hidden = !resta;
    if (resta) {
      const botao = el(doc, 'button', { type: 'button' }, 'Mostrar mais dias');
      botao.addEventListener('click', () => {
        // O botão é refeito (ou some) a cada lote: o foco vai para o primeiro dia novo, de onde a leitura continua.
        const titulo = mostrarLote()?.querySelector('h3');
        titulo?.setAttribute('tabindex', '-1');
        titulo?.focus();
      });
      maisDias.append(botao, el(doc, 'span', {}, `Exibindo ${numero.format(mostrados)} de ${contar(grupos.length, 'dia', 'dias')}.`));
    }
    // "Meses anteriores" continua de onde a lista termina: só aparece quando ela já está inteira na tela.
    maisAntigos.hidden = !mesAnterior || resta;
    return lote[0];
  };
  mostrarLote();

  if (grupos.length === 0) {
    destino.append(el(doc, 'p', { class: 'vazio' },
      filtrando || mesAnterior ? 'Nenhum registro neste período.' : 'Ainda não há registros para mostrar.'));
  }
}

/** Rola até o item indicado pela âncora do endereço (`#ev-...`). Só `getElementById`: a âncora nunca vira seletor. */
export function irParaAncora(doc: Document, hash: string): void {
  if (!hash.startsWith('#ev-')) return;
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return;
  }
  const alvo = doc.getElementById(id);
  if (!alvo) return;
  alvo.classList.add('em-destaque');
  alvo.setAttribute('tabindex', '-1');
  alvo.focus({ preventScroll: true });
  alvo.scrollIntoView?.();
}
