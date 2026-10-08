import { describe, expect, it } from 'vitest';
import type { Comunicado } from '../../src/collectors/planalto';
import { ligarComunicados } from '../../src/pipeline/link';
import type { Evento, Mandato } from '../../src/shared/schema';

const T = '2026-09-08T20:00:00.000Z';
const MANDATO: Mandato = {
  presidente: 'Luiz Inácio Lula da Silva', nomes: ['Lula'], inicio: '2023-01-01', fim: null,
  agendaBase: 'https://www.gov.br/x',
};

const agenda = (id: string, local: string, sobre: Partial<Evento> = {}): Evento => ({
  id, tipo: 'agenda', data: '2026-09-08', hora: '09:00', titulo: 'Visita', local, status: 'agendado',
  fontes: [{ nome: 'agenda-planalto', rotulo: 'Planalto (governo)', url: `https://x.test/${id}`, coletadoEm: T }],
  confirmadoPor: [], historico: [], ...sobre,
});

const comunicado = (sobre: Partial<Comunicado> = {}): Comunicado => ({
  id: 'planalto:visita-barretos', data: '2026-09-08',
  titulo: 'Presidente visita o Hospital de Amor, em Barretos (SP)', resumo: '',
  url: 'https://www.gov.br/planalto/n/visita-barretos', coletadoEm: T, ...sobre,
});

describe('ligarComunicados', () => {
  it('liga ao único compromisso do mesmo dia e local e soma a fonte', () => {
    const r = ligarComunicados([agenda('a1', 'Barretos - SP')], [comunicado()], MANDATO);
    expect(r).toHaveLength(1);
    expect(r[0].confirmadoPor).toEqual(['planalto:visita-barretos']);
    expect(r[0].fontes.map((f) => f.nome)).toEqual(['agenda-planalto', 'comunicado-planalto']);
  });

  it('é idempotente ao rodar duas vezes', () => {
    const uma = ligarComunicados([agenda('a1', 'Barretos - SP')], [comunicado()], MANDATO);
    const duas = ligarComunicados(uma, [comunicado()], MANDATO);
    expect(duas).toEqual(uma);
  });

  it('com dois compromissos candidatos NÃO liga e cria item próprio (cita o presidente)', () => {
    const r = ligarComunicados(
      [agenda('a1', 'Barretos - SP'), agenda('a2', 'Barretos (SP)', { hora: '15:00' })],
      [comunicado()], MANDATO,
    );
    expect(r.filter((e) => e.confirmadoPor.length > 0)).toHaveLength(0);
    const proprio = r.find((e) => e.tipo === 'comunicado');
    expect(proprio).toMatchObject({ id: 'planalto:visita-barretos', status: 'realizado', data: '2026-09-08' });
    expect(proprio?.fontes[0].url).toBe('https://www.gov.br/planalto/n/visita-barretos');
  });

  it('data diferente não liga', () => {
    const r = ligarComunicados([agenda('a1', 'Barretos - SP', { data: '2026-09-09' })], [comunicado()], MANDATO);
    expect(r.find((e) => e.id === 'a1')?.confirmadoPor).toEqual([]);
  });

  it('compromisso removido não é candidato', () => {
    const r = ligarComunicados([agenda('a1', 'Barretos - SP', { removidoEm: T })], [comunicado()], MANDATO);
    expect(r.find((e) => e.id === 'a1')?.confirmadoPor).toEqual([]);
  });

  it('comunicado ambíguo que não liga e não cita o presidente é descartado', () => {
    const c = comunicado({ id: 'planalto:aramar', titulo: 'Visita presencial ao Centro Industrial Nuclear de Aramar, em Iperó (SP)' });
    const r = ligarComunicados([agenda('a1', 'Palácio do Planalto')], [c], MANDATO);
    expect(r).toHaveLength(1);
  });

  it('comunicado ambíguo que liga a um compromisso confirma-o', () => {
    const c = comunicado({ id: 'planalto:aramar', titulo: 'Visita presencial ao Centro Industrial Nuclear de Aramar, em Iperó (SP)' });
    const r = ligarComunicados([agenda('a1', 'Iperó - SP')], [c], MANDATO);
    expect(r[0].confirmadoPor).toEqual(['planalto:aramar']);
  });

  it('"Presidente do Senado" não vira item do presidente', () => {
    const c = comunicado({ id: 'planalto:senado', titulo: 'Presidente do Senado recebe ministros' });
    expect(ligarComunicados([], [c], MANDATO)).toEqual([]);
  });

  it('não duplica comunicado que já existe como item próprio', () => {
    const uma = ligarComunicados([], [comunicado()], MANDATO);
    const duas = ligarComunicados(uma, [comunicado()], MANDATO);
    expect(duas).toHaveLength(1);
  });

  it('local curto demais (< 4 caracteres) nunca casa', () => {
    const r = ligarComunicados([agenda('a1', 'SP')], [comunicado()], MANDATO);
    expect(r.find((e) => e.id === 'a1')?.confirmadoPor).toEqual([]);
  });
});
