import tabelaAgencias from '../../config/agencias.json';
import tabelaChecagens from '../../config/checagens.json';
import { mandatoDoDia } from '../config';
import {
  AgenciaSchema, ChecagemSchema, type Agencia, type Checagem, type FalaChecada, type Mandato,
} from '../shared/schema';

export function carregarAgencias(bruto: unknown = tabelaAgencias): Agencia[] {
  const agencias = AgenciaSchema.array().parse(bruto);
  const ids = new Set<string>();
  for (const a of agencias) {
    if (ids.has(a.id)) throw new Error(`config/agencias.json: id repetido (${a.id})`);
    ids.add(a.id);
  }
  return agencias;
}

export function carregarChecagens(bruto: unknown = tabelaChecagens): Checagem[] {
  return ChecagemSchema.array().parse(bruto);
}

// Compara o endereço já normalizado pelo navegador: "../", usuário na URL ("https://site@golpe/") e domínio com
// sufixo ("https://site.golpe/") mudam o começo do href e não passam pelo prefixo.
function ehDaAgencia(url: string, agencia: Agencia): boolean {
  try {
    const href = new URL(url).href;
    return agencia.prefixos.some((p) => href.startsWith(p));
  } catch {
    return false;
  }
}

/**
 * Lista publicada em data/falas.json. Qualquer problema em qualquer item lança, com todos os problemas juntos: a lista
 * nunca sai pela metade.
 */
export function montarFalas(checagens: Checagem[], agencias: Agencia[], mandatos: Mandato[], hoje: string): FalaChecada[] {
  const porId = new Map(agencias.map((a) => [a.id, a]));
  const problemas: string[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();
  const falas: FalaChecada[] = [];
  for (const c of checagens) {
    const erro = (msg: string) => problemas.push(`${c.id}: ${msg}`);
    if (ids.has(c.id)) erro('id repetido');
    ids.add(c.id);
    if (urls.has(c.url)) erro('URL repetida');
    urls.add(c.url);
    if (!mandatoDoDia(mandatos, c.data)) erro(`fala de ${c.data}, fora dos mandatos de config/mandatos.json`);
    if (c.data > hoje) erro(`fala depois de hoje (${c.data})`);
    if (c.publicadaEm > hoje) erro(`checagem publicada depois de hoje (${c.publicadaEm})`);
    const agencia = porId.get(c.agencia);
    if (!agencia) {
      erro(`agência desconhecida (${c.agencia}); as aceitas estão em config/agencias.json`);
      continue;
    }
    if (!ehDaAgencia(c.url, agencia)) erro(`${c.url} não é um endereço da agência ${agencia.nome}`);
    falas.push({ ...c, agenciaNome: agencia.nome });
  }
  if (problemas.length > 0) throw new Error(`config/checagens.json: ${problemas.join('; ')}`);
  return falas.sort((a, b) =>
    b.data.localeCompare(a.data) || b.publicadaEm.localeCompare(a.publicadaEm) || a.id.localeCompare(b.id));
}
