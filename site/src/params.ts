import { StatusSchema, TipoEventoSchema, type Status, type TipoEvento } from '../../src/shared/schema';

export interface Filtros {
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
  const f: Filtros = {};
  if (tipo.success) f.tipo = tipo.data;
  if (status.success) f.status = status.data;
  const de = dataValida(p.get('de'));
  const ate = dataValida(p.get('ate'));
  // Intervalo digitado ao contrário é engano comum; desinverter é melhor do que responder "nenhum registro".
  const [inicio, fim] = de && ate && de > ate ? [ate, de] : [de, ate];
  if (inicio) f.de = inicio;
  if (fim) f.ate = fim;
  return f;
}
