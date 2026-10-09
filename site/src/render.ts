import type { Evento, Fonte, Noticia, Status, TipoEvento } from '../../src/shared/schema';
import { urlHttpsSegura } from '../../src/shared/text';

type Filho = Node | string | null | undefined | false;

export function el(doc: Document, tag: string, atributos: Record<string, string> = {}, ...filhos: Filho[]): HTMLElement {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, v);
  for (const f of filhos) if (f) e.append(f); // string vira nó de texto, nunca HTML
  return e;
}

export const ROTULO_STATUS: Record<Status, { icone: string; texto: string }> = {
  agendado: { icone: '🕐', texto: 'Agendado' },
  consta_na_agenda: { icone: '📋', texto: 'Consta na agenda' },
  realizado: { icone: '✅', texto: 'Realizado' },
  publicado: { icone: '📜', texto: 'Publicado no Diário Oficial' },
  alterado: { icone: '⚠️', texto: 'Alterado na agenda' },
  removido: { icone: '⚠️', texto: 'Removido da agenda' },
};

export const ROTULO_TIPO: Record<TipoEvento, string> = {
  agenda: 'Agenda',
  ato: 'Ato oficial',
  comunicado: 'Comunicado do Planalto',
};

const TEXTO_LINK: Record<string, string> = {
  'agenda-planalto': 'Agenda do dia',
  'comunicado-planalto': 'Comunicado',
  dou: 'Ato publicado',
  'texto-planalto': 'Texto do ato',
};

export function formatarDataLonga(data: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(`${data}T12:00:00Z`));
}

export function formatarDataCurta(data: string): string {
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}

function linkOuTexto(doc: Document, url: string, texto: string): HTMLElement {
  const href = urlHttpsSegura(url);
  return href ? el(doc, 'a', { href, rel: 'noopener noreferrer', target: '_blank' }, texto) : el(doc, 'span', {}, texto);
}

export function renderFontes(doc: Document, fontes: Fonte[]): HTMLElement {
  const n = new Set(fontes.map((f) => f.url)).size;
  const lista = el(doc, 'ul', { class: 'fontes' });
  for (const f of fontes) {
    lista.append(el(doc, 'li', {}, linkOuTexto(doc, f.url, `${TEXTO_LINK[f.nome] ?? 'Fonte'} — ${f.rotulo}`)));
  }
  return el(doc, 'div', { class: 'bloco-fontes' },
    el(doc, 'p', { class: 'selo' }, n >= 2 ? `Confirmado por ${n} fontes` : 'Fonte única'), lista);
}

export function renderEvento(doc: Document, ev: Evento, nivelTitulo = 4): HTMLElement {
  const st = ROTULO_STATUS[ev.status];
  const li = el(doc, 'li', {
    class: `evento tipo-${ev.tipo} status-${ev.status}`,
    id: `ev-${ev.id.replace(/[^a-zA-Z0-9._-]/g, '-')}`,
  });
  li.append(el(doc, 'p', { class: 'evento-meta' },
    ev.hora && el(doc, 'time', { datetime: `${ev.data}T${ev.hora}` }, ev.hora),
    el(doc, 'span', { class: 'tipo' }, ROTULO_TIPO[ev.tipo]),
    el(doc, 'span', { class: 'status' }, el(doc, 'span', { 'aria-hidden': 'true' }, st.icone), ` ${st.texto}`)));
  li.append(el(doc, `h${nivelTitulo}`, { class: 'evento-titulo' }, ev.titulo));
  if (ev.local) li.append(el(doc, 'p', { class: 'local' }, ev.local));
  if (ev.ementa) li.append(el(doc, 'p', { class: 'ementa' }, ev.ementa));
  if (ev.datasAto) {
    li.append(el(doc, 'p', { class: 'datas-ato' },
      ev.datasAto.assinatura ? `Assinado em ${formatarDataCurta(ev.datasAto.assinatura)} · ` : '',
      `Publicado em ${formatarDataCurta(ev.datasAto.publicacao)}`));
  }
  if (ev.historico.length > 0) {
    const versoes = el(doc, 'ul');
    for (const v of ev.historico) {
      versoes.append(el(doc, 'li', {}, [v.hora, v.titulo, v.local].filter(Boolean).join(' · ')));
    }
    li.append(el(doc, 'details', {}, el(doc, 'summary', {}, `Versões anteriores (${ev.historico.length})`), versoes));
  }
  li.append(renderFontes(doc, ev.fontes));
  return li;
}

export function renderNoticia(doc: Document, n: Noticia): HTMLElement {
  const quando = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(n.data));
  return el(doc, 'li', { class: 'noticia' },
    el(doc, 'h3', { class: 'evento-titulo' }, linkOuTexto(doc, n.url, n.titulo)),
    el(doc, 'p', { class: 'local' }, `${n.veiculo} · ${quando}`));
}
