// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ALTURA, LARGURA, TERRA } from '../../site/src/mapa-contorno';
import { CIDADES_A_VISTA, faixaDeCidade, montarViagens, projetar } from '../../site/src/viagens';
import type { Viagem } from '../../src/shared/schema';

const PAGINA = () => readFileSync(resolve(process.cwd(), 'site/index.html'), 'utf8');

function viagem(n: number, extra: Partial<Viagem> = {}): Viagem {
  return {
    id: `cidade-${n}-xx`, cidade: `Cidade ${n}`, pais: `País ${n}`,
    lat: ((n * 7) % 120) - 60, lon: ((n * 23) % 340) - 170,
    compromissos: 100 - n, dias: 2, primeiroDia: '2024-03-05', ultimoDia: '2024-03-06', ...extra,
  };
}
const lista = (n: number) => Array.from({ length: n }, (_, i) => viagem(i + 1));

const CONTORNO = async () => ({ LARGURA: 720, ALTURA: 276, TERRA: 'M0 0L10 10Z' });
const SEM_CONTORNO = async () => { throw new Error('sem rede'); };

const secao = () => document.getElementById('secao-viagens') as HTMLElement;
const mapa = () => document.getElementById('mapa-viagens') as HTMLElement;
const itens = () => [...document.querySelectorAll<HTMLElement>('#lista-viagens li[data-cidade]')];
const circulo = (id: string) => document.querySelector(`circle.mapa-cidade[data-cidade="${id}"]`) as SVGElement;
const rota = (id: string) => document.querySelector(`path.mapa-rota[data-cidade="${id}"]`) as SVGElement;

beforeEach(() => {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.innerHTML = PAGINA();
});

describe('projetar', () => {
  it('Brasília cai onde a fórmula manda', () => {
    const p = projetar(-15.79, -47.88);
    expect(p.x).toBeCloseTo((-47.88 + 180) * 2, 5);
    expect(p.y).toBeCloseTo((80 + 15.79) * 2, 5);
  });

  it.each([[80, -180], [-58, 180], [90, 0], [-90, 0], [90, 180], [-90, -180]])('(%s, %s) fica dentro do mapa', (lat, lon) => {
    const { x, y } = projetar(lat, lon);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(720);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(276);
  });

  it('as pontas da faixa batem com os cantos', () => {
    expect(projetar(80, -180)).toEqual({ x: 0, y: 0 });
    expect(projetar(-58, 180)).toEqual({ x: 720, y: 276 });
    expect(projetar(-90, 0).y).toBe(276);
    expect(projetar(90, 0).y).toBe(0);
  });
});

describe('faixaDeCidade e limite da lista', () => {
  it.each([[1, 1], [2, 1], [3, 2], [7, 2], [8, 3], [15, 3], [16, 4], [30, 4], [31, 5], [500, 5]])(
    '%s compromissos: faixa %s', (n, faixa) => expect(faixaDeCidade(n)).toBe(faixa));

  it('dez cidades à vista', () => expect(CIDADES_A_VISTA).toBe(10));
});

describe('contorno gerado', () => {
  it('declara o tamanho do viewBox', () => {
    expect([LARGURA, ALTURA]).toEqual([720, 276]);
  });

  it('TERRA começa com M e só tem M, L, Z, dígitos, espaço e sinal de menos', () => {
    expect(TERRA.startsWith('M')).toBe(true);
    expect(TERRA).toMatch(/^[MLZ0-9 -]+$/);
  });

  it('todos os números cabem no mapa (x em 0 a 720, y em 0 a 276)', () => {
    const numeros = [...TERRA.matchAll(/-?\d+/g)].map((m) => Number(m[0]));
    expect(numeros.length).toBeGreaterThan(100);
    expect(numeros.length % 2).toBe(0);
    numeros.forEach((n, i) => {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(i % 2 === 0 ? 720 : 276);
    });
  });
});

describe('contorno gerado: sem riscos', () => {
  const aneis = TERRA.split('M').filter(Boolean).map((a) => a.replace('Z', '').split('L').map((p) => p.split(' ').map(Number)));

  it('nenhum anel é uma linha achatada pelo recorte', () => {
    for (const anel of aneis) {
      const ys = anel.map(([, y]) => y);
      expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys));
    }
  });

  it('nenhuma ilha pequena atravessa o mapa de um lado ao outro', () => {
    for (const anel of aneis) {
      const xs = anel.map(([x]) => x);
      if (anel.length < 20) expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(LARGURA / 2);
    }
  });
});

