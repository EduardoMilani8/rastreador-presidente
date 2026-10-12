import type { Evento, Resumo } from '../shared/schema';
import { gravarResumo, gravarViagens } from './store';
import { calcularViagens, carregarLocais } from './viagens';

/** Contagens de tudo o que está gravado em data/eventos. Sem eventos não há resumo. */
export function calcularResumo(eventos: Evento[]): Resumo | undefined {
  if (eventos.length === 0) return undefined;
  const porTipo = { agenda: 0, ato: 0, comunicado: 0 };
  let desde = eventos[0].data;
  for (const e of eventos) {
    porTipo[e.tipo]++;
    if (e.data < desde) desde = e.data;
  }
  return { total: eventos.length, porTipo, desde };
}

/** Grava os arquivos calculados a partir dos eventos. Devolve quantos arquivos mudaram. */
export async function gravarDerivados(dir: string, eventos: Evento[]): Promise<number> {
  let alterados = 0;
  if (await gravarResumo(dir, calcularResumo(eventos))) alterados++;
  if (await gravarViagens(dir, calcularViagens(eventos, carregarLocais()))) alterados++;
  return alterados;
}
