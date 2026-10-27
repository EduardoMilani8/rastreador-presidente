import { describe, expect, it } from 'vitest';
import { carregarMandatos, mandatoVigente } from '../src/config';

const m = (presidente: string, inicio: string, fim: string | null) => ({
  presidente, nomes: [presidente], inicio, fim, agendaBase: 'https://www.gov.br/x',
});

describe('mandatoVigente', () => {
  const lista = [m('A', '2023-01-01', '2027-01-04'), m('B', '2027-01-05', null)];
  it('escolhe o mandato que contém a data', () => {
    expect(mandatoVigente(lista, '2027-01-04').presidente).toBe('A');
    expect(mandatoVigente(lista, '2027-01-05').presidente).toBe('B');
  });
  it('lança erro quando nenhum mandato cobre a data', () => {
    expect(() => mandatoVigente(lista, '2022-12-31')).toThrow(/mandato/i);
  });
});

describe('config/mandatos.json real (I7)', () => {
  it('o mandato atual vai até a véspera da posse (EC 111/2021: 05/01/2027): nesse dia a coleta para com instrução clara, em vez de seguir com a agenda errada', async () => {
    const lista = await carregarMandatos();
    expect(mandatoVigente(lista, '2027-01-04').presidente).toBe('Luiz Inácio Lula da Silva');
    expect(() => mandatoVigente(lista, '2027-01-05')).toThrow(/2027-01-05.*config\/mandatos\.json/s);
  });
});

describe('carregarMandatos', () => {
  it('lê e valida config/mandatos.json', async () => {
    const lista = await carregarMandatos();
    expect(lista.length).toBeGreaterThan(0);
    expect(lista[0].agendaBase).toMatch(/^https:\/\//);
  });
});
