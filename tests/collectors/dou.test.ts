import { describe, expect, it } from 'vitest';
import { DouLayoutError, parseDou, urlDouEdicao, urlTextoPlanalto } from '../../src/collectors/dou';

const COLETA = '2026-10-08T12:00:00.000Z';
const item = (o: Record<string, string>) => ({
  pubName: 'DO1', pubDate: '07/10/2026', content: '', artType: 'Decreto numerado',
  hierarchyStr: 'Atos do Poder Executivo', ...o,
});
const html = (itens: object[]) =>
  `<html><body><script id="params" type="application/json">${JSON.stringify({ jsonArray: itens })}</script></body></html>`;

const DECRETO = item({
  title: 'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026',
  urlTitle: 'decreto-n-13.132-de-6-de-outubro-de-2026-736937325',
  content: 'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026 Autoriza o ingresso e a permanência temporária de forças militares no território nacional. O PRESIDENTE DA REPÚBLICA, no uso da atribuição que lhe confere o art. 84',
});
const LEI = item({
  title: 'LEI Nº 15.999, DE 6 DE OUTUBRO DE 2026', urlTitle: 'lei-n-15.999-de-6-de-outubro-de-2026-700000001',
  artType: 'Lei', hierarchyStr: 'Atos do Poder Legislativo',
  content: 'LEI Nº 15.999, DE 6 DE OUTUBRO DE 2026 Dispõe sobre algo. O PRESIDENTE DA REPÚBLICA Faço saber que o Congresso Nacional decreta',
});
const RESOLUCAO = item({
  title: 'RESOLUÇÃO GECEX Nº 971, DE 6 DE OUTUBRO DE 2026', urlTitle: 'resolucao-gecex-n-971-736952867',
  artType: 'Resolução', hierarchyStr: 'Presidência da República/Câmara de Comércio Exterior',
});
const DECRETO_LEGISLATIVO = item({
  title: 'DECRETO LEGISLATIVO Nº 12, DE 5 DE OUTUBRO DE 2026', urlTitle: 'dl-12-700000002',
  hierarchyStr: 'Atos do Poder Legislativo',
});
const DECRETO_SEM_NUMERO = item({
  title: 'DECRETO DE 6 DE OUTUBRO DE 2026', urlTitle: 'decreto-de-6-700000003',
  artType: 'Decreto não numerado',
});

describe('urlDouEdicao', () => {
  it('formata a data como DD-MM-AAAA', () => {
    expect(urlDouEdicao('2026-10-07')).toBe('https://www.in.gov.br/leiturajornal?data=07-10-2026&secao=do1');
  });
});

describe('parseDou', () => {
  it('mantém só decretos numerados, leis e MPs; descarta o resto', () => {
    const r = parseDou(html([DECRETO, LEI, RESOLUCAO, DECRETO_LEGISLATIVO, DECRETO_SEM_NUMERO]), '2026-10-07', COLETA);
    expect(r.map((e) => e.titulo)).toEqual([
      'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026',
      'LEI Nº 15.999, DE 6 DE OUTUBRO DE 2026',
    ]);
  });

  it('preenche id, datas, ementa, status e fonte do decreto', () => {
    const [d] = parseDou(html([DECRETO]), '2026-10-07', COLETA);
    expect(d).toMatchObject({
      id: 'dou:decreto-n-13.132-de-6-de-outubro-de-2026-736937325',
      tipo: 'ato', data: '2026-10-07', status: 'publicado',
      datasAto: { assinatura: '2026-10-06', publicacao: '2026-10-07' },
    });
    expect(d.ementa).toBe('Autoriza o ingresso e a permanência temporária de forças militares no território nacional.');
    expect(d.fontes[0]).toMatchObject({
      nome: 'dou', rotulo: 'Diário Oficial da União',
      url: 'https://www.in.gov.br/web/dou/-/decreto-n-13.132-de-6-de-outubro-de-2026-736937325',
    });
  });

  it('lança DouLayoutError quando o JSON embutido não existe ou não é lista', () => {
    expect(() => parseDou('<html></html>', '2026-10-07', COLETA)).toThrow(DouLayoutError);
    expect(() => parseDou('<script id="params">{"jsonArray": 5}</script>', '2026-10-07', COLETA)).toThrow(DouLayoutError);
  });

  it('edição sem atos devolve lista vazia', () => {
    expect(parseDou(html([]), '2026-10-07', COLETA)).toEqual([]);
  });
});

describe('urlTextoPlanalto', () => {
  it('monta a URL do decreto (padrão verificado em 2023)', () => {
    expect(urlTextoPlanalto('DECRETO Nº 11.369, DE 1º DE JANEIRO DE 2023', '2023-01-01'))
      .toBe('https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/decreto/D11369.htm');
  });
  it('monta a URL da lei', () => {
    expect(urlTextoPlanalto('LEI Nº 14.663, DE 28 DE AGOSTO DE 2023', '2023-08-28'))
      .toBe('https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/L14663.htm');
  });
  it('usa a legislatura certa a partir de 2027', () => {
    expect(urlTextoPlanalto('DECRETO Nº 20.000, DE 2 DE JANEIRO DE 2027', '2027-01-02'))
      .toBe('https://www.planalto.gov.br/ccivil_03/_ato2027-2030/2027/decreto/D20000.htm');
  });
  it('devolve null para lei complementar, MP e sem data', () => {
    expect(urlTextoPlanalto('LEI COMPLEMENTAR Nº 200, DE 1 DE JANEIRO DE 2023', '2023-01-01')).toBeNull();
    expect(urlTextoPlanalto('MEDIDA PROVISÓRIA Nº 1.333, DE 7 DE JANEIRO DE 2026', '2026-01-07')).toBeNull();
    expect(urlTextoPlanalto('DECRETO Nº 1, DE 1 DE JANEIRO', undefined)).toBeNull();
  });
});
