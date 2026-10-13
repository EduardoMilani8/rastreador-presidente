// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Dados } from '../../site/src/dados';
import { montarNoticias, NOTICIAS_NA_GRADE, VEICULOS_A_VISTA } from '../../site/src/noticias';
import type { Evento, Noticia } from '../../src/shared/schema';

// jsdom não dá a import.meta.url um esquema file:, então resolve a partir da raiz do projeto.
const PAGINA = () => readFileSync(resolve(process.cwd(), 'site/noticias.html'), 'utf8');
const T = '2026-10-08T12:00:00.000Z';
const AGORA = new Date('2026-10-08T15:00:00Z');

const noticia: Noticia = {
  id: 'google-news:abc', titulo: 'Manchete', veiculo: 'BBC', data: '2026-10-08T11:00:00.000Z',
  url: 'https://news.google.com/x', origem: 'google-news',
};
const evento: Evento = {
  id: 'a', tipo: 'agenda', data: '2026-10-07', hora: '10:00', titulo: 'Compromisso a', status: 'consta_na_agenda',
  fontes: [{ nome: 'agenda-planalto', rotulo: 'Planalto (governo)', url: 'https://www.gov.br/a', coletadoEm: T }],
  confirmadoPor: [], historico: [],
};
const DADOS: Dados = {
  eventos: [evento],
  noticias: [noticia],
  estado: { fontes: { agenda: { ok: true, desde: T }, dou: { ok: false, desde: T, mensagem: 'x' } }, ultimaNovidadeEm: '2026-10-08T14:30:00.000Z' },
  incompleto: false, viagens: [],
  mesesCarregados: ['2026-10', '2026-09'],
  mesesDisponiveis: ['2026-10', '2026-09', '2026-08', '2026-07'],
};

// i = 0 é a mais recente; veículos alternam entre A, B e C (A tem mais)
function nova(i: number, veiculo = ['A', 'A', 'B', 'A', 'C'][i % 5]): Noticia {
  return {
    ...noticia, id: `n${i}`, titulo: `Titulo ${i}`, veiculo, url: `https://exemplo.org/${i}`,
    data: new Date(Date.parse('2026-10-08T11:00:00.000Z') - i * 3600_000).toISOString(),
  };
}
const hrefs = () => [...document.querySelectorAll('#painel-noticias a')].map((a) => a.getAttribute('href'));

beforeEach(() => {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.innerHTML = PAGINA();
});

