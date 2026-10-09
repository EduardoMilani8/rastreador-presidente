import { StatusSchema, TipoEventoSchema, type Status, type TipoEvento } from '../../src/shared/schema';

export interface Filtros {
  aba: 'linha' | 'noticias';
  tipo?: TipoEvento;
  status?: Status;
  de?: string;
  ate?: string;
}

function dataValida(s: string | null): string | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : undefined;
}

export function lerFiltros(search: string): Filtros {
  const p = new URLSearchParams(search);
  const tipo = TipoEventoSchema.safeParse(p.get('tipo'));
  const status = StatusSchema.safeParse(p.get('status'));
  const f: Filtros = { aba: p.get('aba') === 'noticias' ? 'noticias' : 'linha' };
  if (tipo.success) f.tipo = tipo.data;
  if (status.success) f.status = status.data;
  const de = dataValida(p.get('de'));
  const ate = dataValida(p.get('ate'));
  if (de) f.de = de;
  if (ate) f.ate = ate;
  return f;
}
