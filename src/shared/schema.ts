import { z } from 'zod';

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instante = z.string().datetime({ offset: true });
const urlHttps = z.string().url().refine((u) => u.startsWith('https://'), 'a URL deve ser https');

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

export type Fonte = z.infer<typeof FonteSchema>;
export type Evento = z.infer<typeof EventoSchema>;
export type Noticia = z.infer<typeof NoticiaSchema>;
export type Mandato = z.infer<typeof MandatoSchema>;
export type EstadoFontes = z.infer<typeof EstadoFontesSchema>;
export type TipoEvento = z.infer<typeof TipoEventoSchema>;
export type Status = z.infer<typeof StatusSchema>;
