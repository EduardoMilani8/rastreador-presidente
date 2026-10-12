import type { Evento } from '../../src/shared/schema';
import type { Dados, Resumo } from './dados';
import { agruparPorDia } from './filtrar';
import { el, formatarDataCurta, formatarDataLonga } from './render';

export interface DiaPainel {
  data: string;
  agenda: number;
  atos: number;
  comunicados: number;
  itens: Evento[];
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MAX_ITENS = 3;

// Aritmética em UTC sobre a string AAAA-MM-DD: o dia não anda com o fuso da máquina.
function somarDias(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasDoPainel(eventos: Evento[], hoje: string, n = 21): DiaPainel[] {
  const porDia = new Map(agruparPorDia(eventos).map((g) => [g.data, g.itens]));
  return Array.from({ length: n }, (_, i) => {
    const data = somarDias(hoje, i - (n - 1));
    const doDia = porDia.get(data) ?? [];
    const agenda = doDia.filter((e) => e.tipo === 'agenda' && e.status !== 'removido');
    const atos = doDia.filter((e) => e.tipo === 'ato');
    const comunicados = doDia.filter((e) => e.tipo === 'comunicado');
    return {
      data,
      agenda: agenda.length,
      atos: atos.length,
      comunicados: comunicados.length,
      itens: [...atos, ...agenda, ...comunicados].slice(0, MAX_ITENS),
    };
  });
}

export function faixaDeTamanho(n: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n <= 3) return 2;
  if (n <= 6) return 3;
  if (n <= 10) return 4;
  return 5;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function contagens(d: DiaPainel): string {
  return [
    plural(d.agenda, 'compromisso', 'compromissos'),
    plural(d.atos, 'ato', 'atos'),
    d.comunicados > 0 ? plural(d.comunicados, 'comunicado', 'comunicados') : '',
  ].filter(Boolean).join(', ');
}

function marca(doc: Document, tipo: 'ato' | 'agenda', n: number): HTMLElement {
  return el(doc, 'span', { class: `marca marca-${tipo} tam-${faixaDeTamanho(n)}`, 'aria-hidden': 'true' });
}

function renderBotao(doc: Document, d: DiaPainel, comMes: boolean): HTMLElement {
  const botao = el(doc, 'button', {
    type: 'button', class: 'dia', 'data-dia': d.data, 'aria-pressed': 'false',
    'aria-label': `${formatarDataLonga(d.data)}: ${contagens(d)}`,
  });
  if (d.atos > 0) botao.append(marca(doc, 'ato', d.atos));
  if (d.agenda > 0) botao.append(marca(doc, 'agenda', d.agenda));
  if (d.atos === 0 && d.agenda === 0) {
    botao.append(el(doc, 'span', { class: 'marca marca-vazio', 'aria-hidden': 'true' }));
  }
  botao.append(el(doc, 'span', { class: 'dia-num', 'aria-hidden': 'true' }, d.data.slice(8)));
  if (comMes) {
    botao.append(el(doc, 'span', { class: 'dia-mes', 'aria-hidden': 'true' }, MESES[Number(d.data.slice(5, 7)) - 1]));
  }
  return el(doc, 'li', {}, botao);
}

function renderDetalhe(doc: Document, d: DiaPainel): Node[] {
  const longa = formatarDataLonga(d.data);
  const titulo = el(doc, 'h3', {}, longa.charAt(0).toUpperCase() + longa.slice(1));
  if (d.itens.length === 0) {
    return [titulo, el(doc, 'p', { class: 'vazio' }, 'Nenhum registro publicado pelas fontes neste dia.')];
  }
  const rotuloQuando = (e: Evento) =>
    e.tipo === 'ato' ? 'Ato' : e.tipo === 'comunicado' ? 'Comunicado' : (e.hora ?? 'Agenda');
  const lista = el(doc, 'ul', { class: 'detalhe-itens' });
  for (const e of d.itens) {
    lista.append(el(doc, 'li', {}, el(doc, 'span', { class: 'quando' }, rotuloQuando(e)), ' ', e.titulo));
  }
  const q = new URLSearchParams({ de: d.data, ate: d.data });
  return [
    titulo,
    el(doc, 'p', { class: 'detalhe-resumo' }, contagens(d)),
    lista,
    el(doc, 'a', { href: `registros.html?${q.toString()}` }, 'Ver os registros do dia, com as fontes'),
  ];
}

function montarResumo(doc: Document, resumo: Resumo | undefined): void {
  const dl = doc.getElementById('resumo') as HTMLElement;
  dl.replaceChildren();
  dl.hidden = true;
  if (!resumo) return;
  const n = new Intl.NumberFormat('pt-BR');
  const pares: [number, string][] = [
    [resumo.total, `registros desde ${formatarDataCurta(resumo.desde)}`],
    [resumo.porTipo.agenda, 'compromissos na agenda'],
    [resumo.porTipo.ato, 'atos no Diário Oficial'],
  ];
  for (const [valor, rotulo] of pares) {
    dl.append(el(doc, 'div', {}, el(doc, 'dt', {}, rotulo), el(doc, 'dd', { class: 'resumo-numero' }, n.format(valor))));
  }
  dl.hidden = false;
}

const comArrasto = new WeakSet<HTMLElement>();

function arrastavel(rolagem: HTMLElement): void {
  if (comArrasto.has(rolagem)) return; // montar de novo não empilha ouvintes
  comArrasto.add(rolagem);
  let ultimoX: number | null = null;
  rolagem.addEventListener('mousedown', (e) => { ultimoX = e.clientX; });
  rolagem.addEventListener('mousemove', (e) => {
    if (ultimoX === null) return;
    rolagem.scrollLeft -= e.clientX - ultimoX;
    ultimoX = e.clientX;
  });
  const soltar = () => { ultimoX = null; };
  rolagem.addEventListener('mouseup', soltar);
  rolagem.addEventListener('mouseleave', soltar);
}

export function montarPainel(doc: Document, dados: Dados, hoje: string, _agora: Date): void {
  montarResumo(doc, dados.resumo);

  const dias = diasDoPainel(dados.eventos, hoje);
  const lista = doc.getElementById('linha-dias') as HTMLElement;
  const detalhe = doc.getElementById('detalhe-dia') as HTMLElement;
  const rolagem = doc.getElementById('linha-rolagem') as HTMLElement;

  lista.replaceChildren(...dias.map((d, i) => renderBotao(doc, d, i === 0 || d.data.endsWith('-01'))));
  const botoes = [...lista.querySelectorAll<HTMLButtonElement>('button.dia')];

  const selecionar = (data: string) => {
    const dia = dias.find((d) => d.data === data);
    if (!dia) return;
    for (const b of botoes) b.setAttribute('aria-pressed', String(b.dataset.dia === data));
    detalhe.replaceChildren(...renderDetalhe(doc, dia));
  };
  for (const b of botoes) {
    const escolher = () => selecionar(b.dataset.dia as string);
    b.addEventListener('click', escolher);
    b.addEventListener('focus', escolher);
    b.addEventListener('mouseenter', escolher);
  }

  const maisRecente = [...dias].reverse().find((d) => d.agenda + d.atos + d.comunicados > 0);
  selecionar((maisRecente ?? dias[dias.length - 1]).data);

  rolagem.scrollLeft = rolagem.scrollWidth;
  arrastavel(rolagem);
}
