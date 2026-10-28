import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { citaPresidente, FeedLayoutError, parsePlanaltoPagina, URL_PAGINA_PLANALTO } from '../../src/collectors/planalto';
import type { Mandato } from '../../src/shared/schema';

const COLETA = '2026-10-08T12:00:00.000Z';
const MANDATO: Mandato = {
  presidente: 'Luiz Inácio Lula da Silva', nomes: ['Lula'], inicio: '2023-01-01', fim: null,
  agendaBase: 'https://www.gov.br/x',
};

const FIXTURE = readFileSync(resolve(process.cwd(), 'tests/fixtures/planalto/noticias-2026-10-27.html'), 'utf8');
const URL_LISTA = URL_PAGINA_PLANALTO;
const li = (titulo: string, href: string, data: string, resumo = 'Resumo') => `<li><div class="conteudo">
  <h2 class="titulo"><a href="${href}">${titulo}</a></h2>
  <span class="descricao"><span class="data">${data}</span><span> - </span>${resumo}</span></div></li>`;
const pagina = (...itens: string[]) => `<html><body><ul class="noticias listagem-noticias-com-foto">${itens.join('')}</ul></body></html>`;
const NOTICIA = 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/2026/10/';

describe('parsePlanaltoPagina (página real de 27/10/2026)', () => {
  const r = parsePlanaltoPagina(FIXTURE, URL_LISTA, COLETA);

  it('lê os 30 itens da lista, do mais novo (27/10) ao mais antigo (22/09)', () => {
    expect(r).toHaveLength(30);
    expect(r[0].data).toBe('2026-10-27');
    expect(r[29].data).toBe('2026-09-22');
  });

  it('monta id, título, resumo (sem a data) e link https da notícia', () => {
    expect(r[0]).toEqual({
      id: 'planalto:presidente-lula-celebra-aniversario-no-palacio-da-alvorada-201cgratidao-ao-povo-brasileiro201d',
      data: '2026-10-27',
      titulo: 'Presidente Lula celebra aniversário no Palácio da Alvorada: “Gratidão ao povo brasileiro”',
      resumo: 'Durante a comemoração, Lula ressaltou o compromisso com a continuidade das políticas sociais e com o desenvolvimento econômico',
      url: `${NOTICIA}presidente-lula-celebra-aniversario-no-palacio-da-alvorada-201cgratidao-ao-povo-brasileiro201d`,
      coletadoEm: COLETA,
    });
    for (const c of r) {
      expect(c.url.startsWith('https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/')).toBe(true);
      expect(c.resumo).not.toMatch(/^\d{2}\/\d{2}\/\d{4}|Tags:/);
    }
  });

  it('inclui as notícias de outubro que o feed antigo não trazia', () => {
    expect(r.map((c) => c.id)).toContain(
      'planalto:lula-sanciona-lei-que-amplia-beneficios-para-meis-e-envia-ao-congresso-pec-sobre-tarifa-zero-no-transporte-coletivo',
    );
  });
});

describe('parsePlanaltoPagina (casos de erro)', () => {
  it('descarta item sem data válida, sem título ou com link fora das notícias do Planalto', () => {
    const r = parsePlanaltoPagina(pagina(
      li('Válida', `${NOTICIA}valida`, '26/10/2026'),
      li('Sem data', `${NOTICIA}sem-data`, ''),
      li('Data impossível', `${NOTICIA}data-impossivel`, '31/02/2026'),
      li('', `${NOTICIA}sem-titulo`, '26/10/2026'),
      li('Link http', 'http://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/2026/10/x', '26/10/2026'),
      li('Outro site', 'https://golpe.example/planalto/pt-br/acompanhe-o-planalto/noticias/2026/10/x', '26/10/2026'),
      li('Outra seção', 'https://www.gov.br/planalto/pt-br/agenda/x', '26/10/2026'),
    ), URL_LISTA, COLETA);
    expect(r.map((c) => c.titulo)).toEqual(['Válida']);
  });

  it.each([
    ['página sem a lista (layout mudou)', '<html><body><h1>Notícias</h1></body></html>'],
    ['lista vazia', pagina()],
    ['texto puro', 'Service Unavailable'],
  ])('%s: lança FeedLayoutError, nunca "sem novidades"', (_nome, html) => {
    expect(() => parsePlanaltoPagina(html, URL_LISTA, COLETA)).toThrow(FeedLayoutError);
  });

  it('itens existem mas nenhum é válido: lança FeedLayoutError', () => {
    expect(() => parsePlanaltoPagina(pagina(li('Sem data', `${NOTICIA}x`, '')), URL_LISTA, COLETA)).toThrow(/nenhum/i);
  });

  it('redirecionada para outro endereço (ex.: login): lança FeedLayoutError com o destino', () => {
    const login = 'https://www.gov.br/planalto/acl_users/credentials_cookie_auth/require_login?came_from=x';
    expect(() => parsePlanaltoPagina(FIXTURE, login, COLETA)).toThrow(/redirecion.*require_login/);
  });

  it('aceita a página 2 da listagem (b_start) e a barra no fim do endereço', () => {
    expect(parsePlanaltoPagina(FIXTURE, `${URL_LISTA}?b_start:int=30`, COLETA)).toHaveLength(30);
    expect(parsePlanaltoPagina(FIXTURE, `${URL_LISTA}/`, COLETA)).toHaveLength(30);
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
