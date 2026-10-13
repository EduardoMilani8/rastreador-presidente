import type { Noticia } from '../../src/shared/schema';
import { montarComum } from './comum';
import type { Dados } from './dados';
import { el, formatarDataHoraNoticia, linkOuTexto, renderNoticia } from './render';

export const NOTICIAS_NA_GRADE = 6;
export const VEICULOS_A_VISTA = 8;

const plural = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;
const linhaDaNoticia = (doc: Document, n: Noticia) => [linkOuTexto(doc, n.url, n.titulo), ` · ${formatarDataHoraNoticia(n.data)}`];

function cartaoDoVeiculo(doc: Document, veiculo: string, [recente, ...outras]: Noticia[]): HTMLElement {
  const cartao = el(doc, 'section', { class: 'veiculo' },
    el(doc, 'h3', {}, veiculo),
    el(doc, 'p', { class: 'veiculo-recente' }, ...linhaDaNoticia(doc, recente)));
  if (outras.length > 0) {
    cartao.append(el(doc, 'details', { class: 'veiculo-mais' },
      el(doc, 'summary', {}, `Mais ${plural(outras.length, 'notícia', 'notícias')}`),
      el(doc, 'ul', { class: 'lista' }, ...outras.map((n) => el(doc, 'li', {}, ...linhaDaNoticia(doc, n))))));
  }
  return cartao;
}

// As notícias chegam da mais recente à mais antiga, então cada grupo já nasce nessa ordem.
function porVeiculo(doc: Document, noticias: Noticia[]): HTMLElement[] {
  const grupos = new Map<string, Noticia[]>();
  for (const n of noticias) grupos.set(n.veiculo, [...(grupos.get(n.veiculo) ?? []), n]);
  const cartoes = [...grupos.entries()]
    .sort(([va, a], [vb, b]) => b.length - a.length || va.localeCompare(vb, 'pt-BR'))
    .map(([veiculo, itens]) => cartaoDoVeiculo(doc, veiculo, itens));
  const outros = cartoes.slice(VEICULOS_A_VISTA);
  if (outros.length === 0) return cartoes;
  return [...cartoes.slice(0, VEICULOS_A_VISTA), el(doc, 'details', { class: 'veiculos-outros' },
    el(doc, 'summary', {}, `Outros ${plural(outros.length, 'veículo', 'veículos')}`),
    el(doc, 'div', { class: 'veiculos-grade' }, ...outros))];
}

export function montarNoticias(doc: Document, dados: Dados, agora: Date): void {
  montarComum(doc, dados, agora);

  const destaque = doc.getElementById('noticia-destaque') as HTMLElement;
  const lista = doc.getElementById('lista-noticias') as HTMLElement;
  const veiculos = doc.getElementById('noticias-veiculos') as HTMLElement;
  destaque.replaceChildren();
  lista.replaceChildren();
  veiculos.replaceChildren();

  const ordenadas = [...dados.noticias].sort((a, b) => Date.parse(b.data) - Date.parse(a.data));
  destaque.hidden = ordenadas.length === 0;
  if (ordenadas.length === 0) {
    veiculos.hidden = true;
    lista.append(el(doc, 'li', { class: 'vazio' }, 'Nenhuma notícia disponível no momento.'));
    return;
  }

  const [primeira, ...resto] = ordenadas;
  destaque.append(
    el(doc, 'p', { class: 'selo' }, 'Mais recente'),
    el(doc, 'h2', { class: 'evento-titulo' }, linkOuTexto(doc, primeira.url, primeira.titulo)),
    el(doc, 'p', { class: 'local' }, `${primeira.veiculo} · ${formatarDataHoraNoticia(primeira.data)}`));

  for (const n of resto.slice(0, NOTICIAS_NA_GRADE)) lista.append(renderNoticia(doc, n, 'h2'));

  const demais = resto.slice(NOTICIAS_NA_GRADE);
  veiculos.hidden = demais.length === 0;
  if (demais.length > 0) veiculos.append(el(doc, 'h2', {}, 'Mais notícias, por veículo'), ...porVeiculo(doc, demais));
}
