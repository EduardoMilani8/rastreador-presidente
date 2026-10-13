import type { EstadoFontes } from '../../src/shared/schema';
import type { Dados } from './dados';
import { dataSaoPaulo } from '../../src/shared/text';
import { formatarDataLonga } from './render';

const NOME_FONTE: Record<string, string> = {
  agenda: 'Agenda do Planalto',
  dou: 'Diário Oficial',
  planalto: 'Comunicados do Planalto',
  'noticias-google': 'Google Notícias',
  'noticias-agencia-brasil': 'Agência Brasil',
};

function haQuanto(iso: string, agora: Date): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.round((agora.getTime() - t) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)} h`;
  const dias = Math.floor(min / 1440);
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

// O instante gravado é o da última ALTERAÇÃO nos dados, não o da última coleta: numa madrugada sem notícia nova ele
// fica até ~12 horas parado com tudo funcionando. Por isso o aviso só aparece depois de 24 horas e não afirma que a
// coleta parou — só diz até quando os dados vão.
const LIMITE_SEM_ALTERACAO_MS = 24 * 60 * 60 * 1000;

function avisoDesatualizado(iso: string | undefined, agora: Date): string | null {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(t) || agora.getTime() - t <= LIMITE_SEM_ALTERACAO_MS) return null;
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(t));
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '';
  return `Última alteração nos dados: ${p('day')}/${p('month')}/${p('year')} às ${p('hour')}:${p('minute')} (horário de Brasília). `
    + 'Se as fontes publicaram algo depois disso, ainda não aparece aqui.';
}

const AVISO_INCOMPLETO = 'Alguns dados não puderam ser carregados; a lista pode estar incompleta.';

function textoAviso(estado: EstadoFontes): string | null {
  const falhas = Object.entries(estado.fontes).filter(([, s]) => !s.ok).map(([n]) => NOME_FONTE[n] ?? n);
  return falhas.length ? `Atenção: sem atualizar agora — ${falhas.join(', ')}. Os dados já exibidos continuam valendo.` : null;
}

/** A data de hoje não depende dos dados: as páginas a preenchem antes de carregá-los. */
export function montarHoje(doc: Document, agora: Date): void {
  // A página Sobre não tem a faixa de data nem chama montarComum: lá este elemento não existe.
  const hoje = doc.getElementById('hoje');
  if (hoje) hoje.textContent = formatarDataLonga(dataSaoPaulo(agora));
}

/** O que toda página com dados mostra: há quanto tempo os dados mudaram e os três avisos do cabeçalho. */
export function montarComum(doc: Document, dados: Pick<Dados, 'estado' | 'incompleto'>, agora: Date): void {
  const $ = (id: string) => doc.getElementById(id) as HTMLElement;

  montarHoje(doc, agora);

  const quando = dados.estado.ultimaNovidadeEm ? haQuanto(dados.estado.ultimaNovidadeEm, agora) : null;
  $('ultima-novidade').textContent = quando ? `Última alteração nos dados ${quando}` : '';
  const parado = avisoDesatualizado(dados.estado.ultimaNovidadeEm, agora);
  $('aviso-desatualizado').hidden = parado === null;
  $('aviso-desatualizado').textContent = parado ?? '';
  const aviso = textoAviso(dados.estado);
  $('aviso-fontes').hidden = aviso === null;
  $('aviso-fontes').textContent = aviso ?? '';
  $('aviso-incompleto').hidden = !dados.incompleto;
  $('aviso-incompleto').textContent = dados.incompleto ? AVISO_INCOMPLETO : '';
}
