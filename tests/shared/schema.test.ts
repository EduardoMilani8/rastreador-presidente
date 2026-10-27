import { describe, expect, it } from 'vitest';
import { EventoSchema } from '../../src/shared/schema';

const base = {
  id: 'agenda:2026-10-08:10:00:1',
  tipo: 'agenda',
  data: '2026-10-08',
  hora: '10:00',
  titulo: 'Reunião',
  status: 'agendado',
  fontes: [{ nome: 'agenda-planalto', rotulo: 'Planalto (governo)', url: 'https://www.gov.br/x', coletadoEm: '2026-10-08T12:00:00.000Z' }],
  confirmadoPor: [],
  historico: [],
};

describe('EventoSchema', () => {
  it('aceita um evento válido', () => {
    expect(EventoSchema.safeParse(base).success).toBe(true);
  });
  it('recusa fonte com URL não-https', () => {
    const ruim = { ...base, fontes: [{ ...base.fontes[0], url: 'http://x.com' }] };
    expect(EventoSchema.safeParse(ruim).success).toBe(false);
    const js = { ...base, fontes: [{ ...base.fontes[0], url: 'javascript:alert(1)' }] };
    expect(EventoSchema.safeParse(js).success).toBe(false);
  });
  it('recusa fonte com usuário na URL (https://www.gov.br@golpe.example/ leva a outro site)', () => {
    const golpe = { ...base, fontes: [{ ...base.fontes[0], url: 'https://www.gov.br@golpe.example/x' }] };
    expect(EventoSchema.safeParse(golpe).success).toBe(false);
  });
  it('recusa evento sem nenhuma fonte', () => {
    expect(EventoSchema.safeParse({ ...base, fontes: [] }).success).toBe(false);
  });
  it('recusa hora e data mal formadas', () => {
    expect(EventoSchema.safeParse({ ...base, hora: '9h' }).success).toBe(false);
    expect(EventoSchema.safeParse({ ...base, data: '08/10/2026' }).success).toBe(false);
  });
});