describe('montarViagens: lista', () => {
  it('lista vazia: a seção continua oculta e nada é criado', async () => {
    await montarViagens(document, [], CONTORNO);
    expect(secao().hidden).toBe(true);
    expect(mapa().hidden).toBe(true);
    expect(document.querySelector('#lista-viagens')!.children).toHaveLength(0);
    expect(mapa().children).toHaveLength(0);
  });

  it('3 cidades: seção visível, 3 itens e nenhum <details>', async () => {
    await montarViagens(document, lista(3), SEM_CONTORNO);
    expect(secao().hidden).toBe(false);
    expect(itens()).toHaveLength(3);
    expect(document.querySelector('#lista-viagens details')).toBeNull();
  });

  it('14 cidades: 10 à vista e "Outras 4 cidades" dentro de <details>, sem reordenar', async () => {
    const dados = lista(14);
    await montarViagens(document, dados, SEM_CONTORNO);
    const vista = document.querySelectorAll('#lista-viagens > ol.cidades > li');
    expect(vista).toHaveLength(10);
    const mais = document.querySelector('#lista-viagens details.cidades-mais')!;
    expect(mais.querySelector('summary')!.textContent).toBe('Outras 4 cidades');
    expect(mais.querySelectorAll('ol.cidades > li')).toHaveLength(4);
    expect(itens().map((li) => li.dataset.cidade)).toEqual(dados.map((v) => v.id));
  });

  it('cada item tem nome, país, período e contagem', async () => {
    await montarViagens(document, [viagem(1, { compromissos: 1, dias: 1, primeiroDia: '2024-03-05', ultimoDia: '2024-03-05' }), viagem(2)], SEM_CONTORNO);
    const [a, b] = itens();
    expect(a.querySelector('strong.cidade')!.textContent).toBe('Cidade 1');
    expect(a.querySelector('span.pais')!.textContent).toBe('País 1');
    expect(a.querySelector('span.periodo')!.textContent).toBe('05/03/2024');
    expect(a.querySelector('span.contagem')!.textContent).toBe('1 compromisso');
    expect(b.querySelector('span.contagem')!.textContent).toBe('98 compromissos');
  });

  it.each([
    ['um dia só', { dias: 1, primeiroDia: '2024-03-05', ultimoDia: '2024-03-05' }, '05/03/2024'],
    ['dias corridos no mesmo ano', { dias: 4, primeiroDia: '2024-03-05', ultimoDia: '2024-03-08' }, '05/03 a 08/03/2024'],
    ['dias corridos na virada do ano', { dias: 4, primeiroDia: '2023-12-30', ultimoDia: '2024-01-02' }, '30/12/2023 a 02/01/2024'],
    ['dias espalhados no mesmo ano', { dias: 3, primeiroDia: '2024-03-05', ultimoDia: '2024-09-20' }, '3 dias em 2024'],
    ['dias espalhados em anos diferentes', { dias: 5, primeiroDia: '2023-03-05', ultimoDia: '2025-09-20' }, '5 dias entre 2023 e 2025'],
  ] as [string, Partial<Viagem>, string][])('período: %s', async (_nome, extra, esperado) => {
    await montarViagens(document, [viagem(1, { compromissos: 20, ...extra })], SEM_CONTORNO);
    expect(itens()[0].querySelector('.periodo')!.textContent).toBe(esperado);
  });

  it('nome hostil vira texto na lista, no <title> e no rótulo, sem criar elementos', async () => {
    const hostil = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    await montarViagens(document, [viagem(1, { cidade: hostil, pais: hostil })], CONTORNO);
    expect(itens()[0].querySelector('.cidade')!.textContent).toBe(hostil);
    expect(circulo('cidade-1-xx').querySelector('title')!.textContent).toContain(hostil);
    expect([...document.querySelectorAll('text.mapa-rotulo')].map((t) => t.textContent)).toContain(hostil);
    expect(secao().querySelector('img, script')).toBeNull();
  });
});

