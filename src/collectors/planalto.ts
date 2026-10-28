import * as cheerio from 'cheerio';
import type { Mandato } from '../shared/schema';
import { limparEspacos, normalizar, urlHttpsSegura } from '../shared/text';

// O feed (.../noticias/RSS, rss.xml e atom.xml) parou em 27/09/2026 e não há outro (testado em 27/10/2026); a lista
// da própria página de notícias continua atualizada. A primeira página traz 30 notícias, o que cobre semanas.
export const URL_PAGINA_PLANALTO = 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias';
const CAMINHO_NOTICIAS = '/planalto/pt-br/acompanhe-o-planalto/noticias';

// O feed trazia sobretudo avisos de pauta; a página traz notícias publicadas depois do fato. Até 27/09/2026 os
// comunicados gravados vieram do feed: notícias desses dias repetiriam, com outro texto, eventos já registrados.
export const INICIO_PAGINA_PLANALTO = '2026-09-28';

export interface Comunicado {
  id: string;
  data: string;
  titulo: string;
  resumo: string;
  url: string;
  coletadoEm: string;
}

export class FeedLayoutError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'FeedLayoutError';
  }
}

function dataDaLista(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(limparEspacos(texto));
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  // 31/02 viraria 03/03 no Date: só vale a data que volta igual.
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

function ehNoticiaDoPlanalto(url: string): boolean {
  const u = new URL(url);
  return u.hostname === 'www.gov.br' && u.pathname.startsWith(`${CAMINHO_NOTICIAS}/`);
}

/** Lê a lista da página de notícias. `urlFinal` é o endereço depois de redirecionamentos. */
export function parsePlanaltoPagina(html: string, urlFinal: string, coletadoEm: string): Comunicado[] {
  const final = new URL(urlFinal);
  if (final.hostname !== 'www.gov.br' || final.pathname.replace(/\/+$/, '') !== CAMINHO_NOTICIAS) {
    throw new FeedLayoutError(
      `A página de notícias do Planalto foi redirecionada para ${final.hostname}${final.pathname}; o endereço pode ter mudado ou passado a pedir login.`,
    );
  }
  const $ = cheerio.load(html);
  const lista = $('ul.listagem-noticias-com-foto');
  if (lista.length === 0) {
    throw new FeedLayoutError(
      'A página de notícias do Planalto não tem a lista "ul.listagem-noticias-com-foto"; o layout pode ter mudado.',
    );
  }
  const itens = lista.first().children('li');
  if (itens.length === 0) {
    throw new FeedLayoutError('A lista de notícias do Planalto veio vazia; a página sempre traz as notícias mais recentes.');
  }
  const saida: Comunicado[] = [];
  itens.each((_, el) => {
    const li = $(el);
    const link = li.find('h2.titulo a').first();
    const url = urlHttpsSegura(link.attr('href') ?? '');
    const titulo = limparEspacos(link.text());
    const data = dataDaLista(li.find('span.descricao span.data').first().text());
    if (!url || !titulo || !data || !ehNoticiaDoPlanalto(url)) return;
    // O resumo vem depois de "<span class="data">DD/MM/AAAA</span><span> - </span>".
    const descricao = li.find('span.descricao').first().clone();
    descricao.children('span').remove();
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? url;
    saida.push({ id: `planalto:${slug}`, data, titulo, resumo: limparEspacos(descricao.text()), url, coletadoEm });
  });
  if (saida.length === 0) {
    throw new FeedLayoutError(
      `A lista do Planalto trouxe ${itens.length} item(ns), mas nenhum tem link https das notícias, título e data válidos; o layout pode ter mudado.`,
    );
  }
  return saida;
}

// "Presidente" conta; "Presidente do/da/de X" (Senado, Câmara, empresa) não, exceto "da República".
// Também não contam "ex-presidente" e "presidente executivo/interino/eleito/em exercício".
const PRESIDENTE =
  /(?<!ex[- ])\bpresidente\b(?![- ]?(executivo|interino|eleito|em exercicio)\b)(?!\s+d[aoe]s?\s+(?!republica))/;

export function citaPresidente(texto: string, mandato: Mandato): boolean {
  const t = normalizar(texto).replace(/vice[- ]?presidente/g, ' ');
  if (PRESIDENTE.test(t)) return true;
  // O feed do governo escreve "Visita presidencial ...", "Participação presidencial ..." para as agendas do presidente.
  if (/\bpresidencial\b/.test(t)) return true;
  return mandato.nomes.some((n) => new RegExp(`\\b${normalizar(n)}\\b`).test(t));
}
