import * as cheerio from 'cheerio';
import type { Evento } from '../shared/schema';
import { limparEspacos, parseDataExtenso } from '../shared/text';

export class DouLayoutError extends Error {}

interface ItemDou {
  title?: string;
  urlTitle?: string;
  content?: string;
  hierarchyStr?: string;
}

const ATO = /^(DECRETO|LEI|MEDIDA PROVISÓRIA)\b/i;
const NUMERADO = /\bN[ºo°]\s*[\d.]+/i;
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
// REPÚBLICA, no exercício do cargo de PRESIDENTE" e, em lei promulgada pelo Congresso, "Faço saber que ...".
// Só MAIÚSCULAS casam o preâmbulo ("Autoriza o Presidente da República..." na ementa não é cortado).
const PREAMBULO =
  /\s(?:O\s*(?:V\s*I\s*C\s*E\s*-?\s*)?P\s*R\s*E\s*S\s*I\s*D\s*E\s*N\s*T\s*E\s*D\s*A\s*R\s*E\s*P\s*[ÚU]\s*B|Faço saber\b)/;

function extrairEmenta(titulo: string, content: string): string | undefined {
  const c = limparEspacos(content);
  if (!c.startsWith(titulo)) return undefined;
  const semTitulo = c.slice(titulo.length);
  const corte = semTitulo.search(PREAMBULO);
  const ementa = limparEspacos(corte >= 0 ? semTitulo.slice(0, corte) : semTitulo);
  return ementa || undefined;
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
    eventos.push({
      id: `dou:${urlTitle}`,
      tipo: 'ato',
      data,
      titulo,
      status: 'publicado',
      ementa: extrairEmenta(titulo, bruto.content ?? ''),
      datasAto: { assinatura: parseDataExtenso(titulo) ?? undefined, publicacao: data },
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
  const m = titulo.match(/^(DECRETO|LEI)\s+N[ºo°]\s*([\d.]+)/i);
  if (!m || !assinatura) return null;
  const ano = Number(assinatura.slice(0, 4));
  const inicio = 2019 + 4 * Math.floor((ano - 2019) / 4);
  const numero = m[2].replace(/\./g, '');
  const decreto = m[1].toUpperCase() === 'DECRETO';
  return `https://www.planalto.gov.br/ccivil_03/_ato${inicio}-${inicio + 3}/${ano}/${decreto ? 'decreto' : 'lei'}/${decreto ? 'D' : 'L'}${numero}.htm`;
}