describe('montarNoticias', () => {
  it('mostra as notícias, com a navegação já marcada no HTML, e nenhum registro oficial', () => {
    montarNoticias(document, DADOS, AGORA);
    expect(document.getElementById('painel-noticias')!.hidden).toBe(false);
    expect(document.getElementById('noticia-destaque')!.textContent).toContain('Manchete');
    expect(document.querySelectorAll('#noticia-destaque')).toHaveLength(1);
    expect(document.getElementById('aba-noticias')!.getAttribute('aria-current')).toBe('page');
    expect(document.getElementById('aba-linha')!.hasAttribute('aria-current')).toBe(false);
    expect(document.getElementById('painel-linha')).toBeNull();
    expect(document.getElementById('conteudo')!.textContent).not.toContain('Compromisso a');
  });

  it('sem notícias mostra mensagem', () => {
    montarNoticias(document, { ...DADOS, noticias: [] }, AGORA);
    expect(document.getElementById('lista-noticias')!.textContent).toContain('Nenhuma notícia disponível no momento.');
    expect(document.getElementById('noticia-destaque')!.hidden).toBe(true);
    expect(document.getElementById('noticias-veiculos')!.hidden).toBe(true);
  });

  it('montar de novo substitui a lista, sem repetir itens', () => {
    montarNoticias(document, DADOS, AGORA);
    montarNoticias(document, DADOS, AGORA);
    const muitas = Array.from({ length: 8 }, (_, i) => nova(i));
    montarNoticias(document, { ...DADOS, noticias: muitas }, AGORA);
    montarNoticias(document, { ...DADOS, noticias: muitas }, AGORA);
    expect(document.querySelectorAll('#noticia-destaque a')).toHaveLength(1);
    expect(document.querySelectorAll('#lista-noticias li.noticia')).toHaveLength(6);
    expect(document.querySelectorAll('#noticias-veiculos a')).toHaveLength(1);
    expect(hrefs()).toHaveLength(8);
  });

  it('mostra há quanto tempo os dados foram atualizados e avisa quando uma fonte está com falha', () => {
    montarNoticias(document, DADOS, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toBe('Última alteração nos dados há 30 min');
    const aviso = document.getElementById('aviso-fontes')!;
    expect(aviso.hidden).toBe(false);
    expect(aviso.textContent).toContain('Diário Oficial');
    expect(document.getElementById('aviso-incompleto')!.hidden).toBe(true);
  });

  it('o aviso de dados incompletos também aparece nas notícias e não conflita com o aviso de fontes', () => {
    montarNoticias(document, { ...DADOS, incompleto: true }, AGORA);
    expect(document.getElementById('aviso-incompleto')!.hidden).toBe(false);
    expect(document.getElementById('aviso-fontes')!.textContent).toContain('Diário Oficial');
  });

  it('o aviso de dados sem alteração há muito tempo também aparece nas notícias', () => {
    montarNoticias(document, { ...DADOS, estado: { ...DADOS.estado, ultimaNovidadeEm: '2026-10-06T08:00:00.000Z' } }, AGORA);
    expect(document.getElementById('aviso-desatualizado')!.textContent).toContain('Última alteração nos dados: 06/10/2026 às 05:00');
  });

  it('não tem violações de acessibilidade detectáveis pelo axe (com e sem notícias)', async () => {
    for (const noticias of [[noticia], []]) {
      document.documentElement.innerHTML = PAGINA();
      montarNoticias(document, { ...DADOS, noticias, incompleto: true }, AGORA);
      const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
      expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
    }
  });
});

describe('layout das notícias', () => {
  const montar = (ns: Noticia[]) => montarNoticias(document, { ...DADOS, noticias: ns }, AGORA);
  const veiculosDe = (lista: string[]) => lista.map((v, i) => nova(i, v));
  // destaque + grade ocupam os 7 primeiros índices; o resto vem de `resto`
  const comResto = (resto: string[]) => veiculosDe([...Array<string>(7).fill('Z'), ...resto]);
  const cartoes = () => [...document.querySelectorAll('#noticias-veiculos section.veiculo')];

  it('exporta as constantes do layout', () => {
    expect(NOTICIAS_NA_GRADE).toBe(6);
    expect(VEICULOS_A_VISTA).toBe(8);
  });

  it.each([1, 2, 7, 8, 40])('com %i notícias em 12 veículos: destaque + grade + cartões = total, sem repetir', (total) => {
    montar(Array.from({ length: total }, (_, i) => nova(i, `V${i % 12}`)));
    const h = hrefs();
    expect(h).toHaveLength(total);
    expect(new Set(h).size).toBe(total);
    expect(document.querySelectorAll('#lista-noticias li.noticia')).toHaveLength(Math.min(6, Math.max(0, total - 1)));
    expect(document.getElementById('noticias-veiculos')!.hidden).toBe(total <= 7);
    expect(document.getElementById('noticia-destaque')!.hidden).toBe(false);
  });

  it('com 7 notícias a grade tem 6 e os veículos ficam ocultos', () => {
    montar(Array.from({ length: 7 }, (_, i) => nova(i)));
    expect(document.querySelectorAll('#lista-noticias li.noticia')).toHaveLength(6);
    expect(document.getElementById('noticias-veiculos')!.hidden).toBe(true);
  });

  it('com 8 notícias há um cartão de veículo, sem details', () => {
    montar(Array.from({ length: 8 }, (_, i) => nova(i)));
    expect(cartoes()).toHaveLength(1);
    expect(document.querySelector('#noticias-veiculos details')).toBeNull();
  });

  it('não existe mais o agrupador .noticias-topo, e a grade vem logo depois do destaque', () => {
    montar(Array.from({ length: 10 }, (_, i) => nova(i)));
    expect(document.querySelector('.noticias-topo')).toBeNull();
    const grade = document.getElementById('lista-noticias')!;
    expect(grade.matches('ol.lista.noticias-grade')).toBe(true);
    expect(document.getElementById('noticia-destaque')!.nextElementSibling).toBe(grade);
    expect(grade.nextElementSibling).toBe(document.getElementById('noticias-veiculos'));
  });

  it('ordena por data, da mais recente à mais antiga, mesmo com entrada embaralhada, sem mudar o array recebido', () => {
    const ns = [3, 0, 7, 1, 5, 2, 6, 4].map((i) => nova(i));
    const copia = ns.map((n) => n.id);
    montar(ns);
    expect(hrefs()).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => `https://exemplo.org/${i}`));
    expect(ns.map((n) => n.id)).toEqual(copia);
    const d = document.getElementById('noticia-destaque')!;
    expect(d.textContent).toContain('Mais recente');
    expect(d.textContent).toContain('Titulo 0');
    expect(d.querySelector('h2 a')!.getAttribute('href')).toBe('https://exemplo.org/0');
  });

  it('agrupa o resto por veículo, em ordem de quantidade e depois alfabética', () => {
    montar(comResto(['Z', 'B', 'B', 'Z', 'A', 'Z', 'B', 'C']));
    expect(cartoes().map((g) => g.querySelector('h3')!.textContent)).toEqual(['B', 'Z', 'A', 'C']);
  });

  it('veículo com 3 restantes mostra a mais recente à vista e as outras em "Mais 2 notícias"', () => {
    montar(comResto(['B', 'B', 'B', 'C']));
    const b = cartoes().find((g) => g.querySelector('h3')!.textContent === 'B')!;
    expect(b.querySelectorAll(':scope > p a, :scope > p > a')).toHaveLength(1);
    expect(b.querySelector(':scope > p')!.textContent).toContain('Titulo 7');
    expect(b.querySelector(':scope > p')!.textContent).toMatch(/\d{2}\/\d{2}/);
    const d = b.querySelector('details.veiculo-mais')!;
    expect(d.querySelector('summary')!.textContent).toBe('Mais 2 notícias');
    expect([...d.querySelectorAll('li a')].map((a) => a.getAttribute('href'))).toEqual(['https://exemplo.org/8', 'https://exemplo.org/9']);
    expect(d.hasAttribute('open')).toBe(false);
  });

  it('veículo com 2 restantes diz "Mais 1 notícia", e com 1 não tem details', () => {
    montar(comResto(['B', 'B', 'C']));
    const por = (nome: string) => cartoes().find((g) => g.querySelector('h3')!.textContent === nome)!;
    expect(por('B').querySelector('details.veiculo-mais summary')!.textContent).toBe('Mais 1 notícia');
    expect(por('C').querySelector('details')).toBeNull();
    expect(por('C').querySelectorAll('a')).toHaveLength(1);
  });

  it('com 12 veículos nas restantes, 8 cartões ficam à vista e 4 em "Outros 4 veículos"', () => {
    montar(comResto(Array.from({ length: 12 }, (_, i) => `V${String(i).padStart(2, '0')}`)));
    const raiz = document.getElementById('noticias-veiculos')!;
    expect(raiz.querySelectorAll(':scope > section.veiculo')).toHaveLength(8);
    const outros = raiz.querySelector(':scope > details.veiculos-outros')!;
    expect(outros.querySelector('summary')!.textContent).toBe('Outros 4 veículos');
    expect(outros.querySelectorAll('section.veiculo')).toHaveLength(4);
    expect(outros.hasAttribute('open')).toBe(false);
  });

  it('com 9 veículos diz "Outros 1 veículo"; com 8 não há details de veículos', () => {
    montar(comResto(Array.from({ length: 9 }, (_, i) => `V${i}`)));
    expect(document.querySelector('details.veiculos-outros summary')!.textContent).toBe('Outros 1 veículo');
    montar(comResto(Array.from({ length: 8 }, (_, i) => `V${i}`)));
    expect(document.querySelector('details.veiculos-outros')).toBeNull();
    expect(cartoes()).toHaveLength(8);
  });

  it('mantém a ordem de títulos h1, h2, h3', () => {
    montar(Array.from({ length: 10 }, (_, i) => nova(i)));
    const niveis = [...document.querySelectorAll('main h1, main h2, main h3')].map((h) => h.tagName);
    expect(niveis[0]).toBe('H1');
    expect(niveis.slice(1, 8)).toEqual(Array(7).fill('H2'));
    expect(niveis.slice(8)).toEqual(['H2', 'H3', 'H3', 'H3']);
    expect(document.querySelector('#noticias-veiculos > h2')!.textContent).toBe('Mais notícias, por veículo');
  });

  it.each([['fechados', false], ['abertos', true]])('axe sem violações com 40 notícias e os details %s', async (_nome, abrir) => {
    montar(Array.from({ length: 40 }, (_, i) => nova(i, `V${i % 12}`)));
    if (abrir) document.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
    expect(document.querySelectorAll('details').length).toBeGreaterThan(1);
    const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
  });
});

