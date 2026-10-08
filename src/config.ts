import { readFile } from 'node:fs/promises';
import { MandatoSchema, type Mandato } from './shared/schema';

export async function carregarMandatos(caminho = 'config/mandatos.json'): Promise<Mandato[]> {
  return MandatoSchema.array().parse(JSON.parse(await readFile(caminho, 'utf8')));
}

export function mandatoVigente(mandatos: Mandato[], hoje: string): Mandato {
  const m = mandatos.find((x) => x.inicio <= hoje && (x.fim === null || hoje <= x.fim));
  if (!m) throw new Error(`Nenhum mandato configurado cobre ${hoje}`);
  return m;
}
