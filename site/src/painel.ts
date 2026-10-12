import type { Evento } from '../../src/shared/schema';
import type { Dados, Resumo } from './dados';
import { agruparPorDia } from './filtrar';
import { el, formatarDataCurta, formatarDataLonga } from './render';

export interface DiaPainel {
  data: string;
  agenda: number;
  atos: number;
  comunicados: number;
  removidos: number;
  itens: Evento[];
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const DIAS_DO_PAINEL = 21;
export const ITENS_DO_DETALHE = 3;

// Aritmética em UTC sobre a string AAAA-MM-DD: o dia não anda com o fuso da máquina.
function somarDias(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasDoPainel(eventos: Evento[], hoje: string, n = DIAS_DO_PAINEL): DiaPainel[] {
  const porDia = new Map(agruparPorDia(eventos).map((g) => [g.data, g.itens]));
  return Array.from({ length: n }, (_, i) => {
    const data = somarDias(hoje, i - (n - 1));
    const doDia = porDia.get(data) ?? [];
    const agenda = doDia.filter((e) => e.tipo === 'agenda' && e.status !== 'removido');
    const removidos = doDia.filter((e) => e.tipo === 'agenda' && e.status === 'removido');
    const atos = doDia.filter((e) => e.tipo === 'ato');
    const comunicados = doDia.filter((e) => e.tipo === 'comunicado');
    return {
      data,
      agenda: agenda.length,
      atos: atos.length,
      comunicados: comunicados.length,
      removidos: removidos.length,
      itens: [...atos, ...agenda, ...comunicados, ...removidos].slice(0, ITENS_DO_DETALHE),
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
    d.removidos > 0 ? `${plural(d.removidos, 'removido', 'removidos')} da agenda` : '',
  ].filter(Boolean).join(', ');
}

function marca(doc: Document, tipo: 'ato' | 'agenda' | 'comunicado', n: number, extra = ''): HTMLElement {
  return el(doc, 'span', { class: `marca marca-${tipo} tam-${faixaDeTamanho(n)}${extra}`, 'aria-hidden': 'true' });
}

function renderBotao(doc: Document, d: DiaPainel, comMes: boolean): HTMLElement {
  const botao = el(doc, 'button', {
    type: 'button', class: 'dia', 'data-dia': d.data, 'aria-pressed': 'false',
    'aria-label': `${formatarDataLonga(d.data)}: ${contagens(d)}`,
  });
  if (d.atos > 0) botao.append(marca(doc, 'ato', d.atos));
  if (d.agenda > 0) botao.append(marca(doc, 'agenda', d.agenda));
  else if (d.atos === 0 && d.removidos > 0) botao.append(marca(doc, 'agenda', 1, ' marca-removido'));
  if (d.comunicados > 0) botao.append(marca(doc, 'comunicado', d.comunicados));
  if (d.atos + d.agenda + d.comunicados + d.removidos === 0) {
    botao.append(el(doc, 'span', { class: 'marca marca-vazio', 'aria-hidden': 'true' }));
  }
  botao.append(el(doc, 'span', { class: 'dia-num', 'aria-hidden': 'true' }, d.data.slice(8)));
  if (comMes) {
    botao.append(el(doc, 'span', { class: 'dia-mes', 'aria-hidden': 'true' }, MESES[Number(d.data.slice(5, 7)) - 1]));
  }
  return el(doc, 'li', {}, botao);
}

function renderDetalhe(doc: Document, d: DiaPainel, incompleto: boolean): Node[] {
  const longa = formatarDataLonga(d.data);
  const titulo = el(doc, 'h3', {}, longa.charAt(0).toUpperCase() + longa.slice(1));
  if (d.itens.length === 0) {
    const frase = incompleto
      ? 'Não foi possível carregar todos os dados; este dia pode ter registros que não aparecem aqui.'
      : 'Nenhum registro publicado pelas fontes neste dia.';
    return [titulo, el(doc, 'p', { class: 'vazio' }, frase)];
  }
  const rotuloQuando = (e: Evento) =>
    e.status === 'removido' ? 'Removido'
      : e.tipo === 'ato' ? 'Ato' : e.tipo === 'comunicado' ? 'Comunicado' : (e.hora ?? 'Agenda');
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
  const ul = doc.getElementById('resumo') as HTMLElement;
  ul.replaceChildren();
  ul.hidden = true;
  if (!resumo) return;
  const n = new Intl.NumberFormat('pt-BR');
  const itens: [string, number, string][] = [
    ['', resumo.total, `registros desde ${formatarDataCurta(resumo.desde)}`],
    ['resumo-agenda', resumo.porTipo.agenda, 'compromissos na agenda'],
    ['resumo-ato', resumo.porTipo.ato, 'atos no Diário Oficial'],
  ];
  for (const [classe, valor, rotulo] of itens) {
    ul.append(el(doc, 'li', classe ? { class: classe } : {},
      el(doc, 'strong', { class: 'numero' }, n.format(valor)),
      el(doc, 'span', { class: 'rotulo' }, rotulo)));
  }
  ul.hidden = false;
}

const LIMITE_ARRASTO = 5;

interface Arrasto {
  /** O botão do mouse está apertado e o movimento já passou do limite. */
  emCurso: boolean;
  /** O último arrasto passou do limite: o click que o encerra não é uma escolha de dia. */
  arrastou: boolean;
}

const arrastos = new WeakMap<HTMLElement, Arrasto>();

function arrastavel(rolagem: HTMLElement): Arrasto {
  const existente = arrastos.get(rolagem);
  if (existente) return existente; // montar de novo não empilha ouvintes
  const estado: Arrasto = { emCurso: false, arrastou: false };
  arrastos.set(rolagem, estado);
  let ultimoX: number | null = null;
  let acumulado = 0;
  rolagem.addEventListener('mousedown', (e) => {
    ultimoX = e.clientX;
    acumulado = 0;
    estado.emCurso = false;
    estado.arrastou = false;
  });
  rolagem.addEventListener('mousemove', (e) => {
    if (ultimoX === null) return;
    acumulado += Math.abs(e.clientX - ultimoX);
    if (acumulado > LIMITE_ARRASTO) { estado.emCurso = true; estado.arrastou = true; }
    rolagem.scrollLeft -= e.clientX - ultimoX;
    ultimoX = e.clientX;
  });
  const soltar = () => { ultimoX = null; estado.emCurso = false; };
  rolagem.addEventListener('mouseup', soltar);
  rolagem.addEventListener('mouseleave', soltar);
  return estado;
}

export function montarPainel(doc: Document, dados: Dados, hoje: string): void {
  montarResumo(doc, dados.resumo);

  const dias = diasDoPainel(dados.eventos, hoje);
  const lista = doc.getElementById('linha-dias') as HTMLElement;
  const detalhe = doc.getElementById('detalhe-dia') as HTMLElement;
  const rolagem = doc.getElementById('linha-rolagem') as HTMLElement;

  lista.setAttribute('aria-label', 'Dias, do mais antigo ao mais recente. Use as setas para mudar de dia.');
  lista.replaceChildren(...dias.map((d, i) => renderBotao(doc, d, i === 0 || d.data.endsWith('-01'))));
  const botoes = [...lista.querySelectorAll<HTMLButtonElement>('button.dia')];

  const selecionar = (data: string) => {
    if (botoes.some((b) => b.dataset.dia === data && b.getAttribute('aria-pressed') === 'true')) return;
    const dia = dias.find((d) => d.data === data);
    if (!dia) return;
    for (const b of botoes) {
      const atual = b.dataset.dia === data;
      b.setAttribute('aria-pressed', String(atual));
      b.setAttribute('tabindex', atual ? '0' : '-1');
    }
    detalhe.replaceChildren(...renderDetalhe(doc, dia, dados.incompleto));
  };
  const arrasto = arrastavel(rolagem);
  const irPara = (i: number) => {
    const alvo = botoes[Math.max(0, Math.min(botoes.length - 1, i))];
    alvo.focus();
    selecionar(alvo.dataset.dia as string); // o foco já seleciona; isto garante o mesmo onde o foco não dispara evento
  };
  botoes.forEach((b, i) => {
    const escolher = () => selecionar(b.dataset.dia as string);
    b.addEventListener('click', () => { if (arrasto.arrastou) { arrasto.arrastou = false; return; } escolher(); });
    b.addEventListener('focus', escolher);
    b.addEventListener('mouseenter', () => { if (!arrasto.emCurso) escolher(); });
    b.addEventListener('keydown', (e) => {
      const destino = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1
        : e.key === 'Home' ? 0 : e.key === 'End' ? botoes.length - 1 : null;
      if (destino === null) return;
      e.preventDefault();
      irPara(destino);
    });
  });

  const maisRecente = [...dias].reverse().find((d) => d.agenda + d.atos + d.comunicados > 0);
  selecionar((maisRecente ?? dias[dias.length - 1]).data);

  rolagem.scrollLeft = rolagem.scrollWidth;
}
