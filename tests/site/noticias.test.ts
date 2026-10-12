// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Dados } from '../../site/src/dados';
import { montarNoticias } from '../../site/src/noticias';
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
  incompleto: false,
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
    expect(document.querySelectorAll('#lista-noticias li.noticia')).toHaveLength(5);
    expect(document.querySelectorAll('#noticias-veiculos li')).toHaveLength(2);
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
  it.each([1, 3, 6, 40])('com %i notícias: destaque + lista + grupos = total, sem repetir', (total) => {
    const ns = Array.from({ length: total }, (_, i) => nova(i));
    montarNoticias(document, { ...DADOS, noticias: ns }, AGORA);
    const h = hrefs();
    expect(h).toHaveLength(total);
    expect(new Set(h).size).toBe(total);
    expect(document.querySelectorAll('#lista-noticias li.noticia')).toHaveLength(Math.min(5, Math.max(0, total - 1)));
    expect(document.getElementById('noticias-veiculos')!.hidden).toBe(total <= 6);
    expect(document.getElementById('noticia-destaque')!.hidden).toBe(false);
  });

  it('ordena por data, da mais recente à mais antiga, mesmo com entrada embaralhada, sem mudar o array recebido', () => {
    const ns = [3, 0, 7, 1, 5, 2, 6, 4].map((i) => nova(i));
    const copia = ns.map((n) => n.id);
    montarNoticias(document, { ...DADOS, noticias: ns }, AGORA);
    expect(hrefs()).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => `https://exemplo.org/${i}`));
    expect(ns.map((n) => n.id)).toEqual(copia);
    const d = document.getElementById('noticia-destaque')!;
    expect(d.textContent).toContain('Mais recente');
    expect(d.textContent).toContain('Titulo 0');
    expect(d.querySelector('h2 a')!.getAttribute('href')).toBe('https://exemplo.org/0');
  });

  it('agrupa o resto por veículo, em ordem de quantidade e depois alfabética', () => {
    const veic = ['X', 'X', 'X', 'X', 'X', 'X', 'Z', 'B', 'B', 'Z', 'A', 'Z', 'B', 'C'];
    const ns = veic.map((v, i) => nova(i, v));
    montarNoticias(document, { ...DADOS, noticias: ns }, AGORA);
    const grupos = [...document.querySelectorAll('#noticias-veiculos .veiculo')];
    expect(grupos.map((g) => g.querySelector('h3')!.textContent)).toEqual(['B', 'Z', 'A', 'C']);
    expect(grupos.map((g) => g.querySelectorAll('li').length)).toEqual([3, 3, 1, 1]);
  });

  it('mantém a ordem de títulos h1, h2, h3', () => {
    montarNoticias(document, { ...DADOS, noticias: Array.from({ length: 10 }, (_, i) => nova(i)) }, AGORA);
    const niveis = [...document.querySelectorAll('main h1, main h2, main h3')].map((h) => h.tagName);
    expect(niveis[0]).toBe('H1');
    expect(niveis.slice(1, 7)).toEqual(['H2', 'H2', 'H2', 'H2', 'H2', 'H2']);
    expect(niveis.slice(7)).toEqual(['H2', 'H3', 'H3', 'H3']);
    expect(document.querySelector('#noticias-veiculos > h2')!.textContent).toBe('Mais notícias, por veículo');
  });

  it('axe sem violações com 40 notícias', async () => {
    montarNoticias(document, { ...DADOS, noticias: Array.from({ length: 40 }, (_, i) => nova(i)) }, AGORA);
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
