import * as cheerio from 'cheerio';
import type { Evento } from '../shared/schema';
import { limparEspacos } from '../shared/text';

export class LayoutError extends Error {}

export interface ResultadoAgenda {
  eventos: Evento[];
  diaPublicado: boolean;
}

export function urlAgendaDia(base: string, data: string): string {
  return `${base}/${data}`;
}

function extrairHora(txt: string): string | undefined {
  const m = txt.match(/(\d{1,2})\s*h\s*(\d{2})?/i);
  if (!m) return undefined;
  return `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`;
}

export function parseAgenda(
  corpo: string, status: number, data: string, coletadoEm: string, urlPagina: string,
): ResultadoAgenda {
  const $ = cheerio.load(corpo);
  // O título da página de um dia publicado é "Agenda de Presidente ..."; o da página 404 é "Agenda do Presidente ...".
  if (!/agenda d[eo] presidente/i.test($('title').first().text())) {
    throw new LayoutError(`Página inesperada (HTTP ${status}) para ${data}`);
  }
  // Dia sem agenda publicada: o servidor responde 404 com a página padrão.
  if (status === 404) return { eventos: [], diaPublicado: false };
  if (status !== 200) throw new LayoutError(`HTTP ${status} inesperado para ${data}`);

  const lista = $('.list-compromissos');
  if (lista.length === 0) throw new LayoutError(`Contêiner .list-compromissos ausente em ${data}`);

  const contagem = new Map<string, number>();
  const eventos: Evento[] = [];
  lista.find('.item-compromisso').each((_, el) => {
    const item = $(el);
    const titulo = limparEspacos(item.find('.compromisso-titulo').text());
    if (!titulo) return;
    const hora = extrairHora(item.find('.compromisso-inicio').text());
    const local = limparEspacos(item.find('.compromisso-local').text()) || undefined;
    const chave = hora ?? 'sem-hora';
    const n = (contagem.get(chave) ?? 0) + 1;
    contagem.set(chave, n);
    eventos.push({
      id: `agenda:${data}:${chave}:${n}`,
      tipo: 'agenda',
      data,
      hora,
      titulo,
      local,
      status: 'agendado',
      fontes: [{ nome: 'agenda-planalto', rotulo: 'Planalto (governo)', url: urlPagina, coletadoEm }],
      confirmadoPor: [],
      historico: [],
    });
  });

  if (eventos.length === 0) {
    // Contêiner com conteúdo, mas nenhum item legível: o layout mudou. Reportar "dia publicado sem
    // compromissos" faria o pipeline marcar remoções falsas.
    if (limparEspacos(lista.text()) !== '') {
      throw new LayoutError(
        `Encontrei conteúdo em .list-compromissos em ${data}, mas nenhum compromisso pôde ser lido (layout alterado?)`,
      );
    }
    // Contêiner realmente vazio: conservador, nunca deixa o pipeline marcar remoções.
    return { eventos: [], diaPublicado: false };
  }
  return { eventos, diaPublicado: true };
}
