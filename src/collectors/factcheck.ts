import { z } from 'zod';

export const URL_FACTCHECK = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';

export interface BuscaFactcheck {
  consulta: string;
  /** Domínio da agência, como ela aparece em `publisher.site` (ex.: aosfatos.org). */
  site: string;
  maxDias?: number;
  pagina?: string;
}

/** Endereço da busca, sem a chave: ela vai no cabeçalho X-Goog-Api-Key. */
export function urlBuscaFactcheck(b: BuscaFactcheck): string {
  const p = new URLSearchParams({ query: b.consulta, languageCode: 'pt', pageSize: '100', reviewPublisherSiteFilter: b.site });
  if (b.maxDias !== undefined) p.set('maxAgeDays', String(b.maxDias));
  if (b.pagina) p.set('pageToken', b.pagina);
  return `${URL_FACTCHECK}?${p.toString()}`;
}

/** Um par frase + checagem, com os campos como a agência publicou. Quem filtra é o pipeline. */
export interface ChecagemBruta {
  frase: string;
  autor?: string;
  dataFrase?: string;
  url: string;
  titulo?: string;
  dataChecagem?: string;
  veredito: string;
  site?: string;
  idioma?: string;
}

const texto = z.string().optional().catch(undefined);
const RespostaSchema = z.object({
  claims: z.array(z.object({
    text: texto,
    claimant: texto,
    claimDate: texto,
    claimReview: z.array(z.object({
      publisher: z.object({ name: texto, site: texto }).optional().catch(undefined),
      url: texto,
      title: texto,
      reviewDate: texto,
      textualRating: texto,
      languageCode: texto,
    })).optional().catch(undefined),
  })).optional(),
  nextPageToken: z.string().nullable().optional(),
});

const ErroSchema = z.object({
  error: z.object({ code: z.number().optional(), status: z.string().optional(), message: z.string().optional() }).passthrough(),
});

export function parseFactcheck(corpo: string): { itens: ChecagemBruta[]; proximaPagina?: string } {
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    throw new Error(`Fact Check API: a resposta não é JSON (começa com "${corpo.slice(0, 40)}")`);
  }
  const erro = ErroSchema.safeParse(json);
  if (erro.success) {
    const e = erro.data.error;
    if (/API_KEY|API key/i.test(JSON.stringify(e))) {
      throw new Error('Fact Check API: chave da Fact Check API recusada; confira o segredo FACTCHECK_API_KEY');
    }
    throw new Error(`Fact Check API: ${e.code ?? '?'} ${e.status ?? ''} ${e.message ?? ''}`.trim());
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('Fact Check API: a resposta não tem o formato esperado (objeto com "claims")');
  }
  const r = RespostaSchema.safeParse(json);
  if (!r.success) throw new Error('Fact Check API: a resposta não tem o formato esperado ("claims" não é uma lista)');

  const itens: ChecagemBruta[] = [];
  for (const c of r.data.claims ?? []) {
    for (const cr of c.claimReview ?? []) {
      if (!cr.url || !cr.textualRating || c.text === undefined) continue;
      itens.push({
        frase: c.text, autor: c.claimant, dataFrase: c.claimDate, url: cr.url, titulo: cr.title,
        dataChecagem: cr.reviewDate, veredito: cr.textualRating, site: cr.publisher?.site, idioma: cr.languageCode,
      });
    }
  }
  // Campos ausentes ficam fora do objeto, para o item ser igual ao que a fonte publicou.
  const limpos = itens.map((i) => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as ChecagemBruta);
  return r.data.nextPageToken ? { itens: limpos, proximaPagina: r.data.nextPageToken } : { itens: limpos };
}
