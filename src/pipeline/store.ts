import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  EstadoFontesSchema, EventoSchema, FalaChecadaSchema, FraseChecadaSchema, NoticiaSchema, ResumoSchema, ViagemSchema,
  type EstadoFontes, type Evento, type FalaChecada, type FraseChecada, type Noticia, type Resumo, type Viagem,
} from '../shared/schema';
import { normalizar, somarDias } from '../shared/text';

const json = (x: unknown) => `${JSON.stringify(x, null, 2)}\n`;

async function lerSeExiste(arquivo: string): Promise<string | null> {
  try {
    return await readFile(arquivo, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

async function gravarSeMudou(arquivo: string, conteudo: string): Promise<boolean> {
  if ((await lerSeExiste(arquivo)) === conteudo) return false;
  await mkdir(dirname(arquivo), { recursive: true });
  await writeFile(arquivo, conteudo, 'utf8');
  return true;
}

export async function lerEventos(dir: string): Promise<Evento[]> {
  let arquivos: string[];
  try {
    arquivos = await readdir(join(dir, 'eventos'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const saida: Evento[] = [];
  for (const nome of arquivos.filter((a) => /^\d{4}-\d{2}\.json$/.test(a)).sort()) {
    const bruto = await readFile(join(dir, 'eventos', nome), 'utf8');
    saida.push(...EventoSchema.array().parse(JSON.parse(bruto)));
  }
  return saida;
}

export async function gravarEventos(dir: string, eventos: Evento[]): Promise<number> {
  const validos = EventoSchema.array().parse(eventos); // lança antes de gravar qualquer coisa
  const porMes = new Map<string, Evento[]>();
  for (const e of validos) {
    const mes = e.data.slice(0, 7);
    porMes.set(mes, [...(porMes.get(mes) ?? []), e]);
  }
  let alterados = 0;
  for (const [mes, lista] of porMes) {
    lista.sort((a, b) =>
      a.data.localeCompare(b.data) || (a.hora ?? '').localeCompare(b.hora ?? '') || a.id.localeCompare(b.id));
    if (await gravarSeMudou(join(dir, 'eventos', `${mes}.json`), json(lista))) alterados++;
  }
  // Mês que ficou sem eventos (o único item dele foi unido a outro, de outro mês): sem remover o arquivo, a leitura
  // seguinte traria o item de volta.
  let noDisco: string[] = [];
  try {
    noDisco = await readdir(join(dir, 'eventos'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  for (const nome of noDisco) {
    if (/^\d{4}-\d{2}\.json$/.test(nome) && !porMes.has(nome.slice(0, 7))) {
      await unlink(join(dir, 'eventos', nome));
      alterados++;
    }
  }
  const meses = [...porMes.keys()].sort().reverse();
  if (await gravarSeMudou(join(dir, 'meses.json'), json(meses))) alterados++;
  return alterados;
}

export async function lerNoticias(dir: string): Promise<Noticia[]> {
  const bruto = await lerSeExiste(join(dir, 'noticias.json'));
  return bruto ? NoticiaSchema.array().parse(JSON.parse(bruto)) : [];
}

// A mesma matéria chega por dois caminhos (o feed da Agência Brasil e o Google Notícias, com URLs e ids diferentes).
// Fica uma por título + veículo: a da Agência Brasil (link direto) e, entre iguais, a mais antiga. A escolha depende
// só dos dados, nunca da ordem de chegada, para a gravação seguinte não alternar entre as cópias.
function semRepetidas(noticias: Noticia[]): Noticia[] {
  const preferida = (a: Noticia, b: Noticia): Noticia => {
    if (a.origem !== b.origem) return a.origem === 'agencia-brasil' ? a : b;
    if (a.data !== b.data) return a.data < b.data ? a : b;
    return a.id <= b.id ? a : b;
  };
  const porMateria = new Map<string, Noticia>();
  for (const n of noticias) {
    const chave = `${normalizar(n.titulo)}\n${normalizar(n.veiculo)}`;
    const atual = porMateria.get(chave);
    porMateria.set(chave, atual ? preferida(atual, n) : n);
  }
  return [...porMateria.values()];
}

export async function gravarNoticias(
  dir: string, novas: Noticia[], hoje: string, retencaoDias = 14,
): Promise<boolean> {
  const corte = somarDias(hoje, -retencaoDias);
  const mapa = new Map((await lerNoticias(dir)).map((n) => [n.id, n]));
  for (const n of novas) if (!mapa.has(n.id)) mapa.set(n.id, n);
  const lista = semRepetidas([...mapa.values()])
    .filter((n) => n.data.slice(0, 10) >= corte)
    .sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id));
  return gravarSeMudou(join(dir, 'noticias.json'), json(NoticiaSchema.array().parse(lista)));
}

export async function lerEstado(dir: string): Promise<EstadoFontes> {
  const bruto = await lerSeExiste(join(dir, 'status.json'));
  return bruto ? EstadoFontesSchema.parse(JSON.parse(bruto)) : { fontes: {} };
}

export async function gravarEstado(dir: string, estado: EstadoFontes): Promise<boolean> {
  return gravarSeMudou(join(dir, 'status.json'), json(EstadoFontesSchema.parse(estado)));
}

export async function gravarResumo(dir: string, resumo: Resumo | undefined): Promise<boolean> {
  if (!resumo) return false;
  return gravarSeMudou(join(dir, 'resumo.json'), json(ResumoSchema.parse(resumo)));
}

export async function gravarViagens(dir: string, viagens: Viagem[]): Promise<boolean> {
  return gravarSeMudou(join(dir, 'viagens.json'), json(ViagemSchema.array().parse(viagens)));
}

export async function gravarFalas(dir: string, falas: FalaChecada[]): Promise<boolean> {
  return gravarSeMudou(join(dir, 'falas.json'), json(FalaChecadaSchema.array().parse(falas)));
}

/** `null` se o arquivo ainda não existe (aí a coleta faz a carga completa). */
export async function lerFrases(dir: string): Promise<FraseChecada[] | null> {
  const bruto = await lerSeExiste(join(dir, 'frases-checadas.json'));
  return bruto === null ? null : FraseChecadaSchema.array().parse(JSON.parse(bruto));
}

export async function gravarFrases(dir: string, frases: FraseChecada[]): Promise<boolean> {
  return gravarSeMudou(join(dir, 'frases-checadas.json'), json(FraseChecadaSchema.array().parse(frases)));
}
