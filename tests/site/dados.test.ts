import { afterEach, describe, expect, it, vi } from 'vitest';
import { carregarDados } from '../../site/src/dados';
import type { Evento, Noticia } from '../../src/shared/schema';

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
    const d = await carregarDados({ aba: 'linha' });
    expect(d.incompleto).toBe(false);
    expect(d.eventos.map((e) => e.id).sort()).toEqual(['out', 'set']);
    expect(d.noticias).toEqual([]);
  });

  it('arquivo de mês com 404: incompleto=true e o outro mês continua', async () => {
    stubFetch({ ...BASE, 'data/eventos/2026-10.json': 404 });
    const d = await carregarDados({ aba: 'linha' });
    expect(d.incompleto).toBe(true);
    expect(d.eventos.map((e) => e.id)).toEqual(['set']);
  });

  it('arquivo de mês que não é array: incompleto=true', async () => {
    stubFetch({ ...BASE, 'data/eventos/2026-10.json': { x: 1 } });
    const d = await carregarDados({ aba: 'linha' });
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
    const d = await carregarDados({ aba: 'linha' });
    expect(d.incompleto).toBe(true);
    expect(d.eventos.map((e) => e.id)).toEqual(['set']);
  });

  it('meses.json com 404: incompleto=true e eventos vazios', async () => {
    stubFetch({ ...BASE, 'data/meses.json': 404 });
    const d = await carregarDados({ aba: 'linha' });
    expect(d.incompleto).toBe(true);
    expect(d.eventos).toEqual([]);
  });

  it('status.json com falha: incompleto=true e estado padrão', async () => {
    stubFetch({ ...BASE, 'data/status.json': 500 });
    const d = await carregarDados({ aba: 'linha' });
    expect(d.incompleto).toBe(true);
    expect(d.estado).toEqual({ fontes: {} });
    expect(d.eventos).toHaveLength(2);
  });

  it('item inválido dentro de mês válido é descartado sem marcar incompleto', async () => {
    stubFetch({ ...BASE, 'data/eventos/2026-10.json': [ev('out', '2026-10-05'), { id: 'lixo' }] });
    const d = await carregarDados({ aba: 'linha' });
    expect(d.incompleto).toBe(false);
    expect(d.eventos.map((e) => e.id).sort()).toEqual(['out', 'set']);
  });

  it('aba notícias com noticias.json 500: incompleto=true', async () => {
    stubFetch({ ...BASE, 'data/noticias.json': 500 });
    const d = await carregarDados({ aba: 'noticias' });
    expect(d.incompleto).toBe(true);
    expect(d.noticias).toEqual([]);
  });

  it('aba notícias ok carrega notícias; aba linha nunca busca noticias.json', async () => {
    const c1 = stubFetch(BASE);
    const d = await carregarDados({ aba: 'noticias' });
    expect(d.incompleto).toBe(false);
    expect(d.noticias).toHaveLength(1);
    expect(c1).toContain('data/noticias.json');
    const c2 = stubFetch({ ...BASE, 'data/noticias.json': 500 });
    const l = await carregarDados({ aba: 'linha' });
    expect(l.incompleto).toBe(false);
    expect(c2).not.toContain('data/noticias.json');
  });
});
