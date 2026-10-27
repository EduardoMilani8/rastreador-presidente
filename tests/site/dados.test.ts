import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import '../../site/src/zod-sem-eval';
import { carregarDados } from '../../site/src/dados';
import type { Evento, Noticia, Viagem } from '../../src/shared/schema';

const T = '2026-10-08T12:00:00.000Z';
const ev = (id: string, data: string): Evento => ({
  id, tipo: 'agenda', data, titulo: id, status: 'realizado',
  fontes: [{ nome: 'n', rotulo: 'r', url: 'https://x.test/a', coletadoEm: T }],
  confirmadoPor: [], historico: [],
});
const noticia: Noticia = {
  id: 'n1', titulo: 'Notícia', veiculo: 'Veículo', data: T, url: 'https://x.test/n', origem: 'agencia-brasil',
};
const STATUS = { fontes: { n: { ok: true, desde: T } } };

type Resp = unknown | number;
function stubFetch(mapa: Record<string, Resp>) {
  const chamadas: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    chamadas.push(url);
    const r = mapa[url];
    if (r === undefined) return new Response('nope', { status: 404 });
    if (typeof r === 'number') return new Response('erro', { status: r });
    return new Response(JSON.stringify(r), { status: 200 });
  });
  return chamadas;
}

const BASE: Record<string, Resp> = {
  'data/meses.json': ['2026-10', '2026-09', '2026-08'],
  'data/eventos/2026-10.json': [ev('out', '2026-10-05')],
  'data/eventos/2026-09.json': [ev('set', '2026-09-20')],
  'data/eventos/2026-08.json': [ev('ago', '2026-08-20')],
  'data/status.json': STATUS,
  'data/noticias.json': [noticia],
};

afterEach(() => vi.unstubAllGlobals());

describe('carregarDados', () => {
  it('tudo ok: eventos dos 2 meses mais novos e incompleto=false', async () => {
    stubFetch(BASE);
    const d = await carregarDados({});
    expect(d.incompleto).toBe(false);
    expect(d.eventos.map((e) => e.id).sort()).toEqual(['out', 'set']);
    expect(d.noticias).toEqual([]);
  });

  it('arquivo de mês com 404: incompleto=true e o outro mês continua', async () => {
    stubFetch({ ...BASE, 'data/eventos/2026-10.json': 404 });
    const d = await carregarDados({});
    expect(d.incompleto).toBe(true);
    expect(d.eventos.map((e) => e.id)).toEqual(['set']);
  });

  it('arquivo de mês que não é array: incompleto=true', async () => {
    stubFetch({ ...BASE, 'data/eventos/2026-10.json': { x: 1 } });
    const d = await carregarDados({});
    expect(d.incompleto).toBe(true);
    expect(d.eventos.map((e) => e.id)).toEqual(['set']);
  });

  it('erro de rede no mês: incompleto=true sem lançar', async () => {
    stubFetch(BASE);
    const ok = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === 'data/eventos/2026-10.json') throw new TypeError('rede');
      return ok(url);
    });
    const d = await carregarDados({});
    expect(d.incompleto).toBe(true);
    expect(d.eventos.map((e) => e.id)).toEqual(['set']);
  });

  it('meses.json com 404: incompleto=true e eventos vazios', async () => {
    stubFetch({ ...BASE, 'data/meses.json': 404 });
    const d = await carregarDados({});
    expect(d.incompleto).toBe(true);
    expect(d.eventos).toEqual([]);
  });

  it('status.json com falha: incompleto=true e estado padrão', async () => {
    stubFetch({ ...BASE, 'data/status.json': 500 });
    const d = await carregarDados({});
    expect(d.incompleto).toBe(true);
    expect(d.estado).toEqual({ fontes: {} });
    expect(d.eventos).toHaveLength(2);
  });

  it('item inválido dentro de mês válido é descartado sem marcar incompleto', async () => {
    stubFetch({ ...BASE, 'data/eventos/2026-10.json': [ev('out', '2026-10-05'), { id: 'lixo' }] });
    const d = await carregarDados({});
    expect(d.incompleto).toBe(false);
    expect(d.eventos.map((e) => e.id).sort()).toEqual(['out', 'set']);
  });

  it('página de notícias com noticias.json 500: incompleto=true', async () => {
    stubFetch({ ...BASE, 'data/noticias.json': 500 });
    const d = await carregarDados({}, { noticias: true });
    expect(d.incompleto).toBe(true);
    expect(d.noticias).toEqual([]);
  });

  it('com a opção noticias carrega notícias; sem ela nunca busca noticias.json', async () => {
    const c1 = stubFetch(BASE);
    const d = await carregarDados({}, { noticias: true });
    expect(d.incompleto).toBe(false);
    expect(d.noticias).toHaveLength(1);
    expect(c1).toContain('data/noticias.json');
    const c2 = stubFetch({ ...BASE, 'data/noticias.json': 500 });
    const l = await carregarDados({});
    expect(l.incompleto).toBe(false);
    expect(c2).not.toContain('data/noticias.json');
    expect(l.noticias).toEqual([]);
    const c3 = stubFetch(BASE);
    expect((await carregarDados({}, { noticias: false })).noticias).toEqual([]);
    expect(c3).not.toContain('data/noticias.json');
  });
});

