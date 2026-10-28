import {
  TipoFalaSchema, type EstadoFontes, type FalaChecada, type FraseChecada, type TipoFala,
} from '../../src/shared/schema';
import { montarComum } from './comum';
import { el, formatarDataCurta, linkOuTexto } from './render';

export interface DadosFalas {
  falas: FalaChecada[];
  frases: FraseChecada[];
  estado: EstadoFontes;
  incompleto: boolean;
}

export const ROTULO_TIPO_FALA: Record<TipoFala, { um: string; varios: string }> = {
  entrevista: { um: 'Entrevista', varios: 'Entrevistas' },
  podcast: { um: 'Podcast', varios: 'Podcasts' },
  discurso: { um: 'Discurso', varios: 'Discursos' },
  debate: { um: 'Debate', varios: 'Debates' },
  coletiva: { um: 'Entrevista coletiva', varios: 'Entrevistas coletivas' },
  pronunciamento: { um: 'Pronunciamento', varios: 'Pronunciamentos' },
};

/** Tipo pedido na URL (`?tipo=`). Valor fora do esquema é ignorado: mostra todas. */
export function lerTipoFala(search: string): TipoFala | undefined {
  const r = TipoFalaSchema.safeParse(new URLSearchParams(search).get('tipo'));
  return r.success ? r.data : undefined;
}

const frases = (n: number) => `${n} ${n === 1 ? 'frase' : 'frases'}`;

export function renderFala(doc: Document, f: FalaChecada): HTMLElement {
  const li = el(doc, 'li', { class: 'fala', id: `fala-${f.id.replace(/[^a-zA-Z0-9._-]/g, '-')}` },
    el(doc, 'p', { class: 'evento-meta' },
      el(doc, 'span', { class: 'tipo' }, ROTULO_TIPO_FALA[f.tipo].um), ' · ',
      el(doc, 'time', { datetime: f.data }, formatarDataCurta(f.data))),
    el(doc, 'h3', { class: 'evento-titulo' }, f.evento),
    el(doc, 'p', { class: 'local' }, `Checagem de ${f.agenciaNome}, publicada em ${formatarDataCurta(f.publicadaEm)}`),
    el(doc, 'p', { class: 'fala-link' }, linkOuTexto(doc, f.url, f.titulo)));
  if (f.vereditos?.length) {
    li.append(el(doc, 'ul', { class: 'vereditos', 'aria-label': 'Vereditos da agência' },
      ...f.vereditos.map((v) => el(doc, 'li', {}, `${v.rotulo}: ${frases(v.frases)}`))));
  }
  if (f.errata) {
    li.append(el(doc, 'p', { class: 'errata' },
      el(doc, 'strong', {}, `Errata da agência (${formatarDataCurta(f.errata.data)}):`), ` ${f.errata.texto}`));
  }
  return li;
}

// Mostra "Todas" e só os tipos que têm checagem (mais o pedido na URL, para a escolha atual nunca sumir).
function montarFiltro(doc: Document, alvo: HTMLElement, falas: FalaChecada[], atual: TipoFala | undefined): void {
  alvo.hidden = falas.length === 0;
  if (falas.length === 0) return;
  const conta = (t: TipoFala) => falas.filter((f) => f.tipo === t).length;
  const opcoes: [string, string, boolean][] = [[`Todas (${falas.length})`, 'falas.html', atual === undefined]];
  for (const t of TipoFalaSchema.options) {
    if (conta(t) > 0 || t === atual) {
      opcoes.push([`${ROTULO_TIPO_FALA[t].varios} (${conta(t)})`, `falas.html?tipo=${t}`, t === atual]);
    }
  }
  alvo.append(el(doc, 'p', { class: 'filtro-rotulo', id: 'filtro-falas-rotulo' }, 'Mostrar:'),
    el(doc, 'ul', { 'aria-labelledby': 'filtro-falas-rotulo' }, ...opcoes.map(([texto, href, marcado]) =>
      el(doc, 'li', {}, el(doc, 'a', marcado ? { href, 'aria-current': 'true' } : { href }, texto)))));
}

export const CHECAGENS_A_VISTA = 20;

/** Só deixa legível o veredito como a agência escreveu ("não_é_bem_assim" → "Não é bem assim"); nunca o traduz. */
export function formatarVeredito(v: string): string {
  const t = v.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1);
}

export interface GrupoFrases { url: string; titulo?: string; agenciaNome: string; publicadaEm: string; frases: FraseChecada[] }

