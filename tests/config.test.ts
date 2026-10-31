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
  it('reeleição: o mandato 2023 vai até a véspera da posse (EC 111/2021) e o novo começa em 05/01/2027', async () => {
    const lista = await carregarMandatos();
    expect(mandatoVigente(lista, '2027-01-04').inicio).toBe('2023-01-01');
    const novo = mandatoVigente(lista, '2027-01-05');
    expect(novo).toMatchObject({ presidente: 'Luiz Inácio Lula da Silva', inicio: '2027-01-05', fim: '2031-01-04' });
    // Configurado antes da posse com o endereço da agenda de 2026: conferir em 05/01/2027 (docs/MANUTENCAO.md).
    expect(novo.agendaBase).toBe(mandatoVigente(lista, '2027-01-04').agendaBase);
  });

  it('na posse seguinte (05/01/2031) a coleta para com instrução clara, em vez de seguir com a agenda errada', async () => {
    const lista = await carregarMandatos();
    expect(() => mandatoVigente(lista, '2031-01-05')).toThrow(/2031-01-05.*config\/mandatos\.json/s);
  });
});

describe('carregarMandatos', () => {
  it('lê e valida config/mandatos.json', async () => {
    const lista = await carregarMandatos();
    expect(lista.length).toBeGreaterThan(0);
    expect(lista[0].agendaBase).toMatch(/^https:\/\//);
  });
});
