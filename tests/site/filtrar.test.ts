import { describe, expect, it } from 'vitest';
import { agruparPorDia, ehProximo, filtrarEventos, proximos } from '../../site/src/filtrar';
import type { Evento } from '../../src/shared/schema';

const T = '2026-10-08T12:00:00.000Z';
const ev = (id: string, data: string, sobre: Partial<Evento> = {}): Evento => ({
  id, tipo: 'agenda', data, titulo: id, status: 'consta_na_agenda',
  fontes: [{ nome: 'n', rotulo: 'r', url: 'https://x.test/a', coletadoEm: T }],
  confirmadoPor: [], historico: [], ...sobre,
});

const LISTA = [
  ev('a', '2026-10-06', { hora: '10:00' }),
  ev('b', '2026-10-07', { tipo: 'ato', status: 'publicado' }),
  ev('c', '2026-10-07', { hora: '09:00', status: 'realizado' }),
  ev('d', '2026-10-09', { hora: '10:00', status: 'agendado' }),
  ev('e', '2026-10-08', { hora: '15:00', status: 'agendado' }),
];

describe('filtrarEventos', () => {
  it('sem filtros devolve tudo', () => {
    expect(filtrarEventos(LISTA, {})).toHaveLength(5);
  });
  it('filtra por tipo, status e intervalo de datas (inclusivo)', () => {
    expect(filtrarEventos(LISTA, { tipo: 'ato' }).map((e) => e.id)).toEqual(['b']);
    expect(filtrarEventos(LISTA, { status: 'agendado' }).map((e) => e.id)).toEqual(['d', 'e']);
    expect(filtrarEventos(LISTA, { de: '2026-10-07', ate: '2026-10-08' }).map((e) => e.id).sort())
      .toEqual(['b', 'c', 'e']);
  });
});

describe('agruparPorDia', () => {
  it('ordena dias do mais novo ao mais antigo e itens por hora', () => {
    const g = agruparPorDia(LISTA.filter((e) => e.status !== 'agendado'));
    expect(g.map((x) => x.data)).toEqual(['2026-10-07', '2026-10-06']);
    expect(g[0].itens.map((e) => e.id)).toEqual(['b', 'c']); // sem hora vem antes
  });
});

describe('proximos', () => {
  it('só agenda "agendado", em ordem crescente de data e hora', () => {
    expect(proximos(LISTA, '2026-10-08').map((e) => e.id)).toEqual(['e', 'd']);
  });
  it('agendado com data passada não é próximo (status defasado)', () => {
    const velho = ev('v', '2026-10-01', { hora: '09:00', status: 'agendado' });
    expect(proximos([...LISTA, velho], '2026-10-08').map((e) => e.id)).toEqual(['e', 'd']);
    expect(ehProximo(velho, '2026-10-08')).toBe(false);
  });
  it('ehProximo: data igual a hoje conta; não-agenda agendado nunca conta', () => {
    expect(ehProximo(ev('h', '2026-10-08', { status: 'agendado' }), '2026-10-08')).toBe(true);
    const ato = ev('t', '2026-10-09', { tipo: 'ato', status: 'agendado' });
    expect(ehProximo(ato, '2026-10-08')).toBe(false);
    expect(proximos([ato], '2026-10-08')).toEqual([]);
  });
});
