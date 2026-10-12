import type { Viagem } from '../../src/shared/schema';
import { el, formatarDataCurta } from './render';

export const CIDADES_A_VISTA = 10;
const ROTULOS_DE_CIDADE = 5;

const LARGURA = 720;
const ALTURA = 276;
const SVG = 'http://www.w3.org/2000/svg';
const BRASILIA = { lat: -15.79, lon: -47.88 };
// Mesmos raios de .mapa-cidade.tam-N no CSS: o atributo vale onde o navegador não aplica `r` por CSS.
const RAIOS = [3, 4, 5.5, 7, 9];

type Contorno = { LARGURA: number; ALTURA: number; TERRA: string };

const prender = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Equirretangular recortada em latitudes de 80 a -58. A mesma fórmula está em scripts/gerar-mapa.mjs.
export function projetar(lat: number, lon: number): { x: number; y: number } {
  return {
    x: prender((lon + 180) * 2, 0, LARGURA),
    y: prender((80 - lat) * 2, 0, ALTURA),
  };
}

export function faixaDeCidade(compromissos: number): 1 | 2 | 3 | 4 | 5 {
  if (compromissos <= 2) return 1;
  if (compromissos <= 7) return 2;
  if (compromissos <= 15) return 3;
  if (compromissos <= 30) return 4;
  return 5;
}

const MS_POR_DIA = 86_400_000;
const diasCorridos = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / MS_POR_DIA) + 1;

function periodo(v: Viagem): string {
  if (v.primeiroDia === v.ultimoDia) return formatarDataCurta(v.primeiroDia);
  const anoA = v.primeiroDia.slice(0, 4);
  const anoB = v.ultimoDia.slice(0, 4);
  if (v.dias === diasCorridos(v.primeiroDia, v.ultimoDia)) {
    return anoA === anoB
      ? `${formatarDataCurta(v.primeiroDia).slice(0, 5)} a ${formatarDataCurta(v.ultimoDia)}`
      : `${formatarDataCurta(v.primeiroDia)} a ${formatarDataCurta(v.ultimoDia)}`;
  }
  return anoA === anoB ? `${v.dias} dias em ${anoA}` : `${v.dias} dias entre ${anoA} e ${anoB}`;
}

const contagem = (n: number) => (n === 1 ? '1 compromisso' : `${n} compromissos`);

function renderCidade(doc: Document, v: Viagem): HTMLElement {
  return el(doc, 'li', { 'data-cidade': v.id },
    el(doc, 'strong', { class: 'cidade' }, v.cidade),
    el(doc, 'span', { class: 'pais' }, v.pais),
    el(doc, 'span', { class: 'periodo' }, periodo(v)),
    el(doc, 'span', { class: 'contagem' }, contagem(v.compromissos)));
}

function montarLista(doc: Document, viagens: Viagem[]): HTMLElement[] {
  const alvo = doc.getElementById('lista-viagens') as HTMLElement;
  const vista = el(doc, 'ol', { class: 'cidades' }, ...viagens.slice(0, CIDADES_A_VISTA).map((v) => renderCidade(doc, v)));
  alvo.replaceChildren(vista);
  const resto = viagens.slice(CIDADES_A_VISTA);
  if (resto.length > 0) {
    alvo.append(el(doc, 'details', { class: 'cidades-mais' },
      el(doc, 'summary', {}, `Outras ${resto.length} cidades`),
      el(doc, 'ol', { class: 'cidades' }, ...resto.map((v) => renderCidade(doc, v)))));
  }
  return [...alvo.querySelectorAll<HTMLElement>('li[data-cidade]')];
}

function svg<K extends keyof SVGElementTagNameMap>(
  doc: Document, tag: K, atributos: Record<string, string>, texto?: string,
): SVGElementTagNameMap[K] {
  const e = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, v);
  if (texto !== undefined) e.textContent = texto;
  return e;
}

const arredondar = (v: number) => String(Math.round(v * 10) / 10);

function rotulo(doc: Document, texto: string, x: number, y: number): SVGTextElement {
  const aoFim = x > LARGURA * 0.85; // perto da borda direita o texto cresce para a esquerda
  return svg(doc, 'text', {
    class: 'mapa-rotulo', x: arredondar(aoFim ? x - 7 : x + 7), y: arredondar(y - 6), 'text-anchor': aoFim ? 'end' : 'start',
  }, texto);
}

