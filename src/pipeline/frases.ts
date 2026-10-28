import { createHash } from 'node:crypto';
import tabelaExclusoes from '../../config/frases-excluidas.json';
import type { ChecagemBruta } from '../collectors/factcheck';
import { mandatoDoDia } from '../config';
import { ExclusaoFraseSchema, type Agencia, type FraseChecada, type Mandato } from '../shared/schema';
import { limparEspacos, normalizar } from '../shared/text';
import { ehDaAgencia } from './falas';

export function carregarExclusoes(bruto: unknown = tabelaExclusoes): Set<string> {
  return new Set(ExclusaoFraseSchema.array().parse(bruto).map((e) => e.id));
}

/** Como o presidente do mandato pode aparecer no campo "quem disse" da agência, já normalizado. */
export function nomesAceitos(m: Mandato): Set<string> {
  const nomes = [m.presidente, ...m.nomes].map(normalizar);
  return new Set(nomes.flatMap((n) => [n, `presidente ${n}`]));
}

/** Domínio que a Fact Check API usa para a agência (`reviewPublisherSiteFilter`). */
export function dominioDaAgencia(a: Agencia): string {
  return new URL(a.prefixos[0]).hostname.replace(/^www\./, '');
}

export function idFrase(agencia: string, url: string, frase: string): string {
  const resumo = createHash('sha256').update(`${url}\n${normalizar(frase)}`).digest('hex').slice(0, 12);
  return `${agencia}-${resumo}`;
}

// A data que a agência escreveu, sem converter fuso: "2026-10-01T00:00:00Z" é o dia 1º, não 30/09 em Brasília.
function dia(iso: string | undefined): string | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso) || Number.isNaN(Date.parse(iso))) return undefined;
  const d = iso.slice(0, 10);
  return new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d ? d : undefined;
}

export interface ContextoFrases {
  agencias: Agencia[];
  mandatos: Mandato[];
  hoje: string;
  exclusoes: Set<string>;
  coletadoEm: string;
}

/**
 * Frases que entram no site. Na dúvida, fica de fora: só entra a frase que a própria agência atribui ao presidente
 * (autor igual a um nome dele, nunca "contém"), de agência aceita, com veredito e datas válidas. Item ruim é
 * descartado sem derrubar os outros: é dado de terceiros.
 */
export function aceitarFrases(brutas: ChecagemBruta[], ctx: ContextoFrases): FraseChecada[] {
  const saida = new Map<string, FraseChecada>();
  for (const b of brutas) {
    const agencia = ctx.agencias.find((a) => ehDaAgencia(b.url, a));
    if (!agencia) continue;
    const frase = limparEspacos(b.frase);
    if (frase.length < 15 || frase.length > 1000 || !/\p{L}/u.test(frase)) continue;
    const veredito = limparEspacos(b.veredito);
    if (!veredito || veredito.length > 60) continue;
    const publicadaEm = dia(b.dataChecagem) ?? dia(b.dataFrase);
    const data = dia(b.dataFrase) ?? publicadaEm;
    if (!data || !publicadaEm || data > ctx.hoje || publicadaEm > ctx.hoje) continue;
    const mandato = mandatoDoDia(ctx.mandatos, data);
    if (!mandato || !nomesAceitos(mandato).has(normalizar(b.autor ?? ''))) continue;
    const url = new URL(b.url).href;
    const id = idFrase(agencia.id, url, frase);
    if (ctx.exclusoes.has(id) || saida.has(id)) continue;
    const titulo = b.titulo ? limparEspacos(b.titulo) : '';
    saida.set(id, {
      id, frase, data, agencia: agencia.id, agenciaNome: agencia.nome, veredito, url,
      ...(titulo && titulo.length <= 300 ? { titulo } : {}), publicadaEm, coletadoEm: ctx.coletadoEm,
    });
  }
  return [...saida.values()];
}

const ordem = (a: FraseChecada, b: FraseChecada) =>
  b.publicadaEm.localeCompare(a.publicadaEm) || b.data.localeCompare(a.data) || a.id.localeCompare(b.id);

/**
 * A cobertura da API varia: o que já foi gravado fica, mesmo que a busca deixe de devolvê-lo. Item já gravado não é
 * reescrito (nem a data de coleta). Só a exclusão manual tira.
 */
export function mesclarFrases(existentes: FraseChecada[], novas: FraseChecada[], exclusoes: Set<string>): FraseChecada[] {
  const porId = new Map(existentes.map((f) => [f.id, f]));
  for (const f of novas) if (!porId.has(f.id)) porId.set(f.id, f);
  return [...porId.values()].filter((f) => !exclusoes.has(f.id)).sort(ordem);
}
