import { describe, expect, it } from 'vitest';
import { citaPresidente, parsePlanaltoFeed } from '../../src/collectors/planalto';
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
    'Governo federal apresenta nova etapa do Plano Brasil Soberano',
    'Visita presencial ao Centro Industrial Nuclear de Aramar, em Iperó (SP)',
  ])('não considera relevante: %s', (texto) => {
    expect(citaPresidente(texto, MANDATO)).toBe(false);
  });
});
