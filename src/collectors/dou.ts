import * as cheerio from 'cheerio';
import type { Evento } from '../shared/schema';
import { limparEspacos, normalizar, parseDataExtenso, somarDias } from '../shared/text';

export class DouLayoutError extends Error {}

interface ItemDou {
  title?: string;
  urlTitle?: string;
  content?: string;
  hierarchyStr?: string;
}

const ATO = /^(DECRETO|LEI|MEDIDA PROVISÓRIA)\b/i;
// O número vem depois de "Nº"; o DOU às vezes esquece o "Nº" ("DECRETO 12.568, DE 30 DE JULHO DE 2025", verificado
// na edição de 31/07/2025). "DECRETO DE 6 DE ..." e "DECRETOS DE ..." (não numerados) seguem de fora.
const NUMERADO = /\bN[ºo°]\s*[\d.]+|^(?:DECRETO|LEI(?: COMPLEMENTAR)?|MEDIDA PROVISÓRIA)\s+\d[\d.]*\s*,/i;
const DECRETO_LEGISLATIVO = /^DECRETO LEGISLATIVO\b/i;

// 'do1' = edição ordinária; 'do1e' = edições extras da Seção 1 (MPs e decretos que saem fora do expediente, p.ex. a posse
// de 01/01/2023). Verificado na fonte: sem 'do1e' esses atos não aparecem.
export type SecaoDou = 'do1' | 'do1e';

export function urlDouEdicao(data: string, secao: SecaoDou = 'do1'): string {
  const [a, m, d] = data.split('-');
  return `https://www.in.gov.br/leiturajornal?data=${d}-${m}-${a}&secao=${secao}`;
}

// Fim da ementa = começo do preâmbulo. Formas reais no DOU: "O PRESIDENTE DA REPÚBLICA", "OPRESIDENTE ...", letras
// espaçadas ("O V I C E - P R E S I D E N T E D A R E P Ú B L I C A", "D AR E P Ú B L I C A"), "O VICE-PRESIDENTE DA
// REPÚBLICA, no exercício do cargo de PRESIDENTE", "O PRESIDENTE DE REPÚBLICA,no uso" (sic) e, em lei promulgada pelo
// Congresso, "Faço saber que ...". Só MAIÚSCULAS casam o preâmbulo ("Autoriza o Presidente da República..." na ementa
// não é cortado).
const PREAMBULO =
  /\s(?:O\s*(?:V\s*I\s*C\s*E\s*-?\s*)?P\s*R\s*E\s*S\s*I\s*D\s*E\s*N\s*T\s*E\s*D\s*[AE]\s*R\s*E\s*P\s*[ÚU]\s*B|Faço saber\b)/;

// O DOU entrega só o começo do texto, cortado com "...": o corte muitas vezes cai no meio do preâmbulo
// ("... de semicondutores. O PRESIDENTE DA REPÚ...").
const PREAMBULO_CORTADO = /\s(O[\sA-ZÚ-]*?)\s*(?:\.{3}|…)$/;
// Até "REPÚ": com uma letra a mais, PREAMBULO já casa.
const PREAMBULOS_SEM_ESPACO = ['OPRESIDENTEDAREPU', 'OPRESIDENTEDEREPU', 'OVICEPRESIDENTEDAREPU', 'OVICEPRESIDENTEDEREPU'];

export function cortarPreambulo(texto: string): string {
  const inteiro = texto.search(PREAMBULO);
  if (inteiro >= 0) return limparEspacos(texto.slice(0, inteiro));
  const m = PREAMBULO_CORTADO.exec(texto);
  if (!m) return texto;
  const letras = m[1].replace(/[\s-]/g, '').replace('Ú', 'U');
  if (!PREAMBULOS_SEM_ESPACO.some((p) => p.startsWith(letras))) return texto;
  // Um "O" maiúsculo sozinho antes do "..." só é preâmbulo se a frase anterior já terminou.
  if (letras.length < 2 && !/[.;:)]$/.test(texto.slice(0, m.index))) return texto;
  return limparEspacos(texto.slice(0, m.index));
}

function extrairEmenta(titulo: string, content: string): string | undefined {
  const c = limparEspacos(content);
  if (!c.startsWith(titulo)) return undefined;
  return cortarPreambulo(c.slice(titulo.length)).trim() || undefined;
}

// O DOU republica atos com o título e a data de assinatura originais: partes vetadas promulgadas pelo Congresso
// meses depois (Lei 14.701 em 28/12/2023), retificações "(*)" e anexos soltos. Não são atos novos do Presidente.
// Medido na carga 2023–2026: ato comum sai de 0 a 5 dias depois da assinatura (3.058 casos); republicação, de 19 em diante.
export const PRAZO_MAXIMO_PUBLICACAO_DIAS = 10;

// "(*)" = republicado por ter saído com incorreção, em geral um ou dois dias depois. Às vezes é a ÚNICA publicação
// do ato na lista do DOU (Lei 14.642, 03/08/2023): por isso a retificação recente sai do coletor, e quem tem os dados
// gravados (o pipeline) decide se o ato já está listado.
export function ehRetificacao(titulo: string): boolean {
  return /\(\*\)$/.test(titulo.trim());
}