function desenharMapa(doc: Document, destino: HTMLElement, viagens: Viagem[], contorno: Contorno): void {
  const raiz = svg(doc, 'svg', {
    class: 'mapa-svg', viewBox: `0 0 ${contorno.LARGURA} ${contorno.ALTURA}`, 'aria-hidden': 'true', focusable: 'false',
  });
  raiz.append(svg(doc, 'path', { class: 'mapa-terra', d: contorno.TERRA }));

  const origem = projetar(BRASILIA.lat, BRASILIA.lon);
  for (const v of viagens) {
    const p = projetar(v.lat, v.lon);
    const dist = Math.hypot(p.x - origem.x, p.y - origem.y);
    const cx = (origem.x + p.x) / 2;
    const cy = (origem.y + p.y) / 2 - dist * 0.2;
    raiz.append(svg(doc, 'path', {
      class: 'mapa-rota', 'data-cidade': v.id,
      d: `M${arredondar(origem.x)} ${arredondar(origem.y)}Q${arredondar(cx)} ${arredondar(cy)} ${arredondar(p.x)} ${arredondar(p.y)}`,
    }));
  }

  // Do menor para o maior, para os pontos grandes ficarem por cima dos pequenos.
  for (const v of [...viagens].sort((a, b) => a.compromissos - b.compromissos)) {
    const p = projetar(v.lat, v.lon);
    const faixa = faixaDeCidade(v.compromissos);
    const c = svg(doc, 'circle', {
      class: `mapa-cidade tam-${faixa}`, 'data-cidade': v.id, cx: arredondar(p.x), cy: arredondar(p.y), r: String(RAIOS[faixa - 1]),
    });
    c.append(svg(doc, 'title', {}, `${v.cidade}: ${contagem(v.compromissos)}`));
    raiz.append(c);
  }

  raiz.append(svg(doc, 'rect', { class: 'mapa-brasilia', x: arredondar(origem.x - 4), y: arredondar(origem.y - 4), width: '8', height: '8' }));
  raiz.append(rotulo(doc, 'Brasília', origem.x, origem.y));
  for (const v of viagens.slice(0, ROTULOS_DE_CIDADE)) {
    const p = projetar(v.lat, v.lon);
    raiz.append(rotulo(doc, v.cidade, p.x, p.y));
  }

  destino.replaceChildren(raiz);
  destino.hidden = false;
}

// Só classes: o realce nunca escreve estilo. Liga o item, o ponto e a rota da mesma cidade.
function marcar(doc: Document, itens: Map<string, HTMLElement>, id: string, ligado: boolean): void {
  itens.get(id)?.classList.toggle('ativa', ligado);
  for (const alvo of doc.querySelectorAll('.mapa-cidade, .mapa-rota')) {
    if (alvo.getAttribute('data-cidade') === id) alvo.classList.toggle('ativa', ligado);
  }
}

export async function montarViagens(
  doc: Document,
  viagens: Viagem[],
  carregarContorno: () => Promise<Contorno> = () => import('./mapa-contorno'),
): Promise<void> {
  const secao = doc.getElementById('secao-viagens');
  const mapa = doc.getElementById('mapa-viagens');
  if (!secao || !mapa || viagens.length === 0) return;

  const itens = new Map(montarLista(doc, viagens).map((li) => [li.dataset.cidade as string, li]));
  for (const [id, item] of itens) {
    for (const entrada of ['mouseenter', 'focusin']) item.addEventListener(entrada, () => marcar(doc, itens, id, true));
    for (const saida of ['mouseleave', 'focusout']) item.addEventListener(saida, () => marcar(doc, itens, id, false));
  }
  secao.hidden = false;

  let contorno: Contorno;
  try {
    contorno = await carregarContorno();
  } catch {
    return; // sem o contorno só o mapa fica de fora; a lista diz tudo o que o mapa diria
  }
  desenharMapa(doc, mapa, viagens, contorno);
  for (const c of mapa.querySelectorAll('circle.mapa-cidade')) {
    const id = c.getAttribute('data-cidade') as string;
    c.addEventListener('mouseenter', () => marcar(doc, itens, id, true));
    c.addEventListener('mouseleave', () => marcar(doc, itens, id, false));
  }
}
