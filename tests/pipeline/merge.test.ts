import { describe, expect, it } from 'vitest';
import { aplicarStatus, calcularStatus, mesclar } from '../../src/pipeline/merge';
import type { Evento } from '../../src/shared/schema';

const T1 = '2026-10-08T12:00:00.000Z';
const T2 = '2026-10-08T12:10:00.000Z';

function agenda(sobre: Partial<Evento> = {}): Evento {
  return {
    id: 'agenda:2026-10-08:10:00:1', tipo: 'agenda', data: '2026-10-08', hora: '10:00',
    titulo: 'Reunião', local: 'Palácio do Planalto', status: 'agendado',
    fontes: [{ nome: 'agenda-planalto', rotulo: 'Planalto (governo)', url: 'https://x.test/a', coletadoEm: T1 }],
    confirmadoPor: [], historico: [], ...sobre,
  };
}

describe('calcularStatus', () => {
  it('agenda futura ou de hoje sem confirmação é "agendado"', () => {
    expect(calcularStatus(agenda(), '2026-10-08')).toBe('agendado');
    expect(calcularStatus(agenda({ data: '2026-10-09' }), '2026-10-08')).toBe('agendado');
  });
  it('agenda de dia passado sem confirmação é "consta_na_agenda" (o tempo não prova nada)', () => {
    expect(calcularStatus(agenda(), '2026-10-09')).toBe('consta_na_agenda');
  });
  it('confirmada por comunicado é "realizado"', () => {
    expect(calcularStatus(agenda({ confirmadoPor: ['planalto:x'] }), '2026-10-09')).toBe('realizado');
  });
  it('alterada (com histórico) é "alterado"; removida é "removido" e vence as demais', () => {
    const h = [{ titulo: 'Antigo', registradoEm: T1 }];
    expect(calcularStatus(agenda({ historico: h }), '2026-10-08')).toBe('alterado');
    expect(calcularStatus(agenda({ historico: h, removidoEm: T2 }), '2026-10-08')).toBe('removido');
    expect(calcularStatus(agenda({ confirmadoPor: ['x'], removidoEm: T2 }), '2026-10-08')).toBe('removido');
  });
  it('ato é "publicado" e comunicado é "realizado"', () => {
    expect(calcularStatus(agenda({ tipo: 'ato' }), '2026-10-08')).toBe('publicado');
    expect(calcularStatus(agenda({ tipo: 'comunicado' }), '2026-10-08')).toBe('realizado');
  });
});

describe('mesclar', () => {
  const dias = new Set(['2026-10-08']);

  it('adiciona eventos novos', () => {
    expect(mesclar([], [agenda()], dias, T1)).toHaveLength(1);
  });

  it('é idempotente: mesclar o mesmo conteúdo de novo não muda nada', () => {
    const uma = mesclar([], [agenda()], dias, T1);
    const duas = mesclar(uma, [agenda({ fontes: [{ ...agenda().fontes[0], coletadoEm: T2 }] })], dias, T2);
    expect(duas).toEqual(uma); // coletadoEm original preservado
  });

  it('mudança de título no mesmo horário empilha o histórico', () => {
    const antes = mesclar([], [agenda()], dias, T1);
    const depois = mesclar(antes, [agenda({ titulo: 'Reunião com ministros' })], dias, T2);
    expect(depois[0].titulo).toBe('Reunião com ministros');
    expect(depois[0].historico).toEqual([
      { titulo: 'Reunião', hora: '10:00', local: 'Palácio do Planalto', registradoEm: T2 },
    ]);
  });

  it('compromisso que sumiu de um dia completo é marcado removido', () => {
    const antes = mesclar([], [agenda()], dias, T1);
    const depois = mesclar(antes, [], dias, T2);
    expect(depois[0].removidoEm).toBe(T2);
  });

  it('compromisso que sumiu de um dia NÃO completo (404/erro) é preservado', () => {
    const antes = mesclar([], [agenda()], dias, T1);
    const depois = mesclar(antes, [], new Set(), T2);
    expect(depois[0].removidoEm).toBeUndefined();
  });

  it('se reaparecer, a remoção é desfeita', () => {
    const removido = mesclar(mesclar([], [agenda()], dias, T1), [], dias, T2);
    const volta = mesclar(removido, [agenda()], dias, '2026-10-08T12:20:00.000Z');
    expect(volta[0].removidoEm).toBeUndefined();
  });

  it('une fontes por URL e confirmadoPor sem duplicar', () => {
    const antes = mesclar([], [agenda()], dias, T1);
    const novaFonte = { nome: 'comunicado-planalto', rotulo: 'Planalto (governo)', url: 'https://x.test/c', coletadoEm: T2 };
    const depois = mesclar(antes, [agenda({ fontes: [novaFonte], confirmadoPor: ['planalto:c'] })], dias, T2);
    expect(depois[0].fontes.map((f) => f.url)).toEqual(['https://x.test/a', 'https://x.test/c']);
    const outra = mesclar(depois, [agenda({ fontes: [novaFonte], confirmadoPor: ['planalto:c'] })], dias, T2);
    expect(outra[0].confirmadoPor).toEqual(['planalto:c']);
  });

  it('eventos que não vieram na coleta (ex.: atos antigos) permanecem', () => {
    const ato = agenda({ id: 'dou:1', tipo: 'ato', data: '2026-09-01' });
    expect(mesclar([ato], [], dias, T1)).toHaveLength(1);
  });
});

describe('aplicarStatus', () => {
  it('recalcula o status de todos', () => {
    const r = aplicarStatus([agenda()], '2026-10-09');
    expect(r[0].status).toBe('consta_na_agenda');
  });
});
