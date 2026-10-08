import { describe, expect, it } from 'vitest';
import { filtrarRelevantes, parseNoticias, urlBuscaGoogleNews } from '../../src/collectors/noticias';
import { FeedLayoutError } from '../../src/collectors/planalto';
import type { Mandato } from '../../src/shared/schema';

const MANDATO: Mandato = {
  presidente: 'Luiz Inácio Lula da Silva', nomes: ['Lula'], inicio: '2023-01-01', fim: null,
  agendaBase: 'https://www.gov.br/x',
};

const GOOGLE = `<rss version="2.0"><channel>
<item><title>Bolsa Família: o que Lula propõe - BBC</title><link>https://news.google.com/rss/articles/abc</link>
<pubDate>Thu, 08 Oct 2026 08:54:57 GMT</pubDate><source url="https://www.bbc.com">BBC</source></item>
<item><title>Sem link seguro</title><link>http://x.test/a</link><pubDate>Thu, 08 Oct 2026 08:00:00 GMT</pubDate></item>
<item><title>Data inválida - Folha</title><link>https://news.google.com/rss/articles/def</link><pubDate>ontem</pubDate><source url="https://f.com">Folha</source></item>
</channel></rss>`;

const AGENCIA = `<rss version="2.0"><channel>
<item><title>Presidente sanciona lei</title><link>https://agenciabrasil.ebc.com.br/politica/noticia/1</link><pubDate>Thu, 08 Oct 2026 09:00:00 -0300</pubDate></item>
<item><title>Senado aprova projeto</title><link>https://agenciabrasil.ebc.com.br/politica/noticia/2</link><pubDate>Thu, 08 Oct 2026 09:10:00 -0300</pubDate></item>
</channel></rss>`;

describe('parseNoticias', () => {
  it('lê o Google News: remove o veículo do título e converte a data', () => {
    const r = parseNoticias(GOOGLE, 'google-news');
    expect(r).toHaveLength(1); // descarta link http e data inválida
    expect(r[0]).toMatchObject({
      titulo: 'Bolsa Família: o que Lula propõe', veiculo: 'BBC', origem: 'google-news',
      data: '2026-10-08T08:54:57.000Z', url: 'https://news.google.com/rss/articles/abc',
    });
    expect(r[0].id).toMatch(/^google-news:[0-9a-f]{12}$/);
  });
  it('ids são estáveis entre leituras', () => {
    expect(parseNoticias(GOOGLE, 'google-news')[0].id).toBe(parseNoticias(GOOGLE, 'google-news')[0].id);
  });
  it('Agência Brasil usa o nome da agência como veículo', () => {
    const r = parseNoticias(AGENCIA, 'agencia-brasil');
    expect(r.map((n) => n.veiculo)).toEqual(['Agência Brasil', 'Agência Brasil']);
  });
});

describe('parseNoticias com resposta que não é feed', () => {
  it('página HTML de erro lança FeedLayoutError (em vez de "sem notícias")', () => {
    const html = '<!doctype html><html><head><title>503</title></head><body><h1>Serviço indisponível</h1></body></html>';
    expect(() => parseNoticias(html, 'google-news')).toThrow(FeedLayoutError);
    expect(() => parseNoticias(html, 'agencia-brasil')).toThrow(FeedLayoutError);
  });
  it('texto vazio lança FeedLayoutError', () => {
    expect(() => parseNoticias('', 'google-news')).toThrow(FeedLayoutError);
  });
  it('texto puro e JSON lançam FeedLayoutError', () => {
    expect(() => parseNoticias('Too Many Requests', 'google-news')).toThrow(FeedLayoutError);
    expect(() => parseNoticias('{"erro":"limite excedido"}', 'agencia-brasil')).toThrow(FeedLayoutError);
  });
  it('canal vazio e válido devolve lista vazia, sem erro', () => {
    expect(parseNoticias('<rss version="2.0"><channel></channel></rss>', 'google-news')).toEqual([]);
    expect(parseNoticias('<rss version="2.0"><channel><title>x</title></channel></rss>', 'agencia-brasil')).toEqual([]);
  });
  it('itens presentes mas todos inválidos lançam FeedLayoutError', () => {
    const soHttp = `<rss version="2.0"><channel>
<item><title>Sem link seguro</title><link>http://x.test/a</link><pubDate>Thu, 08 Oct 2026 08:00:00 GMT</pubDate></item>
</channel></rss>`;
    expect(() => parseNoticias(soHttp, 'google-news')).toThrow(FeedLayoutError);
  });
  it('mensagem do erro está em português', () => {
    expect(() => parseNoticias('', 'google-news')).toThrow(/não é um feed RSS/);
  });
});

describe('filtrarRelevantes', () => {
  it('na Agência Brasil mantém só o que cita o presidente', () => {
    const r = filtrarRelevantes(parseNoticias(AGENCIA, 'agencia-brasil'), MANDATO);
    expect(r.map((n) => n.titulo)).toEqual(['Presidente sanciona lei']);
  });
  it('no Google News mantém tudo (a busca já é sobre o presidente)', () => {
    const g = parseNoticias(GOOGLE, 'google-news');
    expect(filtrarRelevantes(g, MANDATO)).toEqual(g);
  });
});

describe('urlBuscaGoogleNews', () => {
  it('codifica a consulta e fixa português do Brasil', () => {
    const u = urlBuscaGoogleNews('Lula');
    expect(u).toContain('news.google.com/rss/search?q=Presidente%20Lula%20when%3A7d');
    expect(u).toContain('hl=pt-BR');
  });
});
