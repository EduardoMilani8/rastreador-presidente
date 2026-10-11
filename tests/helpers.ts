export const TITULO_AGENDA = '<title>Agenda do Presidente da República — Planalto</title>';
export const PAGINA_404 = `<html><head>${TITULO_AGENDA}</head><body></body></html>`;

export function htmlAgenda(itens: { hora: string; titulo: string; local?: string }[]): string {
  const corpo = itens
    .map((i) => `<div class="item-compromisso"><span class="compromisso-inicio">${i.hora}</span><span class="compromisso-titulo">${i.titulo}</span>${i.local ? `<span class="compromisso-local">${i.local}</span>` : ''}</div>`)
    .join('');
  return `<html><head>${TITULO_AGENDA}</head><body><div class="list-compromissos">${corpo}</div></body></html>`;
}

export function htmlDou(itens: object[]): string {
  return `<html><body><script id="params" type="application/json">${JSON.stringify({ jsonArray: itens })}</script></body></html>`;
}

// Ato real da edição de 10/03/2025 (a data fixa "hoje" dos testes do pipeline).
export const DECRETO_DOU = {
  title: 'DECRETO Nº 12.392, DE 7 DE MARÇO DE 2025',
  urlTitle: 'decreto-n-12.392-de-7-de-marco-de-2025-616480099',
  artType: 'Decreto numerado', hierarchyStr: 'Atos do Poder Executivo',
  content: 'DECRETO Nº 12.392, DE 7 DE MARÇO DE 2025 Declara de interesse social, para fins de desapropriação, o imóvel rural que especifica. O PRESIDENTE DA REPÚBLICA, no uso',
};

export function rdfPlanalto(itens: { slug: string; titulo: string; data: string }[]): string {
  const xs = itens.map((i) => `<item><title>${i.titulo}</title><link>https://www.gov.br/planalto/n/${i.slug}</link><description></description><dc:date>${i.data}</dc:date></item>`).join('');
  return `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">${xs}</rdf:RDF>`;
}

export function rssVazio(): string {
  return '<rss version="2.0"><channel></channel></rss>';
}

export function rssGoogle(): string {
  return `<rss version="2.0"><channel><item><title>Notícia - BBC</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Mon, 10 Mar 2025 14:00:00 GMT</pubDate><source url="https://www.bbc.com">BBC</source></item></channel></rss>`;
}
