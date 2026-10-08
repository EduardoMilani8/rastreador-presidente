import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import type { Mandato } from '../shared/schema';
import { dataSaoPaulo, limparEspacos, normalizar, urlHttpsSegura } from '../shared/text';

export const URL_FEED_PLANALTO = 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/RSS';

export interface Comunicado {
  id: string;
  data: string;
  titulo: string;
  resumo: string;
  url: string;
  coletadoEm: string;
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
  const itens = listar(doc['rdf:RDF']?.item ?? doc.rss?.channel?.item);
  const saida: Comunicado[] = [];
  for (const it of itens) {
    const url = urlHttpsSegura(String(it.link ?? ''));
    const titulo = textoSimples(it.title);
    const data = dataDoItem(it['dc:date'] ?? it.pubDate);
    if (!url || !titulo || !data) continue;
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? url;
    saida.push({ id: `planalto:${slug}`, data, titulo, resumo: textoSimples(it.description), url, coletadoEm });
  }
  return saida;
}

// "Presidente" conta; "Presidente do/da/de X" (Senado, Câmara, empresa) não, exceto "da República".
const PRESIDENTE = /\bpresidente\b(?!\s+d[aoe]s?\s+(?!republica))/;

export function citaPresidente(texto: string, mandato: Mandato): boolean {
  const t = normalizar(texto).replace(/vice[- ]?presidente/g, ' ');
  if (PRESIDENTE.test(t)) return true;
  // O feed do governo escreve "Visita presidencial ...", "Participação presidencial ..." para as agendas do presidente.
  if (/\bpresidencial\b/.test(t)) return true;
  return mandato.nomes.some((n) => new RegExp(`\\b${normalizar(n)}\\b`).test(t));
}
