import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFactcheck, urlBuscaFactcheck } from '../../src/collectors/factcheck';

const fixture = (nome: string) => readFileSync(`tests/fixtures/factcheck/${nome}`, 'utf8');

describe('urlBuscaFactcheck', () => {
  it('monta a busca sem a chave (ela vai no cabeçalho)', () => {
    const u = new URL(urlBuscaFactcheck({ consulta: 'Lula', site: 'aosfatos.org', maxDias: 30, pagina: 'CGQ' }));
    expect(u.origin + u.pathname).toBe('https://factchecktools.googleapis.com/v1alpha1/claims:search');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      query: 'Lula', languageCode: 'pt', pageSize: '100', reviewPublisherSiteFilter: 'aosfatos.org', maxAgeDays: '30', pageToken: 'CGQ',
    });
    expect(u.searchParams.has('key')).toBe(false);
  });

  it('sem limite de idade nem página, esses parâmetros não vão', () => {
    const u = new URL(urlBuscaFactcheck({ consulta: 'Lula', site: 'aosfatos.org' }));
    expect(u.searchParams.has('maxAgeDays')).toBe(false);
    expect(u.searchParams.has('pageToken')).toBe(false);
  });
});

describe('parseFactcheck (resposta real de 28/10/2026)', () => {
  it('achata cada par frase + checagem, com os campos como a agência publicou', () => {
    const { itens, proximaPagina } = parseFactcheck(fixture('todas-2026-10-28.json'));
    expect(proximaPagina).toBe('CGQ');
    expect(itens).toHaveLength(5);
    expect(itens[1]).toEqual({
      frase: 'Um senador da República que tem coragem de assinar uma petição defendendo o assassino de uma criança de cinco anos de idade',
      autor: 'Lula',
      dataFrase: '2026-10-01T00:00:00Z',
      url: 'https://www.aosfatos.org/noticias/checamos-entrevista-lula-ao-flow/',
      titulo: 'Checamos a entrevista de Lula ao Flow',
      dataChecagem: '2026-10-01T00:00:00Z',
      veredito: 'não_é_bem_assim',
      site: 'aosfatos.org',
      idioma: 'pt',
    });
    // item da UOL sem claimDate nem reviewDate: os campos ficam ausentes, não inventados
    expect(itens[3].dataFrase).toBeUndefined();
    expect(itens[3].dataChecagem).toBeUndefined();
  });

  it('Estadão sem reviewDate e com autor de boato vem como está (o filtro é do pipeline)', () => {
    const { itens } = parseFactcheck(fixture('estadao-2026-10-28.json'));
    expect(itens.map((i) => i.autor)).toEqual(['Redes Sociais', 'Redes Sociais', 'uniaopatriotabrasil']);
    expect(itens.every((i) => i.dataChecagem === undefined)).toBe(true);
  });

  it('lista vazia com nextPageToken null é resposta válida sem itens', () => {
    expect(parseFactcheck(fixture('vazio-agencialupa-2026-10-28.json'))).toEqual({ itens: [] });
    expect(parseFactcheck('{}')).toEqual({ itens: [] });
  });

  it('frase com várias checagens vira um item por checagem; checagem sem URL ou sem veredito é pulada', () => {
    const corpo = JSON.stringify({ claims: [{
      text: 'Frase', claimant: 'Lula', claimReview: [
        { url: 'https://a.test/1', textualRating: 'falso' },
        { url: 'https://a.test/2', textualRating: 'verdadeiro' },
        { textualRating: 'falso' },
        { url: 'https://a.test/3' },
      ],
    }] });
    expect(parseFactcheck(corpo).itens.map((i) => i.url)).toEqual(['https://a.test/1', 'https://a.test/2']);
  });

  it('erro da API vira erro da fonte, com código e mensagem', () => {
    const corpo = '{"error":{"code":503,"status":"UNAVAILABLE","message":"The service is currently unavailable."}}';
    expect(() => parseFactcheck(corpo)).toThrow(/Fact Check API: 503 UNAVAILABLE.*currently unavailable/);
  });

  it('chave recusada tem mensagem que diz o que fazer, sem repetir a chave', () => {
    const corpo = '{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"API key not valid. Please pass a valid API key.","details":[{"reason":"API_KEY_INVALID"}]}}';
    const erro = (() => { try { parseFactcheck(corpo); return ''; } catch (e) { return String(e); } })();
    expect(erro).toMatch(/chave da Fact Check API recusada; confira o segredo FACTCHECK_API_KEY/);
  });

  it.each([
    ['HTML no lugar de JSON', '<html><body>erro</body></html>'],
    ['JSON que não é objeto', '[1,2]'],
    ['claims que não é lista', '{"claims":{"a":1}}'],
    ['corpo vazio', ''],
  ])('%s é erro da fonte, nunca lista vazia', (_nome, corpo) => {
    expect(() => parseFactcheck(corpo)).toThrow(/Fact Check API/);
  });
});
