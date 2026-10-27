import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import type { Mandato } from '../shared/schema';
import { dataSaoPaulo, limparEspacos, normalizar, urlHttpsSegura } from '../shared/text';

// É o link "RSS" que as próprias páginas do Planalto oferecem (ver tests/fixtures/agenda). O antigo
// ".../noticias/RSS" seguiu respondendo, mas parou em 27/09/2026.
export const URL_FEED_PLANALTO = 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/ultimas-noticias/RSS';

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

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, trimValues: true });

function listar(x: unknown): Record<string, unknown>[] {
  if (x === undefined || x === null || x === '') return [];
  return (Array.isArray(x) ? x : [x]) as Record<string, unknown>[];
}

function textoSimples(x: unknown): string {
  return limparEspacos(cheerio.load(`<div>${String(x ?? '')}</div>`)('div').text());
}

function dataDoItem(bruto: unknown): string | null {
  const s = String(bruto ?? '');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : dataSaoPaulo(d);
}

export function parsePlanaltoFeed(xml: string, coletadoEm: string): Comunicado[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const raiz = doc['rdf:RDF'] !== undefined ? doc['rdf:RDF'] : doc.rss?.channel;
  if (raiz === undefined) {
    throw new FeedLayoutError(
      'A resposta do Planalto não é um feed RSS/RDF (esperava a raiz "rdf:RDF" ou "rss > channel"); o endereço pode ter retornado uma página de erro ou o formato mudou.',
    );
  }
  const itens = listar(raiz?.item);
  const saida: Comunicado[] = [];
  for (const it of itens) {
    const url = urlHttpsSegura(String(it.link ?? ''));
    const titulo = textoSimples(it.title);
    const data = dataDoItem(it['dc:date'] ?? it.pubDate);
    if (!url || !titulo || !data) continue;
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? url;
    saida.push({ id: `planalto:${slug}`, data, titulo, resumo: textoSimples(it.description), url, coletadoEm });
  }
  if (itens.length > 0 && saida.length === 0) {
    throw new FeedLayoutError(
      `O feed do Planalto trouxe ${itens.length} item(ns), mas nenhum tem link https, título e data válidos; o formato do feed pode ter mudado.`,
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
