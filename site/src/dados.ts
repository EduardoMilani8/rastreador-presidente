import { z } from 'zod';
import {
  EstadoFontesSchema, EventoSchema, NoticiaSchema,
  type EstadoFontes, type Evento, type Noticia,
} from '../../src/shared/schema';
import type { Filtros } from './params';

export interface Dados {
  eventos: Evento[];
  noticias: Noticia[];
  estado: EstadoFontes;
  /** true se algum arquivo necessário não pôde ser carregado (a página deve avisar). */
  incompleto: boolean;
  /** Meses (AAAA-MM, do mais novo ao mais antigo) consultados para esta página: é o período que ela cobre. */
  mesesCarregados: string[];
  /** Todos os meses que têm dados, do mais novo ao mais antigo. */
  mesesDisponiveis: string[];
}

async function lerJson(caminho: string): Promise<unknown> {
  const r = await fetch(caminho, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
  return r.json();
}

// Valida item a item: um registro inválido não derruba o mês inteiro.
// Corpo que não é array é falha do arquivo (lança), não "sem registros".
function validos<T>(schema: z.ZodType<T>, bruto: unknown): T[] {
  if (!Array.isArray(bruto)) throw new Error('corpo não é uma lista');
  return bruto.flatMap((x) => {
    const p = schema.safeParse(x);
    return p.success ? [p.data] : [];
  });
}

export async function carregarDados(f: Filtros, opcoes: { noticias?: boolean } = {}): Promise<Dados> {
  let incompleto = false;
  // Nunca lança: em falha devolve o padrão e marca `incompleto`.
  const tentar = async <T>(fn: () => Promise<T>, padrao: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      incompleto = true;
      return padrao;
    }
  };

  const meses = (await tentar(async () =>
    z.string().regex(/^\d{4}-\d{2}$/).array().parse(await lerJson('data/meses.json')), [] as string[]))
    .sort().reverse();
  const escolhidos = f.de || f.ate
    ? meses.filter((m) => m >= (f.de?.slice(0, 7) ?? '0000-00') && m <= (f.ate?.slice(0, 7) ?? '9999-99'))
    : meses.slice(0, 2); // mês atual e o anterior
  const eventos = (await Promise.all(escolhidos.map((m) =>
    tentar(async () => validos(EventoSchema, await lerJson(`data/eventos/${m}.json`)), [] as Evento[])))).flat();
  const noticias = opcoes.noticias
    ? await tentar(async () => validos(NoticiaSchema, await lerJson('data/noticias.json')), [] as Noticia[])
    : [];
  const estado = await tentar(
    async () => EstadoFontesSchema.parse(await lerJson('data/status.json')), { fontes: {} } as EstadoFontes);
  return { eventos, noticias, estado, incompleto, mesesCarregados: escolhidos, mesesDisponiveis: meses };
}
