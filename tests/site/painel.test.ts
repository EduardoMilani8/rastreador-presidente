// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Dados } from '../../site/src/dados';
import { DIAS_DO_PAINEL, ITENS_DO_DETALHE, diasDoPainel, faixaDeTamanho, montarPainel } from '../../site/src/painel';
import type { Evento, TipoEvento } from '../../src/shared/schema';

const PAGINA = () => readFileSync(resolve(process.cwd(), 'site/index.html'), 'utf8');
const T = '2026-10-08T12:00:00.000Z';
const HOJE = '2026-10-08';

function ev(id: string, tipo: TipoEvento, data: string, extra: Partial<Evento> = {}): Evento {
  return {
    id, tipo, data, titulo: `Título ${id}`, status: tipo === 'ato' ? 'publicado' : 'consta_na_agenda',
    fontes: [{ nome: 'n', rotulo: 'r', url: 'https://x.test/a', coletadoEm: T }],
    confirmadoPor: [], historico: [], ...extra,
  };
}

const EVENTOS: Evento[] = [
  ev('a1', 'agenda', '2026-10-07', { hora: '10:00' }),
  ev('t1', 'ato', '2026-10-07'),
  ev('t2', 'ato', '2026-10-07'),
  ev('t3', 'ato', '2026-10-07'),
  ev('r1', 'agenda', '2026-10-05', { hora: '09:00' }),
];

const DADOS: Dados = {
  eventos: EVENTOS, noticias: [], estado: { fontes: {} }, incompleto: false,
  mesesCarregados: ['2026-10'], mesesDisponiveis: ['2026-10'],
};

beforeEach(() => {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.innerHTML = PAGINA();
});

const botoes = () => [...document.querySelectorAll<HTMLButtonElement>('#linha-dias button.dia')];
const botao = (dia: string) => document.querySelector<HTMLButtonElement>(`button.dia[data-dia="${dia}"]`)!;

