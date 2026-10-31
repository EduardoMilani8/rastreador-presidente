import { z } from 'zod';

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instante = z.string().datetime({ offset: true });
const urlHttps = z.string().url().refine((u) => u.startsWith('https://'), 'a URL deve ser https')
  .refine((u) => URL.canParse(u) && !new URL(u).username && !new URL(u).password, 'a URL não pode ter usuário ou senha');

export const FonteSchema = z.object({
  nome: z.string().min(1),
  rotulo: z.string().min(1),
  url: urlHttps,
  coletadoEm: instante,
});

export const VersaoSchema = z.object({
  titulo: z.string(),
  hora: z.string().optional(),
  local: z.string().optional(),
  registradoEm: instante,
});

export const TipoEventoSchema = z.enum(['agenda', 'ato', 'comunicado']);
export const StatusSchema = z.enum([
  'agendado', 'consta_na_agenda', 'realizado', 'publicado', 'alterado', 'removido',
]);

export const EventoSchema = z.object({
  id: z.string().min(1),
  tipo: TipoEventoSchema,
  data: dataIso,
  hora: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  titulo: z.string().min(1),
  local: z.string().optional(),
  status: StatusSchema,
  ementa: z.string().optional(),
  datasAto: z.object({ assinatura: dataIso.optional(), publicacao: dataIso }).optional(),
  fontes: FonteSchema.array().min(1),
  confirmadoPor: z.string().array(),
  historico: VersaoSchema.array(),
  removidoEm: instante.optional(),
});

export const NoticiaSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  veiculo: z.string().min(1),
  data: instante,
  url: urlHttps,
  origem: z.enum(['google-news', 'agencia-brasil']),
});

export const MandatoSchema = z.object({
  presidente: z.string().min(1),
  nomes: z.string().array().min(1),
  inicio: dataIso,
  fim: dataIso.nullable(),
  agendaBase: urlHttps,
});

export const EstadoFontesSchema = z.object({
  fontes: z.record(z.string(), z.object({ ok: z.boolean(), desde: instante, mensagem: z.string().optional() })),
  ultimaNovidadeEm: instante.optional(),
});

export const ResumoSchema = z.object({
  total: z.number().int().nonnegative(),
  porTipo: z.object({
    agenda: z.number().int().nonnegative(),
    ato: z.number().int().nonnegative(),
    comunicado: z.number().int().nonnegative(),
  }),
  desde: dataIso,
}).refine((r) => r.total === r.porTipo.agenda + r.porTipo.ato + r.porTipo.comunicado, {
  message: 'total diferente da soma dos tipos',
});

const coordenada = (limite: number) => z.number().min(-limite).max(limite);

/** Linha da tabela conferida à mão que liga textos do campo `local` da agenda a uma cidade fora do Brasil. */
export const LocalConhecidoSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+-[a-z]{2}$/),
  cidade: z.string().min(1),
  pais: z.string().min(1),
  lat: coordenada(90),
  lon: coordenada(180),
  exatos: z.string().min(1).array(),
  contem: z.string().min(1).array(),
}).refine((l) => l.exatos.length + l.contem.length > 0, { message: 'cidade sem nenhum padrão' });

export const ViagemSchema = z.object({
  id: z.string().min(1),
  cidade: z.string().min(1),
  pais: z.string().min(1),
  lat: coordenada(90),
  lon: coordenada(180),
  compromissos: z.number().int().positive(),
  dias: z.number().int().positive(),
  primeiroDia: dataIso,
  ultimoDia: dataIso,
}).refine((v) => v.primeiroDia <= v.ultimoDia && v.dias <= v.compromissos, { message: 'período ou contagem incoerente' });

export const TipoFalaSchema = z.enum(['entrevista', 'podcast', 'discurso', 'debate', 'coletiva', 'pronunciamento']);

/** Agência de checagem aceita (signatária verificada da IFCN). A URL de cada checagem tem de começar por um prefixo. */
export const AgenciaSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  nome: z.string().min(1).max(60),
  prefixos: urlHttps.refine((u) => u.endsWith('/'), 'o prefixo deve terminar em /').array().min(1),
});

const texto = (max: number) => z.string().trim().min(1).max(max);

/** Checagem de uma fala do presidente, conferida à mão em config/checagens.json. */
export const ChecagemSchema = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)+$/, 'id: data da fala seguida de palavras em minúsculas, com hífens'),
  data: dataIso,
  tipo: TipoFalaSchema,
  evento: texto(200),
  agencia: z.string().min(1),
  titulo: texto(300),
  url: urlHttps,
  publicadaEm: dataIso,
  vereditos: z.object({ rotulo: texto(60), frases: z.number().int().positive() }).strict().array().min(1).optional(),
  errata: z.object({ data: dataIso, texto: texto(600) }).strict().optional(),
}).strict()
  .refine((c) => c.id.startsWith(`${c.data}-`), { message: 'o id deve começar pela data da fala', path: ['id'] })
  .refine((c) => c.publicadaEm >= c.data, { message: 'checagem publicada antes da fala', path: ['publicadaEm'] })
  .refine((c) => !c.errata || c.errata.data >= c.publicadaEm, { message: 'errata anterior à checagem', path: ['errata'] });

/** Item de data/falas.json: a checagem validada mais o nome da agência. */
export const FalaChecadaSchema = z.object({
  id: z.string().min(1),
  data: dataIso,
  tipo: TipoFalaSchema,
  evento: z.string().min(1),
  agencia: z.string().min(1),
  agenciaNome: z.string().min(1),
  titulo: z.string().min(1),
  url: urlHttps,
  publicadaEm: dataIso,
  vereditos: z.object({ rotulo: z.string().min(1), frases: z.number().int().positive() }).array().optional(),
  errata: z.object({ data: dataIso, texto: z.string().min(1) }).optional(),
});

/** Frase do presidente checada por uma agência, vinda da Fact Check API (data/frases-checadas.json). */
export const FraseChecadaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+-[0-9a-f]{12}$/),
  frase: z.string().min(1),
  data: dataIso,
  agencia: z.string().min(1),
  agenciaNome: z.string().min(1),
  veredito: z.string().min(1),
  url: urlHttps,
  titulo: z.string().min(1).optional(),
  publicadaEm: dataIso,
  coletadoEm: instante,
});

/** Item de config/frases-excluidas.json: tira uma frase que a agência marcou errado. */
export const ExclusaoFraseSchema = z.object({ id: z.string().min(1), motivo: z.string().trim().min(5) }).strict();

export type Fonte = z.infer<typeof FonteSchema>;
export type Evento = z.infer<typeof EventoSchema>;
export type Noticia = z.infer<typeof NoticiaSchema>;
export type Mandato = z.infer<typeof MandatoSchema>;
export type EstadoFontes = z.infer<typeof EstadoFontesSchema>;
export type TipoEvento = z.infer<typeof TipoEventoSchema>;
export type Status = z.infer<typeof StatusSchema>;
export type Resumo = z.infer<typeof ResumoSchema>;
export type LocalConhecido = z.infer<typeof LocalConhecidoSchema>;
export type Viagem = z.infer<typeof ViagemSchema>;
export type TipoFala = z.infer<typeof TipoFalaSchema>;
export type Agencia = z.infer<typeof AgenciaSchema>;
export type Checagem = z.infer<typeof ChecagemSchema>;
export type FalaChecada = z.infer<typeof FalaChecadaSchema>;
export type FraseChecada = z.infer<typeof FraseChecadaSchema>;
