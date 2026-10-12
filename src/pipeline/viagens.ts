import tabela from '../../config/locais.json';
import { LocalConhecidoSchema, type Evento, type LocalConhecido, type Viagem } from '../shared/schema';
import { normalizar } from '../shared/text';

const UFS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
// "Nova York - MA", "Buenos Aires (PE)", "Mariana/MG": a sigla de estado no fim diz que o lugar é no Brasil.
const TERMINA_EM_UF = new RegExp(`[-–—/(,]\\s*(?:${UFS})\\)?\\s*$`);
const EH_AEROPORTO = /(^|[^a-z0-9])(aeroporto|base aerea|aerodromo|aeroestacao)([^a-z0-9]|$)/;

/** Texto do `local` pronto para comparar: sem acento, minúsculo, com travessões e aspas unificados. */
export function normalizarLocal(local: string): string {
  return normalizar(local.replace(/[–—]/g, '-').replace(/[’‘`´]/g, "'"));
}

const alfanumerico = (c: string | undefined) => c !== undefined && /[a-z0-9]/.test(c);

// O padrão precisa aparecer inteiro: "madri" não casa com "madrigal", nem "roma" com "romaria".
function contemInteiro(texto: string, padrao: string): boolean {
  for (let i = texto.indexOf(padrao); i !== -1; i = texto.indexOf(padrao, i + 1)) {
    const antes = alfanumerico(padrao[0]) && alfanumerico(texto[i - 1]);
    const depois = alfanumerico(padrao[padrao.length - 1]) && alfanumerico(texto[i + padrao.length]);
    if (!antes && !depois) return true;
  }
  return false;
}

export function carregarLocais(bruto: unknown = tabela): LocalConhecido[] {
  const locais = LocalConhecidoSchema.array().parse(bruto);
  const ids = new Set<string>();
  for (const l of locais) {
    if (ids.has(l.id)) throw new Error(`config/locais.json: id repetido (${l.id})`);
    ids.add(l.id);
    for (const p of [...l.exatos, ...l.contem]) {
      if (p !== normalizarLocal(p)) throw new Error(`config/locais.json: padrão fora da forma normalizada (${p})`);
    }
  }
  return locais;
}

export function ehAeroporto(local: string): boolean {
  return EH_AEROPORTO.test(normalizarLocal(local));
}

/**
 * Cidade fora do Brasil a que o texto do `local` se refere, segundo a tabela. Sem correspondência, ou com
 * correspondência em mais de uma cidade, devolve undefined: nunca se adivinha cidade por semelhança.
 */
export function cidadeDoLocal(local: string | undefined, locais: LocalConhecido[]): LocalConhecido | undefined {
  if (!local || TERMINA_EM_UF.test(local.trim())) return undefined;
  const texto = normalizarLocal(local);
  const achadas = locais.filter((l) => l.exatos.includes(texto) || l.contem.some((p) => contemInteiro(texto, p)));
  return achadas.length === 1 ? achadas[0] : undefined;
}

/**
 * Cidades fora do Brasil com compromissos da agenda. Cidade em que a agenda só registra aeroporto ou base aérea
 * (escala técnica) fica de fora.
 */
export function calcularViagens(eventos: Evento[], locais: LocalConhecido[]): Viagem[] {
  const porCidade = new Map<string, { cidade: LocalConhecido; dias: Set<string>; itens: number; foraDoAeroporto: boolean }>();
  for (const e of eventos) {
    if (e.tipo !== 'agenda' || e.status === 'removido' || e.removidoEm) continue;
    const cidade = cidadeDoLocal(e.local, locais);
    if (!cidade) continue;
    const g = porCidade.get(cidade.id) ?? { cidade, dias: new Set<string>(), itens: 0, foraDoAeroporto: false };
    g.itens++;
    g.dias.add(e.data);
    if (!ehAeroporto(e.local ?? '')) g.foraDoAeroporto = true;
    porCidade.set(cidade.id, g);
  }
  return [...porCidade.values()]
    .filter((g) => g.foraDoAeroporto)
    .map(({ cidade, dias, itens }): Viagem => {
      const ordenados = [...dias].sort();
      return {
        id: cidade.id, cidade: cidade.cidade, pais: cidade.pais, lat: cidade.lat, lon: cidade.lon,
        compromissos: itens, dias: ordenados.length,
        primeiroDia: ordenados[0], ultimoDia: ordenados[ordenados.length - 1],
      };
    })
    .sort((a, b) => b.compromissos - a.compromissos || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
