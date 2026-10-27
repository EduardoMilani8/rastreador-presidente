import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { citaPresidente, FeedLayoutError, parsePlanaltoFeed, URL_FEED_PLANALTO } from '../../src/collectors/planalto';
import type { Mandato } from '../../src/shared/schema';

const COLETA = '2026-10-08T12:00:00.000Z';
const MANDATO: Mandato = {
  presidente: 'Luiz Inácio Lula da Silva', nomes: ['Lula'], inicio: '2023-01-01', fim: null,
  agendaBase: 'https://www.gov.br/x',
};

const RDF = `<?xml version="1.0" encoding="utf-8" ?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns="http://purl.org/rss/1.0/">
<channel rdf:about="https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/RSS"><title>Notícias</title></channel>
<item rdf:about="https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/2026/09/presidente-visita-hospital-em-barretos">
  <title>Presidente visita o Hospital de Amor, em Barretos (SP)</title>
  <link>https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/2026/09/presidente-visita-hospital-em-barretos</link>
  <description>&lt;p&gt;O presidente esteve em &lt;b&gt;Barretos&lt;/b&gt;.&lt;/p&gt;</description>
  <dc:date>2026-09-08T17:22:00-03:00</dc:date>
</item>
<item rdf:about="http://inseguro.test/x">
  <title>Item com link http</title><link>http://inseguro.test/x</link><description></description>
  <dc:date>2026-09-08T10:00:00-03:00</dc:date>
</item>
</rdf:RDF>`;

describe('URL_FEED_PLANALTO', () => {
  it('é o link "RSS" que a própria página do Planalto oferece (página real de 04/10/2026)', () => {
    const html = readFileSync(resolve(process.cwd(), 'tests/fixtures/agenda/2026-10-04.404.html'), 'utf8');
    const links = [...html.matchAll(/href="([^"]+\/RSS)"/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    expect(new Set(links)).toEqual(new Set([URL_FEED_PLANALTO]));
  });
});

describe('parsePlanaltoFeed', () => {
  it('lê itens RDF, limpa HTML da descrição e usa a data de São Paulo', () => {
    const r = parsePlanaltoFeed(RDF, COLETA);
    expect(r).toHaveLength(1); // o item com link http é descartado
    expect(r[0]).toEqual({
      id: 'planalto:presidente-visita-hospital-em-barretos',
      data: '2026-09-08',
      titulo: 'Presidente visita o Hospital de Amor, em Barretos (SP)',
      resumo: 'O presidente esteve em Barretos.',
      url: 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/2026/09/presidente-visita-hospital-em-barretos',
      coletadoEm: COLETA,
    });
  });

  it('aceita RSS 2.0 com pubDate', () => {
    const rss = `<rss version="2.0"><channel><item><title>Presidente recebe ministro</title>
      <link>https://www.gov.br/planalto/n/presidente-recebe</link><description>x</description>
      <pubDate>Tue, 08 Sep 2026 23:30:00 -0300</pubDate></item></channel></rss>`;
    const r = parsePlanaltoFeed(rss, COLETA);
    expect(r[0].data).toBe('2026-09-08');
    expect(r[0].id).toBe('planalto:presidente-recebe');
  });

  it('feed vazio devolve lista vazia', () => {
    expect(parsePlanaltoFeed('<rdf:RDF xmlns:rdf="x"></rdf:RDF>', COLETA)).toEqual([]);
  });

  it('RSS 2.0 válido sem itens devolve lista vazia', () => {
    expect(parsePlanaltoFeed('<rss version="2.0"><channel><title>x</title></channel></rss>', COLETA)).toEqual([]);
  });

  it.each([
    ['página HTML de erro', '<html><head><title>503</title></head><body><h1>Serviço indisponível</h1></body></html>'],
    ['texto puro', 'Service Unavailable'],
    ['string vazia', ''],
    ['JSON', '{"erro": "indisponivel"}'],
    ['raiz sem o prefixo rdf:', '<RDF><item><title>x</title></item></RDF>'],
    ['RSS sem channel', '<rss version="2.0"></rss>'],
  ])('%s não é um feed: lança FeedLayoutError (e não "sem novidades")', (_nome, xml) => {
    expect(() => parsePlanaltoFeed(xml, COLETA)).toThrow(FeedLayoutError);
  });

  it.each([
    ['<html><head><title>Últimas Notícias — Planalto</title></head><body></body></html>', 'raiz <html>, título "Últimas Notícias — Planalto"'],
    ['<feed xmlns="http://www.w3.org/2005/Atom"><title>Notícias</title></feed>', 'raiz <feed>, título "Notícias"'],
    ['Service Unavailable', 'texto sem elemento XML'],
    ['', 'resposta vazia'],
  ])('a mensagem diz o que veio no lugar do feed: %s', (xml, esperado) => {
    expect(() => parsePlanaltoFeed(xml, COLETA)).toThrow(`Veio: ${esperado}.`);
  });

  it('itens existem mas nenhum é válido: lança FeedLayoutError', () => {
    const rdf = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <item><title>Só http</title><link>http://inseguro.test/x</link><dc:date>2026-09-08T10:00:00-03:00</dc:date></item>
      <item><title>Sem data</title><link>https://www.gov.br/planalto/n/sem-data</link></item>
      <item><title></title><link>https://www.gov.br/planalto/n/sem-titulo</link><dc:date>2026-09-08T10:00:00-03:00</dc:date></item>
    </rdf:RDF>`;
    expect(() => parsePlanaltoFeed(rdf, COLETA)).toThrow(FeedLayoutError);
    expect(() => parsePlanaltoFeed(rdf, COLETA)).toThrow(/nenhum/i);
  });

  it('o erro tem o nome FeedLayoutError', () => {
    try {
      parsePlanaltoFeed('Service Unavailable', COLETA);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).name).toBe('FeedLayoutError');
    }
  });
});

describe('citaPresidente', () => {
  it.each([
    ['Presidente da República visita as obras do Cinturão das Águas', true],
    ['Presidente visita o Diretório de Reabilitação Moderna (DREAM)', true],
    ['Presidente Lula inaugura escola', true],
    ['Lula e o presidente do BNDES assinam contrato', true],
    ['Visita presidencial ao Hospital X, em Barretos (SP)', true],
    ['Participação presidencial em encontro do MTST em Taboão da Serra (SP)', true],
  ])('%s -> %s', (texto, esperado) => {
    expect(citaPresidente(texto, MANDATO)).toBe(esperado);
  });

  it.each([
    'Presidente do Senado recebe ministros',
    'Presidente da Câmara anuncia pauta',
    'Presidente da Petrobras anuncia investimento',
    'Vice-Presidente participa de cerimônia',
    'Governo lamenta morte do ex-presidente Itamar Franco',
    'Ex-Presidente Bolsonaro depõe',
    'Presidente-executivo da Vale anuncia investimento',
    'Presidente executivo da Embraer visita fábrica',
    'Presidente interino do Senado abre sessão',
    'Presidente eleito da Câmara toma posse',
    'Presidente em exercício do Senado recebe ministros',
    'Governo federal apresenta nova etapa do Plano Brasil Soberano',
    'Visita presencial ao Centro Industrial Nuclear de Aramar, em Iperó (SP)',
  ])('não considera relevante: %s', (texto) => {
    expect(citaPresidente(texto, MANDATO)).toBe(false);
  });
});