describe('diasDoPainel', () => {
  it('devolve 21 dias consecutivos terminando em hoje, do mais antigo ao mais recente', () => {
    const dias = diasDoPainel([], HOJE);
    expect(dias).toHaveLength(21);
    expect(dias[0].data).toBe('2026-09-18');
    expect(dias[20].data).toBe(HOJE);
  });

  it('atravessa a virada do ano sem repetir nem pular dia', () => {
    const dias = diasDoPainel([], '2026-01-03').map((d) => d.data);
    expect(dias[0]).toBe('2025-12-14');
    expect(dias[20]).toBe('2026-01-03');
    expect(new Set(dias).size).toBe(21);
    expect(dias).toContain('2025-12-31');
    expect(dias).toContain('2026-01-01');
  });

  it('o número de dias padrão é a constante exportada', () => {
    expect(diasDoPainel([], HOJE)).toHaveLength(DIAS_DO_PAINEL);
  });

  it('aceita outro tamanho', () => {
    expect(diasDoPainel([], HOJE, 3).map((d) => d.data)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08']);
  });

  it('conta por tipo e ignora agenda removida', () => {
    const eventos = [
      ...EVENTOS,
      ev('rem', 'agenda', '2026-10-07', { status: 'removido' }),
      ev('c1', 'comunicado', '2026-10-07'),
    ];
    const dia = diasDoPainel(eventos, HOJE).find((d) => d.data === '2026-10-07')!;
    expect(dia).toMatchObject({ agenda: 1, atos: 3, comunicados: 1, removidos: 1 });
  });

  it('itens: até três, atos primeiro, depois a agenda por hora', () => {
    const eventos = [
      ev('z-ag2', 'agenda', '2026-10-07', { hora: '15:00' }),
      ev('z-ag1', 'agenda', '2026-10-07', { hora: '08:00' }),
      ev('b-ato', 'ato', '2026-10-07'),
      ev('a-ato', 'ato', '2026-10-07'),
    ];
    const dia = diasDoPainel(eventos, HOJE).find((d) => d.data === '2026-10-07')!;
    expect(dia.itens.map((e) => e.id)).toEqual(['a-ato', 'b-ato', 'z-ag1']);
    const so = diasDoPainel([ev('x', 'agenda', '2026-10-07', { hora: '10:00' })], HOJE).find((d) => d.data === '2026-10-07')!;
    expect(so.itens).toHaveLength(1);
  });

  it('itens: a agenda removida entra por último, respeitando o máximo de três', () => {
    const dia = diasDoPainel([ev('rem', 'agenda', '2026-10-07', { status: 'removido' })], HOJE)
      .find((d) => d.data === '2026-10-07')!;
    expect(dia.itens.map((e) => e.id)).toEqual(['rem']);
    const cheio = diasDoPainel([
      ev('rem', 'agenda', '2026-10-07', { status: 'removido' }),
      ev('c1', 'comunicado', '2026-10-07'),
      ev('a1', 'agenda', '2026-10-07', { hora: '10:00' }),
      ev('t1', 'ato', '2026-10-07'),
    ], HOJE).find((d) => d.data === '2026-10-07')!;
    expect(cheio.itens.map((e) => e.id)).toEqual(['t1', 'a1', 'c1']);
  });
});

describe('faixaDeTamanho', () => {
  it.each([
    [0, 0], [1, 1], [2, 2], [3, 2], [4, 3], [6, 3], [7, 4], [10, 4], [11, 5], [500, 5],
  ])('%i vira a faixa %i', (n, faixa) => {
    expect(faixaDeTamanho(n)).toBe(faixa);
  });
});

describe('montarPainel', () => {
  it('cria 21 botões de dia, com rótulo por extenso e faixas de tamanho', () => {
    montarPainel(document, DADOS, HOJE);
    expect(botoes()).toHaveLength(21);
    const dia = botao('2026-10-07');
    expect(dia.getAttribute('type')).toBe('button');
    expect(dia.getAttribute('aria-label')).toBe('quarta-feira, 7 de outubro de 2026: 1 compromisso, 3 atos');
    expect(botao('2026-10-06').getAttribute('aria-label')).toBe('terça-feira, 6 de outubro de 2026: 0 compromissos, 0 atos');
    expect(dia.querySelector('.marca-ato')!.classList.contains('tam-2')).toBe(true);
    expect(dia.querySelector('.marca-agenda')!.classList.contains('tam-1')).toBe(true);
    expect(dia.querySelector('.dia-num')!.textContent).toBe('07');
    for (const s of dia.querySelectorAll('span')) expect(s.getAttribute('aria-hidden')).toBe('true');
    expect(botao('2026-10-06').querySelector('.marca-vazio')).not.toBeNull();
    expect(botao('2026-10-06').querySelector('.marca-ato, .marca-agenda')).toBeNull();
  });

  it('comunicados entram no rótulo só quando existem', () => {
    montarPainel(document, { ...DADOS, eventos: [ev('c', 'comunicado', '2026-10-07'), ...EVENTOS] }, HOJE);
    expect(botao('2026-10-07').getAttribute('aria-label'))
      .toBe('quarta-feira, 7 de outubro de 2026: 1 compromisso, 3 atos, 1 comunicado');
  });

  it('abrevia o mês só no primeiro botão e no dia 1', () => {
    montarPainel(document, DADOS, '2026-10-08');
    const comMes = botoes().filter((b) => b.querySelector('.dia-mes'));
    expect(comMes.map((b) => b.dataset.dia)).toEqual(['2026-09-18', '2026-10-01']);
    expect(comMes.map((b) => b.querySelector('.dia-mes')!.textContent)).toEqual(['set', 'out']);
  });

  it('não cria nenhum atributo style', () => {
    montarPainel(document, DADOS, HOJE);
    expect(document.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('começa com o dia mais recente com registro selecionado', () => {
    montarPainel(document, DADOS, HOJE);
    expect(botao('2026-10-07').getAttribute('aria-pressed')).toBe('true');
    expect(botoes().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    const detalhe = document.getElementById('detalhe-dia')!;
    expect(detalhe.querySelector('h3')!.textContent).toBe('Quarta-feira, 7 de outubro de 2026');
    expect(detalhe.querySelector('.detalhe-resumo')!.textContent).toBe('1 compromisso, 3 atos');
    const itens = [...detalhe.querySelectorAll('.detalhe-itens li')];
    expect(itens).toHaveLength(3);
    expect(itens[0].querySelector('.quando')!.textContent).toBe('Ato');
    expect(itens[0].textContent).toContain('Título t1');
    expect(detalhe.querySelector('a')!.getAttribute('href')).toBe('registros.html?de=2026-10-07&ate=2026-10-07');
    expect(detalhe.querySelector('a')!.textContent).toBe('Ver os registros do dia, com as fontes');
  });

  it('mostra a hora de um compromisso no detalhe', () => {
    montarPainel(document, { ...DADOS, eventos: [EVENTOS[0]] }, HOJE);
    expect(document.querySelector('.detalhe-itens .quando')!.textContent).toBe('10:00');
  });

  it.each(['click', 'focus', 'mouseenter'])('%s seleciona o dia e troca o detalhe', (tipo) => {
    montarPainel(document, DADOS, HOJE);
    botao('2026-10-05').dispatchEvent(new Event(tipo, { bubbles: false }));
    expect(botao('2026-10-05').getAttribute('aria-pressed')).toBe('true');
    expect(botao('2026-10-07').getAttribute('aria-pressed')).toBe('false');
    const detalhe = document.getElementById('detalhe-dia')!;
    expect(detalhe.querySelector('h3')!.textContent).toBe('Segunda-feira, 5 de outubro de 2026');
    expect(detalhe.querySelector('.detalhe-resumo')!.textContent).toBe('1 compromisso, 0 atos');
    expect(detalhe.querySelector('a')!.getAttribute('href')).toBe('registros.html?de=2026-10-05&ate=2026-10-05');
    expect(detalhe.querySelectorAll('.detalhe-itens li')).toHaveLength(1);
  });

  it('dia vazio selecionado mostra a frase de vazio, sem lista nem link', () => {
    montarPainel(document, DADOS, HOJE);
    botao('2026-10-06').click();
    const detalhe = document.getElementById('detalhe-dia')!;
    expect(detalhe.querySelector('.vazio')!.textContent).toBe('Nenhum registro publicado pelas fontes neste dia.');
    expect(detalhe.querySelector('ul')).toBeNull();
    expect(detalhe.querySelector('a')).toBeNull();
  });

  it('21 dias sem registro: todos vazios e hoje selecionado', () => {
    montarPainel(document, { ...DADOS, eventos: [] }, HOJE);
    expect(document.querySelectorAll('.marca-vazio')).toHaveLength(21);
    expect(botao(HOJE).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('#detalhe-dia .vazio')!.textContent).toContain('Nenhum registro');
  });

  it('rola a linha para o fim ao montar e acompanha o arrasto do mouse', () => {
    const rolagem = document.getElementById('linha-rolagem')!;
    Object.defineProperty(rolagem, 'scrollWidth', { value: 900, configurable: true });
    montarPainel(document, DADOS, HOJE);
    expect(rolagem.scrollLeft).toBe(900);
    rolagem.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    rolagem.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, bubbles: true }));
    expect(rolagem.scrollLeft).toBe(940);
    rolagem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    rolagem.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, bubbles: true }));
    expect(rolagem.scrollLeft).toBe(940);
  });

  it('título hostil aparece como texto', () => {
    const RUIM = '<img src=x onerror=alert(1)>';
    montarPainel(document, { ...DADOS, eventos: [ev('h', 'ato', '2026-10-07', { titulo: RUIM })] }, HOJE);
    const detalhe = document.getElementById('detalhe-dia')!;
    expect(detalhe.textContent).toContain(RUIM);
    expect(document.querySelectorAll('#conteudo img, #conteudo script')).toHaveLength(0);
  });

  it('números do topo: visíveis com resumo, número antes do rótulo', () => {
    const resumo = { total: 8540, porTipo: { agenda: 5468, ato: 3044, comunicado: 28 }, desde: '2023-01-01' };
    montarPainel(document, { ...DADOS, resumo }, HOJE);
    const ul = document.getElementById('resumo')!;
    expect(ul.tagName).toBe('UL');
    expect(ul.hidden).toBe(false);
    const itens = [...ul.querySelectorAll(':scope > li')];
    expect(itens).toHaveLength(3);
    const lidos = itens.map((li) => [...li.children].map((c) => `${c.tagName}.${c.className}=${c.textContent}`));
    expect(lidos).toEqual([
      ['STRONG.numero=8.540', 'SPAN.rotulo=registros desde 01/01/2023'],
      ['STRONG.numero=5.468', 'SPAN.rotulo=compromissos na agenda'],
      ['STRONG.numero=3.044', 'SPAN.rotulo=atos no Diário Oficial'],
    ]);
    expect(itens[1].classList.contains('resumo-agenda')).toBe(true);
    expect(itens[2].classList.contains('resumo-ato')).toBe(true);
  });

  it('sem resumo o bloco continua escondido e vazio', () => {
    montarPainel(document, DADOS, HOJE);
    const ul = document.getElementById('resumo')!;
    expect(ul.hidden).toBe(true);
    expect(ul.textContent!.trim()).toBe('');
  });

  it('o detalhe do dia não é região viva', () => {
    montarPainel(document, DADOS, HOJE);
    expect(document.getElementById('detalhe-dia')!.hasAttribute('aria-live')).toBe(false);
  });

  it('dia já selecionado não redesenha o detalhe; outro dia redesenha', () => {
    montarPainel(document, DADOS, HOJE);
    const detalhe = document.getElementById('detalhe-dia')!;
    const h3 = detalhe.querySelector('h3')!;
    const atual = botao('2026-10-07');
    for (const tipo of ['focus', 'click', 'mouseenter']) atual.dispatchEvent(new Event(tipo));
    expect(detalhe.querySelector('h3')).toBe(h3);
    botao('2026-10-05').dispatchEvent(new Event('mouseenter'));
    const outro = detalhe.querySelector('h3')!;
    expect(outro).not.toBe(h3);
    expect(outro.textContent).toBe('Segunda-feira, 5 de outubro de 2026');
  });

  it('montar de novo não duplica nada', () => {
    const resumo = { total: 1, porTipo: { agenda: 1, ato: 0, comunicado: 0 }, desde: '2023-01-01' };
    montarPainel(document, { ...DADOS, resumo }, HOJE);
    montarPainel(document, { ...DADOS, resumo }, HOJE);
    expect(botoes()).toHaveLength(21);
    expect(document.querySelectorAll('#resumo li')).toHaveLength(3);
  });

  describe('teclado: tabindex itinerante', () => {
    const tecla = (b: HTMLElement, key: string) => b.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const selecionado = () => botoes().find((b) => b.getAttribute('aria-pressed') === 'true')!;

    it('só o botão selecionado tem tabindex 0; os outros 20 têm -1', () => {
      montarPainel(document, DADOS, HOJE);
      expect(botoes().filter((b) => b.getAttribute('tabindex') === '0').map((b) => b.dataset.dia)).toEqual(['2026-10-07']);
      expect(botoes().filter((b) => b.getAttribute('tabindex') === '-1')).toHaveLength(20);
    });

    it('a lista tem o rótulo que explica as setas', () => {
      montarPainel(document, DADOS, HOJE);
      expect(document.getElementById('linha-dias')!.getAttribute('aria-label'))
        .toBe('Dias, do mais antigo ao mais recente. Use as setas para mudar de dia.');
    });

    it('seta para a esquerda move foco e seleção para o dia anterior e troca os tabindex', () => {
      montarPainel(document, DADOS, HOJE);
      const antes = botao('2026-10-07');
      antes.focus();
      tecla(antes, 'ArrowLeft');
      expect(document.activeElement).toBe(botao('2026-10-06'));
      expect(selecionado().dataset.dia).toBe('2026-10-06');
      expect(botao('2026-10-06').getAttribute('tabindex')).toBe('0');
      expect(antes.getAttribute('tabindex')).toBe('-1');
      expect(botoes().filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);
      tecla(botao('2026-10-06'), 'ArrowRight');
      expect(selecionado().dataset.dia).toBe('2026-10-07');
    });

    it('teclas com modificador (Alt, Ctrl, Meta, Shift) não são capturadas', () => {
      montarPainel(document, DADOS, HOJE);
      for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
        const atual = selecionado();
        const ev = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true, [mod]: true });
        atual.dispatchEvent(ev);
        expect(ev.defaultPrevented, mod).toBe(false);
        expect(selecionado().dataset.dia, mod).toBe('2026-10-07');
        expect(botoes().filter((b) => b.getAttribute('tabindex') === '0').map((b) => b.dataset.dia), mod).toEqual(['2026-10-07']);
      }
    });

    it('seta para a direita no último dia não muda nada, nem a esquerda no primeiro', () => {
      montarPainel(document, { ...DADOS, eventos: [] }, HOJE);
      const ultimo = botao(HOJE);
      ultimo.focus();
      const ev1 = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      ultimo.dispatchEvent(ev1);
      expect(selecionado().dataset.dia).toBe(HOJE);
      expect(document.activeElement).toBe(ultimo);
      const primeiro = botoes()[0];
      primeiro.focus();
      tecla(primeiro, 'ArrowLeft');
      expect(selecionado()).toBe(primeiro);
      expect(document.activeElement).toBe(primeiro);
    });

    it('Home vai para o primeiro dia e End para o último', () => {
      montarPainel(document, DADOS, HOJE);
      tecla(botao('2026-10-07'), 'Home');
      expect(selecionado().dataset.dia).toBe('2026-09-18');
      expect(document.activeElement).toBe(botoes()[0]);
      tecla(botoes()[0], 'End');
      expect(selecionado().dataset.dia).toBe(HOJE);
      expect(document.activeElement).toBe(botoes()[20]);
    });

    it('o próximo focável depois do dia selecionado é o link do detalhe desse dia', () => {
      montarPainel(document, DADOS, HOJE);
      const proximoFocavel = (de: HTMLElement) => {
        const todos = [...document.querySelectorAll<HTMLElement>('a[href], button:not([tabindex="-1"])')];
        return todos[todos.indexOf(de) + 1];
      };
      botao('2026-10-05').click();
      const link = proximoFocavel(botao('2026-10-05'));
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('registros.html?de=2026-10-05&ate=2026-10-05');
      expect(document.getElementById('detalhe-dia')!.contains(link)).toBe(true);
    });
  });

  describe('dia sem registro e dados incompletos', () => {
    it('dados completos: afirma que nenhuma fonte publicou nada', () => {
      montarPainel(document, DADOS, HOJE);
      botao('2026-10-06').click();
      expect(document.querySelector('#detalhe-dia .vazio')!.textContent).toBe('Nenhum registro publicado pelas fontes neste dia.');
    });

    it('dados incompletos: não afirma que o dia é vazio', () => {
      montarPainel(document, { ...DADOS, incompleto: true }, HOJE);
      botao('2026-10-06').click();
      const detalhe = document.getElementById('detalhe-dia')!;
      expect(detalhe.querySelector('.vazio')!.textContent)
        .toBe('Não foi possível carregar todos os dados; este dia pode ter registros que não aparecem aqui.');
      expect(detalhe.querySelector('ul')).toBeNull();
      expect(detalhe.querySelector('a')).toBeNull();
    });
  });

  describe('compromisso removido', () => {
    const REMOVIDO = [ev('rem', 'agenda', '2026-10-07', { status: 'removido', hora: '10:00' })];

    it('o dia só com removido não é vazio: rótulo, resumo, item, link e marcador', () => {
      montarPainel(document, { ...DADOS, eventos: REMOVIDO }, HOJE);
      const dia = botao('2026-10-07');
      expect(dia.getAttribute('aria-label'))
        .toBe('quarta-feira, 7 de outubro de 2026: 0 compromissos, 0 atos, 1 removido da agenda');
      expect(dia.querySelector('.marca-vazio')).toBeNull();
      const marca = dia.querySelector('.marca-agenda')!;
      expect(marca.classList.contains('tam-1')).toBe(true);
      expect(marca.classList.contains('marca-removido')).toBe(true);
      dia.click();
      const detalhe = document.getElementById('detalhe-dia')!;
      expect(detalhe.querySelector('.detalhe-resumo')!.textContent).toBe('0 compromissos, 0 atos, 1 removido da agenda');
      expect(detalhe.querySelector('.detalhe-itens .quando')!.textContent).toBe('Removido');
      expect(detalhe.textContent).toContain('Título rem');
      expect(detalhe.querySelector('a')!.getAttribute('href')).toBe('registros.html?de=2026-10-07&ate=2026-10-07');
      expect(detalhe.querySelector('.vazio')).toBeNull();
    });

    it('vários removidos usam o plural', () => {
      const dois = [...REMOVIDO, ev('rem2', 'agenda', '2026-10-07', { status: 'removido' })];
      montarPainel(document, { ...DADOS, eventos: dois }, HOJE);
      expect(botao('2026-10-07').getAttribute('aria-label')).toMatch(/, 2 removidos da agenda$/);
    });

    it('com agenda normal no dia, o removido só entra no texto, não no marcador', () => {
      montarPainel(document, { ...DADOS, eventos: [...EVENTOS, ...REMOVIDO] }, HOJE);
      expect(botao('2026-10-07').querySelector('.marca-removido')).toBeNull();
      expect(botao('2026-10-07').getAttribute('aria-label')).toMatch(/, 1 removido da agenda$/);
    });
  });

  describe('comunicado', () => {
    it('dia só com comunicados tem marcador de comunicado e não é vazio', () => {
      montarPainel(document, { ...DADOS, eventos: [ev('c1', 'comunicado', '2026-10-07'), ev('c2', 'comunicado', '2026-10-07')] }, HOJE);
      const dia = botao('2026-10-07');
      expect(dia.querySelector('.marca-comunicado')!.classList.contains('tam-2')).toBe(true);
      expect(dia.querySelector('.marca-vazio')).toBeNull();
    });

    it('o marcador de comunicado vem depois dos de ato e de agenda', () => {
      montarPainel(document, { ...DADOS, eventos: [...EVENTOS, ev('c', 'comunicado', '2026-10-07')] }, HOJE);
      const classes = [...botao('2026-10-07').querySelectorAll('.marca')].map((m) => m.classList[1]);
      expect(classes).toEqual(['marca-ato', 'marca-agenda', 'marca-comunicado']);
    });

    it('a legenda tem três entradas', () => {
      expect(document.querySelectorAll('.legenda-linha li')).toHaveLength(3);
      const ultima = document.querySelector('.legenda-linha li:last-child')!;
      expect(ultima.textContent!.trim()).toBe('Comunicado do Planalto');
      expect(ultima.querySelector('.marca.marca-comunicado')).not.toBeNull();
    });
  });

  describe('arrastar a linha do tempo', () => {
    const mouse = (alvo: Element, tipo: string, x: number) =>
      alvo.dispatchEvent(new MouseEvent(tipo, { clientX: x, bubbles: tipo !== 'mouseenter' }));

    it('depois de arrastar, mouseenter e o click final não selecionam', () => {
      montarPainel(document, DADOS, HOJE);
      const rolagem = document.getElementById('linha-rolagem')!;
      mouse(rolagem, 'mousedown', 100);
      mouse(rolagem, 'mousemove', 130);
      mouse(botao('2026-10-05'), 'mouseenter', 130);
      expect(botao('2026-10-07').getAttribute('aria-pressed')).toBe('true');
      mouse(rolagem, 'mouseup', 130);
      botao('2026-10-05').click();
      expect(botao('2026-10-07').getAttribute('aria-pressed')).toBe('true');
      expect(botao('2026-10-05').getAttribute('aria-pressed')).toBe('false');
    });

    it('um clique simples, sem movimento, continua selecionando', () => {
      montarPainel(document, DADOS, HOJE);
      const rolagem = document.getElementById('linha-rolagem')!;
      mouse(rolagem, 'mousedown', 100);
      mouse(rolagem, 'mouseup', 100);
      botao('2026-10-05').click();
      expect(botao('2026-10-05').getAttribute('aria-pressed')).toBe('true');
    });

    it('depois do arrasto, passar o mouse volta a selecionar', () => {
      montarPainel(document, DADOS, HOJE);
      const rolagem = document.getElementById('linha-rolagem')!;
      mouse(rolagem, 'mousedown', 100);
      mouse(rolagem, 'mousemove', 140);
      mouse(rolagem, 'mouseup', 140);
      mouse(botao('2026-10-05'), 'mouseenter', 140);
      expect(botao('2026-10-05').getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('o texto da página Sobre bate com o que o painel faz', () => {
    const sobre = readFileSync(resolve(process.cwd(), 'site/sobre.html'), 'utf8').replace(/\s+/g, ' ');
    expect(ITENS_DO_DETALHE).toBe(3);
    expect(sobre).toContain(`os ${DIAS_DO_PAINEL} dias mais recentes`);
    expect(sobre).toContain('lista até três itens');
  });

  it('não tem violações de acessibilidade detectáveis pelo axe (com e sem resumo)', async () => {
    const resumo = { total: 8540, porTipo: { agenda: 5468, ato: 3044, comunicado: 28 }, desde: '2023-01-01' };
    for (const r of [resumo, undefined]) {
      document.documentElement.innerHTML = PAGINA();
      montarPainel(document, { ...DADOS, resumo: r }, HOJE);
      const res = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
      expect(res.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
    }
  });
});
