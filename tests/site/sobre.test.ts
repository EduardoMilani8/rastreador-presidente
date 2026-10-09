// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';

// jsdom não dá a import.meta.url um esquema file:, então resolve a partir da raiz do projeto.
const ler = (arq: string) => readFileSync(resolve(process.cwd(), arq), 'utf8');

beforeEach(() => {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.innerHTML = ler('site/sobre.html');
});

describe('site/sobre.html', () => {
  it('tem landmarks, um único h1 e h2 logo depois (sem pular níveis)', () => {
    expect(document.querySelectorAll('header, [role=banner]')).toHaveLength(1);
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelectorAll('footer')).toHaveLength(1);
    expect(document.querySelectorAll('nav[aria-label]')).toHaveLength(1);
    const titulos = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => h.tagName);
    expect(titulos[0]).toBe('H1');
    expect(titulos.filter((t) => t === 'H1')).toHaveLength(1);
    expect(titulos[1]).toBe('H2');
    expect(titulos.every((t) => t === 'H1' || t === 'H2')).toBe(true);
  });

  it('tem link de pular para o conteúdo apontando para o main', () => {
    const pular = document.querySelector('a.pular') as HTMLAnchorElement;
    expect(pular.getAttribute('href')).toBe('#conteudo');
    expect(document.querySelector('main')!.id).toBe('conteudo');
  });

  it('usa a mesma navegação e o mesmo rodapé de index.html', () => {
    const indexDoc = new DOMParser().parseFromString(ler('site/index.html'), 'text/html');
    const hrefs = (d: Document) => [...d.querySelectorAll('nav a')].map((a) => [a.getAttribute('href'), a.textContent]);
    const esperado = hrefs(indexDoc).map(([h, t]) => [h === '?aba=linha' || h === '?aba=noticias' ? `./${h}` : h, t]);
    expect(hrefs(document)).toEqual(esperado);
    expect(document.querySelector('nav a[aria-current=page]')!.textContent).toBe('Sobre e metodologia');
    expect(document.querySelector('footer.rodape')!.textContent).toContain('Projeto independente, sem vínculo com o governo.');
    expect(document.title).toContain('Sobre e metodologia');
    expect(document.documentElement.lang).toBe('pt-BR');
  });

  it('não tem scripts, estilos inline, handlers, e-mail nem link de repositório', () => {
    const html = ler('site/sobre.html');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/mailto:|@[a-z0-9-]+\.[a-z]|github\.com|gitlab\.com/i);
    expect(html).toContain('href="./style.css"');
  });

  it('é honesto sobre a metodologia', () => {
    const texto = document.querySelector('main')!.textContent!.replace(/\s+/g, ' ');
    // (a) o tempo sozinho não confirma
    expect(texto).toMatch(/nunca aparece como "?Realizado"? só porque o tempo passou/);
    expect(texto).toMatch(/somente um comunicado oficial/);
    // (b) ligação automática conservadora
    expect(texto).toMatch(/ligação automática .* conservadora/);
    expect(texto).toMatch(/pode ligar pouquíssimos itens/);
    // (c) fontes
    expect(texto).toMatch(/somente de fontes oficiais públicas e da imprensa/);
    expect(texto).toMatch(/Notícias \(aba separada\)/);
    for (const termo of ['Agenda do Presidente', 'Diário Oficial da União', 'Comunicados do Planalto', 'Consta na agenda', 'Publicado no Diário Oficial']) {
      expect(texto).toContain(termo);
    }
  });

  it('axe: sem violações de acessibilidade', async () => {
    const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
  });
});
