import { montarComum } from './comum';
import type { Dados } from './dados';
import { agruparPorDia, ehProximo, filtrarEventos, proximos } from './filtrar';
import type { Filtros } from './params';
import { el, formatarDataCurta, renderEvento, tituloDoDia } from './render';

// Uma busca a partir de 2023 traz mais de 8 mil itens: desenhar tudo de uma vez trava o celular.
const DIAS_POR_LOTE = 60;

const numero = new Intl.NumberFormat('pt-BR');
const contar = (n: number, um: string, varios: string) => `${numero.format(n)} ${n === 1 ? um : varios}`;

function limpar(e: HTMLElement): void {
  e.replaceChildren();
}

export function montarRegistros(doc: Document, dados: Dados, f: Filtros, hoje: string, agora: Date): void {
  const $ = (id: string) => doc.getElementById(id) as HTMLElement;

  montarComum(doc, dados, agora);

  for (const nome of ['de', 'ate', 'tipo', 'status'] as const) {
    const campo = doc.querySelector<HTMLInputElement | HTMLSelectElement>(`#filtros [name=${nome}]`);
    if (campo) campo.value = f[nome] ?? '';
  }

  const filtrando = Boolean(f.tipo || f.status || f.de || f.ate);
  // Recolhido, o formulário não empurra a lista para fora da primeira tela; com filtro em uso, fica à vista.
  ($('caixa-filtros') as HTMLDetailsElement).open = filtrando;
  const prox = filtrando ? [] : proximos(dados.eventos, hoje);

  $('bloco-proximos').hidden = prox.length === 0;
  limpar($('proximos'));
  for (const e of prox) $('proximos').append(renderEvento(doc, e, { nivelTitulo: 3, comId: false, comData: true }));

  // Sem filtro, exatamente o que aparece na faixa de próximos sai da linha do tempo;
  // agendados com data passada (defasados) continuam nela.
  const base = filtrando ? dados.eventos : dados.eventos.filter((e) => !ehProximo(e, hoje));
  const itens = filtrarEventos(base, f);
  const grupos = agruparPorDia(itens);

  // O período é o que foi de fato consultado: sem datas, só os meses carregados — e a página diz isso, para um
  // "nenhum registro" nunca ser lido como "não existe".
  const mesMaisAntigo = [...dados.mesesCarregados].sort()[0];
  // Pedir "desde 2020" não faz existirem dados de 2020: o período nunca começa antes do primeiro mês disponível.
  const primeiroDia = [...dados.mesesDisponiveis].sort()[0];
  const pedido = f.de ?? (mesMaisAntigo ? `${mesMaisAntigo}-01` : undefined);
  const inicio = pedido && primeiroDia && pedido < `${primeiroDia}-01` ? `${primeiroDia}-01` : pedido;
  const fim = f.ate ?? itens.reduce((max, e) => (e.data > max ? e.data : max), hoje);
  const contagem = itens.length ? `: ${contar(itens.length, 'registro', 'registros')} em ${contar(grupos.length, 'dia', 'dias')}` : '';
  $('periodo').textContent = !inicio ? ''
    : `Mostrando ${inicio > fim ? `a partir de ${formatarDataCurta(inicio)}` : `${formatarDataCurta(inicio)} a ${formatarDataCurta(fim)}`}${contagem}.`;

  const mesAnterior = inicio ? dados.mesesDisponiveis.filter((m) => m < inicio.slice(0, 7)).sort().pop() : undefined;
  const maisAntigos = $('mais-antigos');
  if (mesAnterior) {
    const q = new URLSearchParams({ de: `${mesAnterior}-01` });
    if (f.ate) q.set('ate', f.ate);
    if (f.tipo) q.set('tipo', f.tipo);
    if (f.status) q.set('status', f.status);
    maisAntigos.querySelector('a')?.setAttribute('href', `registros.html?${q.toString()}`);
  }

  const destino = $('linha-do-tempo');
  const maisDias = $('mais-dias');
  limpar(destino);
  let mostrados = 0;
  const mostrarLote = (): HTMLElement | undefined => {
    const lote = grupos.slice(mostrados, mostrados + DIAS_POR_LOTE).map((g) =>
      el(doc, 'section', { class: 'dia' },
        el(doc, 'h3', {}, tituloDoDia(doc, g.data), ' ',
          el(doc, 'span', { class: 'dia-conta' }, contar(g.itens.length, 'registro', 'registros'))),
        el(doc, 'ol', { class: 'lista' }, ...g.itens.map((e) => renderEvento(doc, e)))));
    destino.append(...lote);
    mostrados += lote.length;

    const resta = mostrados < grupos.length;
    limpar(maisDias);
    maisDias.hidden = !resta;
    if (resta) {
      const botao = el(doc, 'button', { type: 'button' }, 'Mostrar mais dias');
      botao.addEventListener('click', () => {
        // O botão é refeito (ou some) a cada lote: o foco vai para o primeiro dia novo, de onde a leitura continua.
        const titulo = mostrarLote()?.querySelector('h3');
        titulo?.setAttribute('tabindex', '-1');
        titulo?.focus();
      });
      maisDias.append(botao, el(doc, 'span', {}, `Exibindo ${numero.format(mostrados)} de ${contar(grupos.length, 'dia', 'dias')}.`));
    }
    // "Meses anteriores" continua de onde a lista termina: só aparece quando ela já está inteira na tela.
    maisAntigos.hidden = !mesAnterior || resta;
    return lote[0];
  };
  mostrarLote();

  if (grupos.length === 0) {
    destino.append(el(doc, 'p', { class: 'vazio' },
      filtrando || mesAnterior ? 'Nenhum registro neste período.' : 'Ainda não há registros para mostrar.'));
  }
}

/** Rola até o item indicado pela âncora do endereço (`#ev-...`). Só `getElementById`: a âncora nunca vira seletor. */
export function irParaAncora(doc: Document, hash: string): void {
  if (!hash.startsWith('#ev-')) return;
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return;
  }
  const alvo = doc.getElementById(id);
  if (!alvo) return;
  alvo.classList.add('em-destaque');
  alvo.setAttribute('tabindex', '-1');
  alvo.focus({ preventScroll: true });
  alvo.scrollIntoView?.();
}
