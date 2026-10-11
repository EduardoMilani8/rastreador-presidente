import { readFile } from 'node:fs/promises';
import { MandatoSchema, type Mandato } from './shared/schema';

export async function carregarMandatos(caminho = 'config/mandatos.json'): Promise<Mandato[]> {
  return MandatoSchema.array().parse(JSON.parse(await readFile(caminho, 'utf8')));
}

export function mandatoDoDia(mandatos: Mandato[], dia: string): Mandato | undefined {
  return mandatos.find((x) => x.inicio <= dia && (x.fim === null || dia <= x.fim));
}

export function mandatoVigente(mandatos: Mandato[], hoje: string): Mandato {
  const m = mandatoDoDia(mandatos, hoje);
  if (!m) {
    throw new Error(
      `Nenhum mandato configurado cobre ${hoje}. Atualize config/mandatos.json: confira o "fim" do mandato anterior e `
      + 'acrescente o novo mandato (presidente, nomes, inicio, fim e agendaBase, o endereço da agenda do novo presidente).',
    );
  }
  return m;
}
