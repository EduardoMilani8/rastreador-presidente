import { TipoFalaSchema, type EstadoFontes, type FalaChecada, type TipoFala } from '../../src/shared/schema';
import { montarComum } from './comum';
import { el, formatarDataCurta, linkOuTexto } from './render';

export interface DadosFalas {
  falas: FalaChecada[];
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
    el(doc, 'h2', { class: 'evento-titulo' }, f.evento),
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

export function montarPaginaFalas(doc: Document, dados: DadosFalas, agora: Date, search: string): void {
  montarComum(doc, dados, agora);
  const lista = doc.getElementById('lista-falas') as HTMLElement;
  const filtro = doc.getElementById('filtro-falas') as HTMLElement;
  lista.replaceChildren();
  filtro.replaceChildren();

  const tipo = lerTipoFala(search);
  const ordenadas = [...dados.falas].sort((a, b) =>
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
