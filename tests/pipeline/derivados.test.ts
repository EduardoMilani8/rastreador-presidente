import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calcularResumo } from '../../src/pipeline/derivados';
import { gravarResumo } from '../../src/pipeline/store';
import { ResumoSchema, type Evento } from '../../src/shared/schema';

const T = '2026-10-08T12:00:00.000Z';
const ev = (id: string, tipo: Evento['tipo'], data: string, extra: Partial<Evento> = {}): Evento => ({
  id, tipo, data, titulo: id, status: tipo === 'agenda' ? 'consta_na_agenda' : 'publicado',
  fontes: [{ nome: 'n', rotulo: 'r', url: 'https://x.test/a', coletadoEm: T }], confirmadoPor: [], historico: [],
  ...extra,
});
const dir = () => mkdtemp(join(tmpdir(), 'rp-'));

describe('calcularResumo', () => {
  it('conta tudo o que está nos eventos, por tipo, e informa a data do registro mais antigo', () => {
    const r = calcularResumo([
      ev('a1', 'agenda', '2023-03-02'), ev('a2', 'agenda', '2026-10-08'),
      ev('d1', 'ato', '2023-01-01'), ev('c1', 'comunicado', '2026-09-02'),
    ]);
    expect(r).toEqual({ total: 4, porTipo: { agenda: 2, ato: 1, comunicado: 1 }, desde: '2023-01-01' });
  });
  it('item removido da agenda continua contando: o resumo é do que está gravado', () => {
    const r = calcularResumo([
      ev('a1', 'agenda', '2026-10-08', { status: 'removido', removidoEm: T }), ev('a2', 'agenda', '2026-10-09'),
    ]);
    expect(r?.porTipo.agenda).toBe(2);
  });
  it('tipo sem nenhum registro aparece com zero', () => {
    expect(calcularResumo([ev('d1', 'ato', '2026-10-08')])?.porTipo).toEqual({ agenda: 0, ato: 1, comunicado: 0 });
  });
  it('sem nenhum evento não há resumo (não existe "desde" verdadeiro para informar)', () => {
    expect(calcularResumo([])).toBeUndefined();
  });
  it('o total é sempre a soma dos tipos e o esquema recusa o que não fecha', () => {
    const r = calcularResumo([ev('a1', 'agenda', '2026-10-08'), ev('d1', 'ato', '2026-10-08')])!;
    expect(r.total).toBe(r.porTipo.agenda + r.porTipo.ato + r.porTipo.comunicado);
    expect(ResumoSchema.safeParse({ ...r, total: r.total + 1 }).success).toBe(false);
    expect(ResumoSchema.safeParse({ ...r, desde: '08/10/2026' }).success).toBe(false);
  });
});

describe('gravarResumo', () => {
  it('grava data/resumo.json e não reescreve quando nada mudou', async () => {
    const d = await dir();
    const r = calcularResumo([ev('a1', 'agenda', '2026-10-08')])!;
    expect(await gravarResumo(d, r)).toBe(true);
    expect(JSON.parse(await readFile(join(d, 'resumo.json'), 'utf8'))).toEqual(r);
    expect(await gravarResumo(d, r)).toBe(false);
  });
  it('recusa resumo inválido e não grava', async () => {
    const d = await dir();
    await expect(gravarResumo(d, { total: 2, porTipo: { agenda: 1, ato: 0, comunicado: 0 }, desde: '2026-10-08' }))
      .rejects.toThrow();
    await expect(readFile(join(d, 'resumo.json'), 'utf8')).rejects.toThrow();
  });
  it('sem resumo (nenhum evento) não grava nada', async () => {
    const d = await dir();
    expect(await gravarResumo(d, undefined)).toBe(false);
    await expect(readFile(join(d, 'resumo.json'), 'utf8')).rejects.toThrow();
  });
});
