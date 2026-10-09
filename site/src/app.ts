import type { EstadoFontes } from '../../src/shared/schema';
import type { Dados } from './dados';
import { agruparPorDia, ehProximo, filtrarEventos, proximos, ultimoRegistro } from './filtrar';
import type { Filtros } from './params';
import { el, formatarDataLonga, renderEvento, renderNoticia } from './render';

const NOME_FONTE: Record<string, string> = {
  agenda: 'Agenda do Planalto',
  dou: 'Diário Oficial',
  planalto: 'Comunicados do Planalto',
  'noticias-google': 'Google Notícias',
  'noticias-agencia-brasil': 'Agência Brasil',
};

function haQuanto(iso: string, agora: Date): string {
  const min = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)} h`;
  return `há ${Math.floor(min / 1440)} dia(s)`;
}

const AVISO_INCOMPLETO = 'Alguns dados não puderam ser carregados; a lista pode estar incompleta.';

function limpar(e: HTMLElement): void {
  e.replaceChildren();
}

function textoAviso(estado: EstadoFontes): string | null {
  const falhas = Object.entries(estado.fontes).filter(([, s]) => !s.ok).map(([n]) => NOME_FONTE[n] ?? n);
  return falhas.length ? `Atenção: sem atualizar agora — ${falhas.join(', ')}. Os dados já exibidos continuam valendo.` : null;
}

export function montar(doc: Document, dados: Dados, f: Filtros, hoje: string, agora: Date): void {
  const $ = (id: string) => doc.getElementById(id) as HTMLElement;
  const linha = f.aba === 'linha';

  $('painel-linha').hidden = !linha;
  $('painel-noticias').hidden = linha;
  $(linha ? 'aba-linha' : 'aba-noticias').setAttribute('aria-current', 'page');
  $(linha ? 'aba-noticias' : 'aba-linha').removeAttribute('aria-current');

  $('ultima-novidade').textContent = dados.estado.ultimaNovidadeEm
    ? `Última novidade ${haQuanto(dados.estado.ultimaNovidadeEm, agora)}`
    : '';
  const aviso = textoAviso(dados.estado);
  $('aviso-fontes').hidden = aviso === null;
  $('aviso-fontes').textContent = aviso ?? '';
  $('aviso-incompleto').hidden = !dados.incompleto;
  $('aviso-incompleto').textContent = dados.incompleto ? AVISO_INCOMPLETO : '';

  for (const nome of ['de', 'ate', 'tipo', 'status'] as const) {
    const campo = doc.querySelector<HTMLInputElement | HTMLSelectElement>(`#filtros [name=${nome}]`);
    if (campo) campo.value = f[nome] ?? '';
  }

  const lista = $('lista-noticias');
  limpar(lista);
  for (const n of dados.noticias) lista.append(renderNoticia(doc, n));
  if (!linha) return;

  const filtrando = Boolean(f.tipo || f.status || f.de || f.ate);
  const ultimo = filtrando ? undefined : ultimoRegistro(dados.eventos, hoje);
  const prox = filtrando ? [] : proximos(dados.eventos, hoje);

  $('bloco-ultimo').hidden = !ultimo;
  limpar($('ultimo-registro'));
  if (ultimo) $('ultimo-registro').append(el(doc, 'ul', { class: 'lista' }, renderEvento(doc, ultimo, 3)));

  $('bloco-proximos').hidden = prox.length === 0;
  limpar($('proximos'));
  for (const e of prox) $('proximos').append(renderEvento(doc, e, 3));

  // Sem filtro, exatamente o que aparece na faixa de próximos sai da linha do tempo;
  // agendados com data passada (defasados) continuam nela.
  const base = filtrando ? dados.eventos : dados.eventos.filter((e) => !ehProximo(e, hoje));
  const grupos = agruparPorDia(filtrarEventos(base, f));
  const destino = $('linha-do-tempo');
  limpar(destino);
  if (grupos.length === 0) {
    destino.append(el(doc, 'p', { class: 'vazio' }, 'Nenhum registro encontrado para estes filtros.'));
    return;
  }
  for (const g of grupos) {
    destino.append(el(doc, 'section', { class: 'dia' },
      el(doc, 'h3', {}, el(doc, 'time', { datetime: g.data }, formatarDataLonga(g.data))),
      el(doc, 'ol', { class: 'lista' }, ...g.itens.map((e) => renderEvento(doc, e, 4)))));
  }
}
