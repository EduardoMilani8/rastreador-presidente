// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { el, linkOuTexto } from '../../site/src/render';

// jsdom não dá a import.meta.url um esquema file:, então resolve a partir da raiz do projeto.
const raiz = (...p: string[]) => resolve(process.cwd(), ...p);
// Sem comentários: explicar por que algo é proibido não é usar.
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const fontesDoSite = readdirSync(raiz('site/src')).filter((a) => a.endsWith('.ts'))
  .map((a) => [a, semComentarios(readFileSync(raiz('site/src', a), 'utf8'))] as const);
const paginas = readdirSync(raiz('site')).filter((a) => a.endsWith('.html'))
  .map((a) => [a, readFileSync(raiz('site', a), 'utf8')] as const);

describe('código do site: nada que transforme texto em HTML ou em código', () => {
  const PROIBIDOS: [string, RegExp][] = [
    ['innerHTML', /\.innerHTML\b/],
    ['outerHTML', /\.outerHTML\b/],
    ['insertAdjacentHTML', /insertAdjacentHTML/],
    ['document.write', /document\.write/],
    ['createContextualFragment', /createContextualFragment/],
    ['DOMParser', /DOMParser/],
    ['srcdoc', /\.srcdoc\b|['"`]srcdoc['"`]/i],
    ['eval', /\beval\s*\(/],
    ['new Function', /new\s+Function\b|\bFunction\s*\(/],
    ['setTimeout/setInterval com texto', /set(Timeout|Interval)\s*\(\s*['"`]/],
    ['manipulador de evento por atributo', /\.on[a-z]+\s*=(?!=)|setAttribute\(\s*['"`]on/i],
    ['javascript:', /javascript:/i],
  ];

  it('lê os arquivos do site', () => {
    expect(fontesDoSite.length).toBeGreaterThan(10);
  });

  it.each(PROIBIDOS)('nenhum arquivo de site/src usa %s', (_nome, padrao) => {
    expect(fontesDoSite.filter(([, codigo]) => padrao.test(codigo)).map(([a]) => a)).toEqual([]);
  });

  it('todo link que abre em outra aba leva rel="noopener noreferrer"', () => {
    for (const [arquivo, codigo] of fontesDoSite) {
      for (const linha of codigo.split('\n').filter((l) => /target:\s*'_blank'/.test(l))) {
        expect(linha, arquivo).toMatch(/rel:\s*'noopener noreferrer'/);
      }
    }
  });
});

describe('el(): a única forma de criar elementos com atributos', () => {
  it('recusa atributo de manipulador de evento e srcdoc, em qualquer caixa', () => {
    for (const nome of ['onclick', 'ONERROR', 'onMouseOver', 'srcdoc']) {
      expect(() => el(document, 'a', { [nome]: 'alert(1)' }), nome).toThrow(/atributo proibido/);
    }
  });

  it('aceita os atributos comuns e põe texto como texto', () => {
    const a = el(document, 'a', { href: 'registros.html', class: 'x', 'aria-label': 'y' }, '<b>oi</b>');
    expect(a.getAttribute('href')).toBe('registros.html');
    expect(a.querySelector('b')).toBeNull();
    expect(a.textContent).toBe('<b>oi</b>');
  });

  it('linkOuTexto só cria link https, sempre com noopener e noreferrer', () => {
    const a = linkOuTexto(document, 'https://www.gov.br/x', 'Fonte');
    expect([a.tagName, a.getAttribute('rel'), a.getAttribute('target')]).toEqual(['A', 'noopener noreferrer', '_blank']);
    for (const url of ['http://www.gov.br/x', 'javascript:alert(1)', 'https://www.gov.br@golpe.example/', '//golpe.example/']) {
      expect(linkOuTexto(document, url, 'Fonte').tagName, url).toBe('SPAN');
    }
  });
});

describe('páginas HTML', () => {
  it.each(paginas.map(([a]) => a))('%s: link externo só https e com rel="noopener noreferrer"; nenhum http://', (arquivo) => {
    const html = paginas.find(([a]) => a === arquivo)![1];
    expect(html).not.toMatch(/http:\/\//);
    document.documentElement.innerHTML = html;
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href')!;
      if (/^[a-z]+:/i.test(href) || href.startsWith('//')) {
        expect(href, arquivo).toMatch(/^https:\/\//);
        expect(a.getAttribute('rel'), href).toBe('noopener noreferrer');
      }
    }
  });

  it('o build só publica scripts e estilos do próprio site (sem CDN)', () => {
    for (const [arquivo, html] of paginas) {
      expect(html, arquivo).not.toMatch(/<(script|link)[^>]+(src|href)="(https?:)?\/\//);
    }
  });
});

describe('caminhos relativos nos dados', () => {
  it('o site lê os dados só de data/, em caminho relativo', () => {
    const dados = readFileSync(join(raiz('site/src'), 'dados.ts'), 'utf8');
    const caminhos = [...dados.matchAll(/lerJson\(\s*[`'"]([^`'"]+)/g)].map((m) => m[1]);
    expect(caminhos.length).toBeGreaterThan(3);
    for (const c of caminhos) expect(c).toMatch(/^data\//);
  });
});