describe('texto hostil', () => {
  const RUIM = '<img src=x onerror=alert(1)><script>alert(2)</script>';

  it('vira texto: sem script/img e sem link http:/javascript:', () => {
    const news = { ...noticia, titulo: RUIM, veiculo: RUIM, url: 'javascript:alert(1)' };
    const news2 = { ...noticia, id: 'n2', titulo: RUIM, veiculo: RUIM, url: 'http://inseguro.example/n' };
    const boa = { ...noticia, id: 'n3', titulo: RUIM, veiculo: RUIM };
    montarNoticias(document, { ...DADOS, noticias: [news, news2, boa] }, AGORA);
    const area = document.getElementById('conteudo')!;
    expect(area.querySelectorAll('script, img')).toHaveLength(0);
    expect(area.querySelectorAll('a[href^="http:"], a[href^="javascript:"]')).toHaveLength(0);
    expect(area.textContent).toContain(RUIM);
    expect(area.querySelectorAll('#noticia-destaque, li.noticia')).toHaveLength(3);
    // só a notícia com endereço https vira link
    expect([...area.querySelectorAll('#painel-noticias a')].map((a) => a.getAttribute('href'))).toEqual(['https://news.google.com/x']);
    expect(document.querySelectorAll('[onclick], [onerror], [style]')).toHaveLength(0);
  });
});
