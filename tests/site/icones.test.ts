// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ICONES, icone, type NomeIcone } from '../../site/src/icones';

describe('icone', () => {
  it('cria um svg decorativo, sem estilo inline, com o desenho pedido', () => {
    const svg = icone(document, 'relogio');
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('class')).toBe('icone');
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.hasAttribute('style')).toBe(false);
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(ICONES.relogio);
  });

  it('todo ícone tem desenho próprio', () => {
    const nomes = Object.keys(ICONES) as NomeIcone[];
    expect(nomes).toHaveLength(7);
    expect(new Set(nomes.map((n) => ICONES[n])).size).toBe(7);
    for (const n of nomes) expect(ICONES[n]).toMatch(/^M/);
  });
});