export function ehRepublicacao(titulo: string, assinatura: string | undefined, publicacao: string): boolean {
  if (/ANEXO$/i.test(titulo.trim())) return true;
  if (assinatura === undefined) return ehRetificacao(titulo); // sem data não dá para saber se a retificação é recente
  return assinatura < somarDias(publicacao, -PRAZO_MAXIMO_PUBLICACAO_DIAS);
}

/** Mesmo ato = mesmo tipo e número, como quer que o DOU tenha escrito o resto do título. */
export function chaveDoAto(titulo: string): string {
  const t = limparEspacos(titulo).toUpperCase().replace(/\s*\(\*\)$/, '');
  const m = t.match(/^(DECRETO|LEI COMPLEMENTAR|LEI|MEDIDA PROVISÓRIA)\s+(?:N[ºO°]\s*)?(\d[\d.]*)/);
  return m ? `${m[1]} ${m[2].replace(/\./g, '')}` : t;
}

export function parseDou(html: string, data: string, coletadoEm: string): Evento[] {
  const $ = cheerio.load(html);
  let json: { jsonArray?: unknown };
  try {
    json = JSON.parse($('script#params').first().text());
  } catch {
    throw new DouLayoutError('JSON "params" ausente ou inválido na página do DOU');
  }
  if (!Array.isArray(json.jsonArray)) throw new DouLayoutError('"jsonArray" ausente na página do DOU');
  const itens = json.jsonArray as ItemDou[];
  if (itens.length > 0 && !itens.some((i) => typeof i?.title === 'string' && typeof i?.hierarchyStr === 'string')) {
    throw new DouLayoutError('A edição do DOU tem itens, mas nenhum com os campos esperados (title e hierarchyStr): o layout mudou');
  }

  const eventos: Evento[] = [];
  for (const bruto of itens) {
    const titulo = limparEspacos(bruto.title ?? '');
    const urlTitle = bruto.urlTitle ?? '';
    if (!titulo || !urlTitle) continue;
    if (!(bruto.hierarchyStr ?? '').startsWith('Atos do Poder')) continue;
    if (!ATO.test(titulo) || DECRETO_LEGISLATIVO.test(titulo) || !NUMERADO.test(titulo)) continue;
    const dataDoTitulo = parseDataExtenso(titulo);
    // Ato não é publicado antes de assinado: data do título posterior à edição é erro de digitação do DOU
    // ("DECRETO Nº 12.420, DE 25 DE DEZEMBRO DE 2025" saiu em 26/03/2025). Sem data confiável, não afirmamos nenhuma.
    const assinatura = dataDoTitulo && dataDoTitulo <= data ? dataDoTitulo : undefined;
    if (ehRepublicacao(titulo, assinatura, data)) continue;
    eventos.push({
      id: `dou:${urlTitle}`,
      tipo: 'ato',
      data,
      titulo,
      status: 'publicado',
      ementa: extrairEmenta(titulo, bruto.content ?? ''),
      datasAto: { assinatura, publicacao: data },
      fontes: [{
        nome: 'dou', rotulo: 'Diário Oficial da União',
        url: `https://www.in.gov.br/web/dou/-/${urlTitle}`, coletadoEm,
      }],
      confirmadoPor: [],
      historico: [],
    });
  }
  return eventos;
}

export function urlTextoPlanalto(titulo: string, assinatura: string | undefined): string | null {
  const m = titulo.match(/^(DECRETO|LEI)\s+(?:N[ºo°]\s*)?(\d[\d.]*)/i);
  if (!m || !assinatura) return null;
  const ano = Number(assinatura.slice(0, 4));
  const inicio = 2019 + 4 * Math.floor((ano - 2019) / 4);
  const numero = m[2].replace(/\./g, '');
  const decreto = m[1].toUpperCase() === 'DECRETO';
  return `https://www.planalto.gov.br/ccivil_03/_ato${inicio}-${inicio + 3}/${ano}/${decreto ? 'decreto' : 'lei'}/${decreto ? 'D' : 'L'}${numero}.htm`;
}

// O número no título do DOU às vezes sai errado ("LEI Nº 15.090, DE 8 DE AGOSTO DE 2025" era a 15.190), e a URL montada
// com ele abre OUTRO ato, com HTTP 200. Só a data por extenso confirma que a página é do ato do título.
// As páginas do Planalto são Latin-1 sem charset declarado: lidas como UTF-8, "ç" e "º" chegam como U+FFFD.
export function textoPlanaltoEhDoAto(html: string, titulo: string): boolean {
  const m = normalizar(titulo).match(/(\d{1,2})[º°o]? de ([a-z]+) de (\d{4})/);
  if (!m) return false;
  const mes = m[2].replace(/c/g, '[c\uFFFD]');
  const data = new RegExp(`(?<!\\d)0?${Number(m[1])}[º°o\uFFFD]? de ${mes} de ${m[3]}(?!\\d)`);
  return data.test(normalizar(cheerio.load(html).text()));
}
