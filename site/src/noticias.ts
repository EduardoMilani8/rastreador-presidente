import { montarComum } from './comum';
import type { Dados } from './dados';
import { el, renderNoticia } from './render';

export function montarNoticias(doc: Document, dados: Dados, agora: Date): void {
  montarComum(doc, dados, agora);

  const lista = doc.getElementById('lista-noticias') as HTMLElement;
  lista.replaceChildren();
  if (dados.noticias.length === 0) {
    lista.append(el(doc, 'li', { class: 'vazio' }, 'Nenhuma notícia disponível no momento.'));
  }
  for (const n of dados.noticias) lista.append(renderNoticia(doc, n));
}
