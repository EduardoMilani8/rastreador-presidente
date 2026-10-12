import type { Evento, Fonte, Noticia, Status, TipoEvento } from '../../src/shared/schema';
import { urlHttpsSegura } from '../../src/shared/text';
import { icone, type NomeIcone } from './icones';

type Filho = Node | string | null | undefined | false;

export function el(doc: Document, tag: string, atributos: Record<string, string> = {}, ...filhos: Filho[]): HTMLElement {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, v);
  for (const f of filhos) if (f) e.append(f); // string vira nó de texto, nunca HTML
  return e;
}

export const ROTULO_STATUS: Record<Status, { icone: NomeIcone; texto: string }> = {
  agendado: { icone: 'relogio', texto: 'Agendado' },
  consta_na_agenda: { icone: 'lista', texto: 'Consta na agenda' },
  realizado: { icone: 'visto', texto: 'Realizado' },
  publicado: { icone: 'documento', texto: 'Publicado no Diário Oficial' },
  alterado: { icone: 'lapis', texto: 'Alterado na agenda' },
  removido: { icone: 'cortado', texto: 'Removido da agenda' },
};

export const ROTULO_COMUNICADO: { icone: NomeIcone; texto: string } = { icone: 'balao', texto: 'Publicado no site do Planalto' };

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

export function linkOuTexto(doc: Document, url: string, texto: string): HTMLElement {
  const href = urlHttpsSegura(url);
  return href ? el(doc, 'a', { href, rel: 'noopener noreferrer', target: '_blank' }, texto) : el(doc, 'span', {}, texto);
}

export function renderFontes(doc: Document, fontes: Fonte[]): HTMLElement {
  // Conta tipos de documento, não links: o DOU e a retificação do mesmo ato no DOU são uma fonte só.
  const n = new Set(fontes.map((f) => f.nome)).size;
  const lista = el(doc, 'ul', { class: 'fontes' });
  for (const f of fontes) {
    lista.append(el(doc, 'li', {}, linkOuTexto(doc, f.url, `${TEXTO_LINK[f.nome] ?? 'Fonte'} — ${f.rotulo}`)));
  }
  return el(doc, 'div', { class: 'bloco-fontes' },
    el(doc, 'p', { class: 'selo' }, n >= 2 ? `Confirmado por ${n} fontes` : 'Fonte única'), lista);
}

export function idAncora(ev: Evento): string {
  return `ev-${ev.id.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
}

// Endereço estável de um registro: a página de registros só do dia dele (que sempre o contém) mais a âncora.
// Leva o nome do arquivo para valer em qualquer página que desenhe o cartão.
function linkPermanente(doc: Document, ev: Evento): HTMLElement {
  const q = new URLSearchParams({ de: ev.data, ate: ev.data });
  // Numa lista de links do leitor de tela todos seriam "Link permanente": o nome acessível leva o título do item
  // (e começa pelo texto visível, para quem usa comando de voz).
  return el(doc, 'a', {
    class: 'permalink', href: `registros.html?${q.toString()}#${idAncora(ev)}`, 'aria-label': `Link permanente: ${ev.titulo}`,
  }, 'Link permanente');
}

export interface OpcoesEvento {
  nivelTitulo?: number;
  /** `false` para cópias do mesmo item (próximos): só a linha do tempo leva o id âncora. */
  comId?: boolean;
  /** Nos próximos não há título de dia acima do cartão: a data vai junto da hora. */
  comData?: boolean;
}

export function renderEvento(
  doc: Document, ev: Evento, { nivelTitulo = 4, comId = true, comData = false }: OpcoesEvento = {},
): HTMLElement {
  // Comunicado do Planalto é, em geral, um aviso de pauta publicado ANTES do evento: nunca mostra "Realizado".
  const st = ev.tipo === 'comunicado' ? ROTULO_COMUNICADO : ROTULO_STATUS[ev.status];
  const li = el(doc, 'li', { class: `evento tipo-${ev.tipo} status-${ev.status}` });
  if (comId) li.id = idAncora(ev);
  const corpo = el(doc, 'div', { class: 'evento-corpo' });

  const quando = comData ? [formatarDataCurta(ev.data), ev.hora].filter(Boolean).join(' · ') : ev.hora;
  if (quando) {
    const hora = el(doc, 'time', { class: 'evento-hora', datetime: ev.hora ? `${ev.data}T${ev.hora}` : ev.data }, quando);
    if (comData) {
      corpo.append(hora);
    } else {
      li.classList.add('com-hora');
      li.append(hora);
    }
  }

  corpo.append(el(doc, 'p', { class: 'evento-meta' },
    el(doc, 'span', { class: 'tipo' }, ROTULO_TIPO[ev.tipo]),
    el(doc, 'span', { class: 'status' }, icone(doc, st.icone), ` ${st.texto}`)));
  corpo.append(el(doc, `h${nivelTitulo}`, { class: 'evento-titulo' }, ev.titulo));
  if (ev.local) corpo.append(el(doc, 'p', { class: 'local' }, ev.local));
  if (ev.ementa) corpo.append(el(doc, 'p', { class: 'ementa' }, ev.ementa));
  if (ev.tipo === 'comunicado') {
    corpo.append(el(doc, 'p', { class: 'datas-ato' },
      `Data de publicação do texto: ${formatarDataCurta(ev.data)}. O compromisso descrito pode ser em outra data.`));
  }
  if (ev.datasAto) {
    corpo.append(el(doc, 'p', { class: 'datas-ato' },
      ev.datasAto.assinatura ? `Assinado em ${formatarDataCurta(ev.datasAto.assinatura)} · ` : '',
      `Publicado em ${formatarDataCurta(ev.datasAto.publicacao)}`));
  }
  if (ev.historico.length > 0) {
    const versoes = el(doc, 'ul');
    for (const v of ev.historico) {
      versoes.append(el(doc, 'li', {}, [v.hora, v.titulo, v.local].filter(Boolean).join(' · ')));
    }
    corpo.append(el(doc, 'details', {}, el(doc, 'summary', {}, `Versões anteriores (${ev.historico.length})`), versoes));
  }
  // O link permanente fica na faixa das fontes, mas fora da lista: não é fonte e não entra na contagem do selo.
  // Vem logo depois do selo porque é assim que aparece na tela: a ordem do foco segue a ordem visual.
  const fontes = renderFontes(doc, ev.fontes);
  fontes.querySelector('.selo')?.after(linkPermanente(doc, ev));
  corpo.append(fontes);
  li.append(corpo);
  return li;
}

export function formatarDataHoraNoticia(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(iso));
}

export function renderNoticia(doc: Document, n: Noticia, titulo: 'h2' | 'h3' = 'h3'): HTMLElement {
  return el(doc, 'li', { class: 'noticia' },
    el(doc, titulo, { class: 'evento-titulo' }, linkOuTexto(doc, n.url, n.titulo)),
    el(doc, 'p', { class: 'local' }, `${n.veiculo} · ${formatarDataHoraNoticia(n.data)}`));
}
