import type { Evento, Fonte, Status } from '../shared/schema';

export function calcularStatus(ev: Evento, hoje: string): Status {
  if (ev.tipo === 'ato') return 'publicado';
  // O feed do Planalto traz sobretudo avisos de pauta ("Agenda será às 14h30..."), publicados 1–2 dias ANTES do
  // evento. Um comunicado é só "publicado": nunca afirma que algo foi realizado.
  if (ev.tipo === 'comunicado') return 'publicado';
  if (ev.removidoEm) return 'removido';
  if (ev.confirmadoPor.length > 0) return 'realizado';
  if (ev.historico.length > 0) return 'alterado';
  return ev.data >= hoje ? 'agendado' : 'consta_na_agenda';
}

export function aplicarStatus(eventos: Evento[], hoje: string): Evento[] {
  return eventos.map((e) => ({ ...e, status: calcularStatus(e, hoje) }));
}

function unirFontes(atuais: Fonte[], novas: Fonte[]): Fonte[] {
  const urls = new Set(atuais.map((f) => f.url));
  return [...atuais, ...novas.filter((f) => !urls.has(f.url))];
}

function unir(a: string[], b: string[]): string[] {
  return [...a, ...b.filter((x) => !a.includes(x))];
}

export function mesclar(
  existentes: Evento[], coletados: Evento[], diasCompletos: ReadonlySet<string>, agora: string,
): Evento[] {
  const mapa = new Map(existentes.map((e) => [e.id, e]));
  const vistos = new Set<string>();

  for (const c of coletados) {
    vistos.add(c.id);
    const e = mapa.get(c.id);
    if (!e) {
      mapa.set(c.id, c);
      continue;
    }
    const mudou = e.titulo !== c.titulo || e.local !== c.local;
    mapa.set(c.id, {
      ...e,
      titulo: c.titulo,
      local: c.local,
      ementa: c.ementa ?? e.ementa,
      historico: mudou
        ? [...e.historico, { titulo: e.titulo, hora: e.hora, local: e.local, registradoEm: agora }]
        : e.historico,
      fontes: unirFontes(e.fontes, c.fontes),
      confirmadoPor: unir(e.confirmadoPor, c.confirmadoPor),
      removidoEm: undefined,
    });
  }

  for (const e of [...mapa.values()]) {
    if (e.tipo === 'agenda' && !e.removidoEm && !vistos.has(e.id) && diasCompletos.has(e.data)) {
      mapa.set(e.id, { ...e, removidoEm: agora });
    }
  }
  return [...mapa.values()];
}
