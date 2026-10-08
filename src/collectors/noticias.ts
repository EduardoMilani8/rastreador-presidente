import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import type { Mandato, Noticia } from '../shared/schema';
import { limparEspacos, urlHttpsSegura } from '../shared/text';
import { citaPresidente, FeedLayoutError } from './planalto';

export const URL_AGENCIA_BRASIL = 'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml';

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, trimValues: true });

export function urlBuscaGoogleNews(nome: string): string {
  const q = encodeURIComponent(`Presidente ${nome} when:7d`);
  return `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}

export function parseNoticias(xml: string, origem: Noticia['origem']): Noticia[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const canal = doc.rss?.channel;
  // Um canal vazio (<channel></channel>) vira '' e é um feed válido sem itens; só `undefined` indica
  // que a resposta não é um feed (página HTML de erro, texto puro, JSON, corpo vazio).
  if (canal === undefined) {
    throw new FeedLayoutError(
      `A resposta de notícias (${origem}) não é um feed RSS (esperava "rss > channel"); o endereço pode ter retornado uma página de erro ou o formato mudou.`,
    );
  }
  const bruto = canal?.item;
  const itens: Record<string, unknown>[] = bruto === undefined ? [] : Array.isArray(bruto) ? bruto : [bruto];
  const saida: Noticia[] = [];
  for (const it of itens) {
    const url = urlHttpsSegura(String(it.link ?? ''));
    const data = new Date(String(it.pubDate ?? ''));
    let titulo = limparEspacos(String(it.title ?? ''));
    const veiculo = limparEspacos(String(it.source ?? '')) || (origem === 'agencia-brasil' ? 'Agência Brasil' : '');
    if (!url || !titulo || !veiculo || Number.isNaN(data.getTime())) continue;
    if (titulo.endsWith(` - ${veiculo}`)) titulo = titulo.slice(0, -(veiculo.length + 3));
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 12);
    saida.push({ id: `${origem}:${hash}`, titulo, veiculo, data: data.toISOString(), url, origem });
  }
  if (itens.length > 0 && saida.length === 0) {
    throw new FeedLayoutError(
      `O feed de notícias (${origem}) trouxe ${itens.length} item(ns), mas nenhum tem link https, título e data válidos; o formato do feed pode ter mudado.`,
    );
  }
  return saida;
}

export function filtrarRelevantes(noticias: Noticia[], mandato: Mandato): Noticia[] {
  return noticias.filter((n) => n.origem !== 'agencia-brasil' || citaPresidente(n.titulo, mandato));
}