describe('carregarDados: meses carregados e disponíveis (I5)', () => {
  it('sem datas: carrega os 2 meses mais novos e informa todos os disponíveis', async () => {
    stubFetch(BASE);
    const d = await carregarDados({ tipo: 'ato' });
    expect(d.mesesCarregados).toEqual(['2026-10', '2026-09']);
    expect(d.mesesDisponiveis).toEqual(['2026-10', '2026-09', '2026-08']);
  });
  it('com datas: carrega só os meses do intervalo', async () => {
    stubFetch(BASE);
    const d = await carregarDados({ de: '2026-08-15', ate: '2026-09-10' });
    expect(d.mesesCarregados).toEqual(['2026-09', '2026-08']);
    expect(d.eventos.map((e) => e.id).sort()).toEqual(['ago', 'set']);
  });
  it('meses.json fora de ordem não muda o resultado', async () => {
    stubFetch({ ...BASE, 'data/meses.json': ['2026-08', '2026-10', '2026-09'] });
    const d = await carregarDados({});
    expect(d.mesesCarregados).toEqual(['2026-10', '2026-09']);
    expect(d.mesesDisponiveis).toEqual(['2026-10', '2026-09', '2026-08']);
  });
  it('mês que falhou ao carregar continua contando como consultado (o aviso de incompleto cobre a falha)', async () => {
    stubFetch({ ...BASE, 'data/eventos/2026-09.json': 500 });
    const d = await carregarDados({});
    expect(d.incompleto).toBe(true);
    expect(d.mesesCarregados).toEqual(['2026-10', '2026-09']);
  });
  it('meses.json indisponível: listas vazias', async () => {
    stubFetch({ ...BASE, 'data/meses.json': 404 });
    const d = await carregarDados({});
    expect(d.mesesCarregados).toEqual([]);
    expect(d.mesesDisponiveis).toEqual([]);
  });
});

describe('carregarDados: resumo.json opcional', () => {
  const RESUMO = { total: 8540, porTipo: { agenda: 5468, ato: 3044, comunicado: 28 }, desde: '2023-01-01' };

  it('lê resumo.json válido quando a opção é pedida', async () => {
    stubFetch({ ...BASE, 'data/resumo.json': RESUMO });
    const d = await carregarDados({}, { resumo: true });
    expect(d.resumo).toEqual(RESUMO);
    expect(d.incompleto).toBe(false);
  });

  it.each([
    ['404', undefined],
    ['500', 500],
    ['JSON inválido', 'texto'],
    ['campo faltando', { total: 1, porTipo: { agenda: 1, ato: 0 }, desde: '2023-01-01' }],
    ['data malformada', { ...RESUMO, desde: '01/01/2023' }],
  ])('%s: resumo indefinido e incompleto=false', async (_nome, resp) => {
    const mapa = { ...BASE };
    if (resp !== undefined) mapa['data/resumo.json'] = resp;
    stubFetch(mapa);
    const d = await carregarDados({}, { resumo: true });
    expect(d.resumo).toBeUndefined();
    expect(d.incompleto).toBe(false);
  });

  it('sem a opção o arquivo nem é pedido', async () => {
    const chamadas = stubFetch({ ...BASE, 'data/resumo.json': RESUMO });
    const d = await carregarDados({});
    expect(chamadas).not.toContain('data/resumo.json');
    expect(d.resumo).toBeUndefined();
  });
});

describe('carregarDados: viagens.json opcional', () => {
  const VIAGEM: Viagem = {
    id: 'paris-fr', cidade: 'Paris', pais: 'França', lat: 48.86, lon: 2.35,
    compromissos: 32, dias: 7, primeiroDia: '2023-06-22', ultimoDia: '2025-06-07',
  };
  const OUTRA: Viagem = { ...VIAGEM, id: 'lima-pe', cidade: 'Lima', pais: 'Peru' };

  it('lê viagens válidas quando a opção é pedida', async () => {
    stubFetch({ ...BASE, 'data/viagens.json': [VIAGEM, OUTRA] });
    const d = await carregarDados({}, { viagens: true });
    expect(d.viagens).toEqual([VIAGEM, OUTRA]);
    expect(d.incompleto).toBe(false);
  });

  it.each([
    ['404', undefined],
    ['500', 500],
    ['JSON inválido', 'texto'],
    ['corpo que não é lista', { cidades: [VIAGEM] }],
  ])('%s: lista vazia e incompleto=false', async (_nome, resp) => {
    const mapa = { ...BASE };
    if (resp !== undefined) mapa['data/viagens.json'] = resp;
    stubFetch(mapa);
    const d = await carregarDados({}, { viagens: true });
    expect(d.viagens).toEqual([]);
    expect(d.incompleto).toBe(false);
  });

  it('item inválido no meio é descartado e os outros ficam', async () => {
    stubFetch({ ...BASE, 'data/viagens.json': [VIAGEM, { ...OUTRA, lat: 123 }, { id: 'lixo' }, OUTRA] });
    const d = await carregarDados({}, { viagens: true });
    expect(d.viagens.map((v) => v.id)).toEqual(['paris-fr', 'lima-pe']);
    expect(d.incompleto).toBe(false);
  });

  it('sem a opção o arquivo nem é pedido', async () => {
    const chamadas = stubFetch({ ...BASE, 'data/viagens.json': [VIAGEM] });
    const d = await carregarDados({});
    expect(chamadas).not.toContain('data/viagens.json');
    expect(d.viagens).toEqual([]);
  });
});

describe('zod no navegador', () => {
  it('roda sem gerar código (jitless): a CSP proíbe eval e o zod nem tenta', () => {
    expect(z.config().jitless).toBe(true);
  });

  it('a configuração é o primeiro import de cada entrada, antes de qualquer esquema ser criado', () => {
    for (const arquivo of readdirSync('site/src').filter((a) => /^main-.*\.ts$/.test(a))) {
      const primeiro = readFileSync(`site/src/${arquivo}`, 'utf8').match(/^import [^;]+;/m)?.[0];
      expect(primeiro, arquivo).toBe("import './zod-sem-eval';");
    }
  });
});
