import type { Evento } from '../../src/shared/schema';
import type { Filtros } from './params';

export function filtrarEventos(evs: Evento[], f: Filtros): Evento[] {
  return evs.filter((e) =>
    (!f.tipo || e.tipo === f.tipo) &&
    (!f.status || e.status === f.status) &&
    (!f.de || e.data >= f.de) &&
    (!f.ate || e.data <= f.ate));
}

const chave = (e: Evento) => `${e.data} ${e.hora ?? '00:00'}`;

export function agruparPorDia(evs: Evento[]): { data: string; itens: Evento[] }[] {
  const mapa = new Map<string, Evento[]>();
  for (const e of evs) mapa.set(e.data, [...(mapa.get(e.data) ?? []), e]);
  return [...mapa.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([data, itens]) => ({
      data,
      itens: [...itens].sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? '') || a.id.localeCompare(b.id)),
    }));
}

export const ehProximo = (e: Evento, hoje: string): boolean =>
  e.tipo === 'agenda' && e.status === 'agendado' && e.data >= hoje;

export function proximos(evs: Evento[], hoje: string): Evento[] {
  return evs
    .filter((e) => ehProximo(e, hoje))
    .sort((a, b) => chave(a).localeCompare(chave(b)));
}
