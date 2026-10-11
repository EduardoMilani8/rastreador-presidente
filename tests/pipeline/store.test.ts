import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gravarEventos, gravarEstado, gravarNoticias, lerEventos, lerEstado, lerNoticias } from '../../src/pipeline/store';
import type { Evento, Noticia } from '../../src/shared/schema';

const T = '2026-10-08T12:00:00.000Z';
const ev = (id: string, data: string, hora?: string): Evento => ({
  id, tipo: 'agenda', data, hora, titulo: id, status: 'agendado',
  fontes: [{ nome: 'n', rotulo: 'r', url: 'https://x.test/a', coletadoEm: T }], confirmadoPor: [], historico: [],
});
const dir = () => mkdtemp(join(tmpdir(), 'rp-'));

describe('eventos', () => {
  it('grava um arquivo por mês, ordenado, mais meses.json em ordem decrescente', async () => {
    const d = await dir();
    await gravarEventos(d, [ev('b', '2026-10-08', '10:00'), ev('a', '2026-10-08', '09:00'), ev('c', '2026-09-30')]);
    expect((await readdir(join(d, 'eventos'))).sort()).toEqual(['2026-09.json', '2026-10.json']);
    expect(JSON.parse(await readFile(join(d, 'meses.json'), 'utf8'))).toEqual(['2026-10', '2026-09']);
    const out = JSON.parse(await readFile(join(d, 'eventos', '2026-10.json'), 'utf8')) as Evento[];
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
  });
  it('ida e volta preserva os eventos', async () => {
    const d = await dir();
    const lista = [ev('a', '2026-10-08', '09:00')];
    await gravarEventos(d, lista);
    expect(await lerEventos(d)).toEqual(lista);
  });
  it('segunda gravação idêntica não altera nenhum arquivo', async () => {
    const d = await dir();
    const lista = [ev('a', '2026-10-08', '09:00')];
    expect(await gravarEventos(d, lista)).toBeGreaterThan(0);
    expect(await gravarEventos(d, lista)).toBe(0);
  });
  it('recusa dados inválidos e não grava nada', async () => {
    const d = await dir();
    const ruim = { ...ev('a', '2026-10-08'), fontes: [] };
    await expect(gravarEventos(d, [ruim as Evento])).rejects.toThrow();
    expect(await lerEventos(d)).toEqual([]);
  });
  it('lerEventos devolve [] quando a pasta não existe', async () => {
    expect(await lerEventos(join(await dir(), 'nada'))).toEqual([]);
  });
});

describe('notícias', () => {
  const n = (id: string, data: string): Noticia => ({
    id, titulo: id, veiculo: 'BBC', data, url: 'https://x.test/n', origem: 'google-news',
  });
  it('mescla por id, descarta as mais velhas que 14 dias e ordena por data desc', async () => {
    const d = await dir();
    await gravarNoticias(d, [n('a', '2026-10-07T10:00:00.000Z'), n('velha', '2026-09-01T10:00:00.000Z')], '2026-10-08');
    await gravarNoticias(d, [n('b', '2026-10-08T09:00:00.000Z'), n('a', '2026-10-07T10:00:00.000Z')], '2026-10-08');
    expect((await lerNoticias(d)).map((x) => x.id)).toEqual(['b', 'a']);
  });
  // Caso real (out/2026): a mesma matéria da Agência Brasil chega pelo feed dela e pelo Google Notícias.
  const TITULO = 'Ato pela reeleição de Lula leva milhares à Avenida Paulista';
  const ab = (id: string, titulo: string, data: string): Noticia => ({
    id, titulo, veiculo: 'Agência Brasil', data, url: `https://agenciabrasil.ebc.com.br/${id}`, origem: 'agencia-brasil',
  });
  const gn = (id: string, titulo: string, data: string, veiculo = 'Agência Brasil'): Noticia => ({
    id, titulo, veiculo, data, url: `https://news.google.com/rss/articles/${id}`, origem: 'google-news',
  });
  it('mesma matéria (título + veículo) vinda das duas origens fica uma vez só: a da Agência Brasil', async () => {
    for (const ordem of [0, 1]) {
      const d = await dir();
      const par = [gn('g1', `${TITULO} `, '2026-10-07T12:00:00.000Z'), ab('a1', TITULO.toUpperCase(), '2026-10-07T10:00:00.000Z')];
      await gravarNoticias(d, ordem ? par : [...par].reverse(), '2026-10-08');
      expect((await lerNoticias(d)).map((x) => x.id)).toEqual(['a1']);
    }
  });
  it('a duplicata não volta numa coleta seguinte, nem quando chega sozinha (segunda gravação não muda nada)', async () => {
    const d = await dir();
    await gravarNoticias(d, [ab('a1', TITULO, '2026-10-07T10:00:00.000Z')], '2026-10-08');
    expect(await gravarNoticias(d, [gn('g1', TITULO, '2026-10-07T12:00:00.000Z')], '2026-10-08')).toBe(false);
    expect((await lerNoticias(d)).map((x) => x.id)).toEqual(['a1']);
  });
  it('a Agência Brasil substitui a cópia do Google já gravada', async () => {
    const d = await dir();
    await gravarNoticias(d, [gn('g1', TITULO, '2026-10-07T12:00:00.000Z')], '2026-10-08');
    await gravarNoticias(d, [ab('a1', TITULO, '2026-10-07T10:00:00.000Z')], '2026-10-08');
    expect((await lerNoticias(d)).map((x) => x.id)).toEqual(['a1']);
  });
  it('duas cópias da mesma origem: fica a mais antiga (e, no empate, o menor id), em qualquer ordem de chegada', async () => {
    for (const ordem of [0, 1]) {
      const d = await dir();
      const copias = [
        gn('g2', TITULO, '2026-10-07T12:00:00.000Z', 'BBC'), gn('g1', TITULO, '2026-10-07T12:00:00.000Z', 'BBC'),
        gn('g0', TITULO, '2026-10-07T13:00:00.000Z', 'BBC'),
      ];
      await gravarNoticias(d, ordem ? copias : [...copias].reverse(), '2026-10-08');
      expect((await lerNoticias(d)).map((x) => x.id)).toEqual(['g1']);
    }
  });
  it('mesmo título em veículos diferentes são notícias diferentes', async () => {
    const d = await dir();
    await gravarNoticias(d, [gn('g1', TITULO, '2026-10-07T12:00:00.000Z', 'BBC'), gn('g2', TITULO, '2026-10-07T12:00:00.000Z', 'G1')], '2026-10-08');
    expect((await lerNoticias(d)).map((x) => x.id).sort()).toEqual(['g1', 'g2']);
  });
  it('devolve false quando nada mudou', async () => {
    const d = await dir();
    await gravarNoticias(d, [n('a', '2026-10-07T10:00:00.000Z')], '2026-10-08');
    expect(await gravarNoticias(d, [n('a', '2026-10-07T10:00:00.000Z')], '2026-10-08')).toBe(false);
  });
});

describe('estado', () => {
  it('ida e volta, e padrão vazio quando não existe', async () => {
    const d = await dir();
    expect(await lerEstado(d)).toEqual({ fontes: {} });
    const estado = { fontes: { agenda: { ok: true, desde: T } }, ultimaNovidadeEm: T };
    expect(await gravarEstado(d, estado)).toBe(true);
    expect(await gravarEstado(d, estado)).toBe(false);
    expect(await lerEstado(d)).toEqual(estado);
  });
});
