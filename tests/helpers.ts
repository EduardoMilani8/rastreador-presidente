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

// Trechos reais de planalto.gov.br/ccivil_03 (out/2026). As páginas são Latin-1 sem charset declarado: lidas como
// UTF-8, cada letra acentuada e cada "º" chegam como U+FFFD — é assim que o coletor as recebe.
export const PAGINA_PLANALTO_D11430 = `<html><head><meta content="Microsoft FrontPage 6.0" name="GENERATOR"><title>D11430</title></head><body>
  <p align="center"><font face="Arial" color="#000080" size="2"><small><strong>
       <a href="http://legislacao.planalto.gov.br/legisla/legislacao.nsf/Viw_Identificacao/DEC%2011.430-2023?OpenDocument">
        <font color="#000080">
         DECRETO N\uFFFD 11.430, DE 8 DE MAR\uFFFDO DE 2023</font></a></strong></small></font></p>
  <p>Regulamenta a Lei n\uFFFD 14.133, de 1\uFFFD de abril de 2021, para dispor sobre a exig\uFFFDncia, em contrata\uFFFD\uFFFDes p\uFFFDblicas.</p>
  <p>Art. 9\uFFFD &nbsp;Este Decreto entra em vigor em 30 de mar\uFFFDo de 2023. </p>
  <p>Bras\uFFFDlia, 8 de mar\uFFFDo de 2023; 202\uFFFD da Independ\uFFFDncia e 135\uFFFD da Rep\uFFFDblica.</p>
  <p>Este texto n\uFFFDo substitui o publicado no DOU de 9.3.2023</p></body></html>`;

export const PAGINA_PLANALTO_L15090 = `<html><head><title>L15090</title></head><body>
  <p align="CENTER"><font face="Arial" color="#000080"><strong><small>
      &nbsp;<a style="color: rgb(0,0,128)" href="http://legislacao.planalto.gov.br/legisla/legislacao.nsf/Viw_Identificacao/lei%2015.090-2025?OpenDocument">LEI\r
\tN\uFFFD 15.090, DE 7 DE JANEIRO DE 2025</a></small></strong></font></p>
  <p>Bras\uFFFDlia, 7 de janeiro de 2025; 204\uFFFD da Independ\uFFFDncia e 137\uFFFD da Rep\uFFFDblica.</p>
  <p>Este texto n\uFFFDo substitui o publicado no DOU de 8.1.2025</p></body></html>`;