describe('montarViagens: mapa', () => {
  it('com o contorno: svg decorativo, um círculo por cidade na posição projetada, e a seção do mapa visível', async () => {
    const dados = lista(6);
    await montarViagens(document, dados, CONTORNO);
    expect(mapa().hidden).toBe(false);
    const svg = mapa().querySelector('svg.mapa-svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 720 276');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.querySelector('path.mapa-terra')!.getAttribute('d')).toBe('M0 0L10 10Z');
    expect(svg.querySelectorAll('circle.mapa-cidade')).toHaveLength(6);
    expect(svg.querySelectorAll('path.mapa-rota')).toHaveLength(6);
    expect(svg.querySelectorAll('rect.mapa-brasilia')).toHaveLength(1);
    for (const v of dados) {
      const c = circulo(v.id);
      const p = projetar(v.lat, v.lon);
      expect(Number(c.getAttribute('cx'))).toBeCloseTo(p.x, 0);
      expect(Number(c.getAttribute('cy'))).toBeCloseTo(p.y, 0);
      expect(c.classList.contains(`tam-${faixaDeCidade(v.compromissos)}`)).toBe(true);
      expect(c.querySelector('title')!.textContent).toBe(`${v.cidade}: ${v.compromissos} compromissos`);
      expect(c.hasAttribute('tabindex')).toBe(false);
    }
  });

  it('as rotas saem de Brasília em curva quadrática', async () => {
    await montarViagens(document, lista(2), CONTORNO);
    const d = rota('cidade-1-xx').getAttribute('d')!;
    expect(d).toMatch(/^M[\d. -]+Q[\d. -]+$/);
    const b = projetar(-15.79, -47.88);
    expect(Number(d.slice(1).split(' ')[0])).toBeCloseTo(b.x, 0);
  });

  it('desenha do menor para o maior número de compromissos', async () => {
    const dados = [viagem(1, { compromissos: 40 }), viagem(2, { compromissos: 3 }), viagem(3, { compromissos: 12 })];
    await montarViagens(document, dados, CONTORNO);
    const ordem = [...document.querySelectorAll('circle.mapa-cidade')].map((c) => c.getAttribute('data-cidade'));
    expect(ordem).toEqual(['cidade-2-xx', 'cidade-3-xx', 'cidade-1-xx']);
  });

  it('tem 6 rótulos: Brasília e as 5 primeiras cidades', async () => {
    await montarViagens(document, lista(9), CONTORNO);
    const rotulos = [...document.querySelectorAll('text.mapa-rotulo')].map((t) => t.textContent);
    expect(rotulos).toEqual(['Brasília', 'Cidade 1', 'Cidade 2', 'Cidade 3', 'Cidade 4', 'Cidade 5']);
  });

  it('o contorno que falha deixa o mapa oculto, a lista no lugar e não lança', async () => {
    await expect(montarViagens(document, lista(3), SEM_CONTORNO)).resolves.toBeUndefined();
    expect(mapa().hidden).toBe(true);
    expect(mapa().children).toHaveLength(0);
    expect(secao().hidden).toBe(false);
    expect(itens()).toHaveLength(3);
  });
});

describe('montarViagens: realce', () => {
  it('mouseenter e focusin no item realçam círculo e rota; mouseleave e focusout tiram', async () => {
    await montarViagens(document, lista(3), CONTORNO);
    const li = itens()[1];
    const id = li.dataset.cidade!;
    li.dispatchEvent(new Event('mouseenter'));
    expect(circulo(id).classList.contains('ativa')).toBe(true);
    expect(rota(id).classList.contains('ativa')).toBe(true);
    expect(circulo('cidade-1-xx').classList.contains('ativa')).toBe(false);
    li.dispatchEvent(new Event('mouseleave'));
    expect(circulo(id).classList.contains('ativa')).toBe(false);
    expect(rota(id).classList.contains('ativa')).toBe(false);
    li.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(circulo(id).classList.contains('ativa')).toBe(true);
    li.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(circulo(id).classList.contains('ativa')).toBe(false);
  });

  it('o mouse sobre o círculo realça o item da lista', async () => {
    await montarViagens(document, lista(3), CONTORNO);
    const c = circulo('cidade-3-xx');
    c.dispatchEvent(new Event('mouseenter'));
    expect(itens()[2].classList.contains('ativa')).toBe(true);
    expect(rota('cidade-3-xx').classList.contains('ativa')).toBe(true);
    c.dispatchEvent(new Event('mouseleave'));
    expect(itens()[2].classList.contains('ativa')).toBe(false);
  });
});

describe('montarViagens: segurança e acessibilidade', () => {
  it('nenhum atributo style no documento, nem os criados pelo script', async () => {
    await montarViagens(document, lista(14), CONTORNO);
    expect(document.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('axe: sem violações, com mapa e com a lista sozinha', async () => {
    for (const carregar of [CONTORNO, SEM_CONTORNO]) {
      document.documentElement.innerHTML = PAGINA();
      await montarViagens(document, lista(14), carregar);
      const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
      expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
    }
  });
});
