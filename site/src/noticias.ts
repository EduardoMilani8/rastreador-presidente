import type { Noticia } from '../../src/shared/schema';
import { montarComum } from './comum';
import type { Dados } from './dados';
import { el, formatarDataHoraNoticia, linkOuTexto, renderNoticia } from './render';

const TAMANHO_LISTA = 5;

function porVeiculo(doc: Document, noticias: Noticia[]): HTMLElement[] {
  const grupos = new Map<string, Noticia[]>();
  for (const n of noticias) grupos.set(n.veiculo, [...(grupos.get(n.veiculo) ?? []), n]);
  return [...grupos.entries()]
    .sort(([va, a], [vb, b]) => b.length - a.length || va.localeCompare(vb, 'pt-BR'))
    .map(([veiculo, itens]) => el(doc, 'section', { class: 'veiculo' },
      el(doc, 'h3', {}, veiculo),
      el(doc, 'ul', { class: 'lista' }, ...itens.map((n) =>
        el(doc, 'li', {}, linkOuTexto(doc, n.url, n.titulo), ` · ${formatarDataHoraNoticia(n.data)}`)))));
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

  for (const n of resto.slice(0, TAMANHO_LISTA)) lista.append(renderNoticia(doc, n, 'h2'));

  const demais = resto.slice(TAMANHO_LISTA);
  veiculos.hidden = demais.length === 0;
  if (demais.length > 0) veiculos.append(el(doc, 'h2', {}, 'Mais notícias, por veículo'), ...porVeiculo(doc, demais));
}