/** Uma checagem (mesma URL) por grupo, da mais recente à mais antiga. */
export function agruparFrases(frases: FraseChecada[]): GrupoFrases[] {
  const porUrl = new Map<string, GrupoFrases>();
  const ordenadas = [...frases].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  for (const f of ordenadas) {
    const g = porUrl.get(f.url) ?? { url: f.url, titulo: f.titulo, agenciaNome: f.agenciaNome, publicadaEm: f.publicadaEm, frases: [] };
    if (f.publicadaEm > g.publicadaEm) g.publicadaEm = f.publicadaEm;
    g.titulo ??= f.titulo;
    g.frases.push(f);
    porUrl.set(f.url, g);
  }
  return [...porUrl.values()].sort((a, b) => b.publicadaEm.localeCompare(a.publicadaEm) || a.url.localeCompare(b.url));
}

function renderGrupo(doc: Document, g: GrupoFrases): HTMLElement {
  return el(doc, 'li', { class: 'checagem-auto' },
    el(doc, 'h3', { class: 'evento-titulo' }, g.titulo ?? `Checagem de ${g.agenciaNome}`),
    el(doc, 'p', { class: 'local' }, `${g.agenciaNome} · checagem publicada em ${formatarDataCurta(g.publicadaEm)}`),
    el(doc, 'ul', { class: 'frases' }, ...g.frases.map((f) => el(doc, 'li', {},
      el(doc, 'blockquote', {}, `“${f.frase}”`),
      el(doc, 'p', { class: 'veredito' }, el(doc, 'strong', {}, 'Veredito da agência:'), ` ${formatarVeredito(f.veredito)}`)))),
    el(doc, 'p', { class: 'fala-link' }, g.frases.length > 1 ? 'Por que esses vereditos? ' : 'Por que esse veredito? ',
      linkOuTexto(doc, g.url, `Ler a explicação completa em ${g.agenciaNome}`)));
}

function montarFrases(doc: Document, frases: FraseChecada[]): void {
  const lista = doc.getElementById('lista-frases') as HTMLElement;
  const anteriores = doc.getElementById('frases-anteriores') as HTMLElement;
  lista.replaceChildren();
  anteriores.replaceChildren();
  const grupos = agruparFrases(frases);
  anteriores.hidden = grupos.length <= CHECAGENS_A_VISTA;
  if (grupos.length === 0) {
    lista.append(el(doc, 'li', { class: 'vazio' }, 'Nenhuma frase checada coletada até agora.'));
    return;
  }
  lista.append(...grupos.slice(0, CHECAGENS_A_VISTA).map((g) => renderGrupo(doc, g)));
  const resto = grupos.slice(CHECAGENS_A_VISTA);
  if (resto.length > 0) {
    anteriores.append(el(doc, 'details', {},
      el(doc, 'summary', {}, `Checagens anteriores (${resto.length})`),
      el(doc, 'ol', { class: 'lista falas' }, ...resto.map((g) => renderGrupo(doc, g)))));
  }
}

export function montarPaginaFalas(doc: Document, dados: DadosFalas, agora: Date, search: string): void {
  montarComum(doc, dados, agora);
  montarFrases(doc, dados.frases);
  const lista = doc.getElementById('lista-falas') as HTMLElement;
  const filtro = doc.getElementById('filtro-falas') as HTMLElement;
  lista.replaceChildren();
  filtro.replaceChildren();

  // A mesma checagem nas duas listas aparece só na automática, que traz as frases.
  const automaticas = new Set(dados.frases.map((f) => f.url));
  const tipo = lerTipoFala(search);
  const ordenadas = dados.falas.filter((f) => !automaticas.has(f.url)).sort((a, b) =>
    b.data.localeCompare(a.data) || b.publicadaEm.localeCompare(a.publicadaEm) || a.id.localeCompare(b.id));
  montarFiltro(doc, filtro, ordenadas, tipo);

  const visiveis = tipo ? ordenadas.filter((f) => f.tipo === tipo) : ordenadas;
  if (visiveis.length === 0) {
    const de = tipo ? ` de ${ROTULO_TIPO_FALA[tipo].varios.toLowerCase()}` : '';
    lista.append(el(doc, 'li', { class: 'vazio' }, `Nenhuma checagem${de} registrada até agora.`));
    return;
  }
  lista.append(...visiveis.map((f) => renderFala(doc, f)));
}
