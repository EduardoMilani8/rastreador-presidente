// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { montarComum } from '../../site/src/comum';

// jsdom não dá a import.meta.url um esquema file:, então resolve a partir da raiz do projeto.
const ler = (arq: string) => readFileSync(resolve(process.cwd(), 'site', arq), 'utf8');
const abrir = (arq: string): string => {
  const html = ler(arq);
  document.documentElement.lang = 'pt-BR';
  document.documentElement.innerHTML = html;
  return html;
};

const NAVEGACAO = [
  ['./', 'Painel'],
  ['registros.html', 'Registros'],
  ['noticias.html', 'Notícias'],
  ['sobre.html', 'Sobre'],
];
const PAGINAS = [
  { arquivo: 'index.html', atual: 'Painel' },
  { arquivo: 'registros.html', atual: 'Registros' },
  { arquivo: 'noticias.html', atual: 'Notícias' },
  { arquivo: 'sobre.html', atual: 'Sobre' },
];

const IDS_REGISTROS = [
  'ultima-novidade', 'aviso-desatualizado', 'aviso-fontes', 'aviso-incompleto', 'aba-linha', 'aba-noticias', 'conteudo',
  'painel-linha', 'bloco-proximos', 'proximos', 'caixa-filtros', 'filtros', 'periodo', 'linha-do-tempo', 'mais-dias',
  'mais-antigos',
];

describe.each(PAGINAS)('site/$arquivo', ({ arquivo, atual }) => {
  it('tem um só h1, link de pular e main#conteudo', () => {
    abrir(arquivo);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('a.pular')!.getAttribute('href')).toBe('#conteudo');
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelector('main')!.id).toBe('conteudo');
  });

  it('tem a marca e a navegação iguais às das outras páginas, com a página atual marcada', () => {
    abrir(arquivo);
    const marca = document.querySelector('header.topo > .faixa > .faixa-dentro > a.marca')!;
    expect(marca.getAttribute('href')).toBe('./');
    expect(marca.textContent).toBe('Rastreador do Presidente');
    expect(document.querySelectorAll('nav')).toHaveLength(1);
    const links = [...document.querySelectorAll('header.topo nav[aria-label] a')];
    expect(links.map((a) => [a.getAttribute('href'), a.textContent])).toEqual(NAVEGACAO);
    expect(links.map((a) => a.id)).toEqual(['', 'aba-linha', 'aba-noticias', '']);
    const atuais = document.querySelectorAll('[aria-current]');
    expect(atuais).toHaveLength(1);
    expect(atuais[0].getAttribute('aria-current')).toBe('page');
    expect(atuais[0].textContent).toBe(atual);
    expect(links).toContain(atuais[0]);
  });

  it('tem o rodapé de projeto independente e a folha de estilo do site', () => {
    const html = abrir(arquivo);
    expect(document.querySelector('footer.rodape')!.textContent).toContain('Projeto independente, sem vínculo com o governo.');
    expect(html).toContain('<link rel="stylesheet" href="./style.css">');
  });

  it('não tem estilo nem manipulador inline, e os ids não se repetem', () => {
    const html = abrir(arquivo);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('axe: sem violações de acessibilidade', async () => {
    abrir(arquivo);
    const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
  });
});

describe('o que cada página contém', () => {
  it('registros.html tem todos os ids dos registros e nada do bloco "Último registro"', () => {
    abrir('registros.html');
    for (const id of IDS_REGISTROS) expect(document.getElementById(id), id).not.toBeNull();
    expect(document.getElementById('bloco-ultimo')).toBeNull();
    expect(document.getElementById('ultimo-registro')).toBeNull();
    expect(document.getElementById('painel-noticias')).toBeNull();
    expect(document.querySelector('h1')!.textContent).toBe('Registros');
    expect(document.querySelector('main > h1 + #ultima-novidade')).not.toBeNull();
    expect(document.title).toBe('Registros — Rastreador do Presidente');
  });

  it('noticias.html tem o painel e a lista de notícias, com o aviso de que é imprensa', () => {
    abrir('noticias.html');
    expect(document.querySelector('div#painel-noticias ol#lista-noticias')).not.toBeNull();
    expect(document.querySelector('#painel-noticias .aviso-imprensa')!.textContent).toContain('Não são registros oficiais');
    expect(document.getElementById('painel-linha')).toBeNull();
    expect(document.querySelector('h1')!.textContent).toBe('O que a imprensa publica');
    expect(document.querySelector('main > h1 + #ultima-novidade')).not.toBeNull();
  });

  it('index.html é o painel: título, última alteração e nada das outras páginas', () => {
    abrir('index.html');
    expect(document.querySelector('main > h1')!.textContent).toBe('A agenda e os atos do presidente, com a fonte de cada registro.');
    expect(document.querySelector('main > h1 + #ultima-novidade')).not.toBeNull();
    expect(document.getElementById('painel-linha')).toBeNull();
    expect(document.getElementById('painel-noticias')).toBeNull();
  });

  it.each(['index.html', 'registros.html', 'noticias.html'])('%s: os três avisos ficam no cabeçalho, fora da faixa', (arquivo) => {
    abrir(arquivo);
    for (const id of ['aviso-desatualizado', 'aviso-fontes', 'aviso-incompleto']) {
      const aviso = document.querySelector<HTMLElement>(`header.topo > .avisos > #${id}`);
      expect(aviso, id).not.toBeNull();
      expect(aviso!.hidden).toBe(true);
      expect(aviso!.getAttribute('role')).toBe('status');
    }
  });

  it.each([
    ['index.html', './src/main-painel.ts'],
    ['registros.html', './src/main-registros.ts'],
    ['noticias.html', './src/main-noticias.ts'],
  ])('%s carrega só o próprio módulo', (arquivo, modulo) => {
    const scripts = [...ler(arquivo).matchAll(/<script[^>]*>/g)].map((m) => m[0]);
    expect(scripts).toEqual([`<script type="module" src="${modulo}">`]);
  });
});

describe('montarComum no painel', () => {
  const T = '2026-10-08T12:00:00.000Z';
  const AGORA = new Date('2026-10-08T15:00:00Z');

  it('preenche a última alteração e os avisos', () => {
    abrir('index.html');
    montarComum(document, {
      estado: { fontes: { dou: { ok: false, desde: T, mensagem: 'x' } }, ultimaNovidadeEm: '2026-10-07T08:00:00.000Z' },
      incompleto: true,
    }, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toBe('Última alteração nos dados há 1 dia');
    expect(document.getElementById('aviso-desatualizado')!.textContent).toContain('Última alteração nos dados: 07/10/2026 às 05:00');
    expect(document.getElementById('aviso-fontes')!.textContent).toContain('Diário Oficial');
    expect(document.getElementById('aviso-incompleto')!.textContent).toBe('Alguns dados não puderam ser carregados; a lista pode estar incompleta.');
  });

  it('sem falha nem atraso, os avisos ficam ocultos', () => {
    abrir('index.html');
    montarComum(document, { estado: { fontes: { dou: { ok: true, desde: T } }, ultimaNovidadeEm: '2026-10-08T14:30:00.000Z' }, incompleto: false }, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toBe('Última alteração nos dados há 30 min');
    for (const id of ['aviso-desatualizado', 'aviso-fontes', 'aviso-incompleto']) {
      expect(document.getElementById(id)!.hidden, id).toBe(true);
    }
  });
});
