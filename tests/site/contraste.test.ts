import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'site/style.css'), 'utf8');

const BLOCO_CLARO = /:root\s*\{([^}]*)\}/;
const BLOCO_ESCURO = /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}\s*\}/;
const cores = (bloco: string): Record<string, string> =>
  Object.fromEntries([...bloco.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/g)].map((m) => [m[1], m[2]]));

const claro = cores(css.match(BLOCO_CLARO)![1]);
const escuro = cores(css.match(BLOCO_ESCURO)![1]);

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function razao(a: string, b: string): number {
  const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (maior + 0.05) / (menor + 0.05);
}

// [frente, fundo, mínimo]. 4,5 para texto; 3 para borda de campo e para marcador sobre o dia selecionado.
const FUNDOS = ['fundo', 'cartao', 'cartao-2'];
const PARES: [string, string, number][] = [
  ...[...FUNDOS, 'selecionado'].map((f): [string, string, number] => ['texto', f, 4.5]),
  ['texto-2', 'cartao', 4.5],
  ['texto-2', 'cartao-2', 4.5],
  ...[...FUNDOS, 'selecionado'].map((f): [string, string, number] => ['suave', f, 4.5]),
  ...['link', 'agenda', 'ato'].flatMap((c) => FUNDOS.map((f): [string, string, number] => [c, f, 4.5])),
  ['agenda', 'selecionado', 3],
  ['ato', 'selecionado', 3],
  ['aviso-tx', 'aviso-bg', 4.5],
  ['borda-campo', 'cartao', 3],
  ['borda-campo', 'fundo', 3],
];

describe('contraste das cores', () => {
  it('os dois temas definem as mesmas cores', () => {
    expect(Object.keys(escuro).sort()).toEqual(Object.keys(claro).sort());
    expect(Object.keys(claro)).toHaveLength(14);
  });

  for (const [tema, paleta] of [['claro', claro], ['escuro', escuro]] as const) {
    for (const [frente, fundo, minimo] of PARES) {
      it(`${tema}: ${frente} sobre ${fundo} tem pelo menos ${minimo}:1`, () => {
        expect(paleta[frente], frente).toBeDefined();
        expect(paleta[fundo], fundo).toBeDefined();
        expect(razao(paleta[frente], paleta[fundo])).toBeGreaterThanOrEqual(minimo);
      });
    }
  }

  it('nenhuma cor é escrita fora das variáveis (senão escaparia deste teste)', () => {
    const resto = css.replace(BLOCO_ESCURO, '').replace(BLOCO_CLARO, '');
    expect(resto).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(resto).not.toMatch(/\brgba?\(|\bhsla?\(/i);
  });
});

describe('guardas da folha de estilo', () => {
  it('elemento com hidden continua oculto mesmo com display definido', () => {
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  });

  it('as duas colunas só existem em tela larga e em navegador com :has()', () => {
    const inicio = css.indexOf('@media (min-width: 60rem)');
    expect(inicio).toBeGreaterThan(-1);
    const largo = css.slice(inicio);
    expect(largo).toMatch(/@supports selector\(:has\(\*\)\)/);
    expect(css.slice(0, inicio)).not.toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) 20rem/);
    expect(largo).toMatch(/#painel-linha:has\(#bloco-proximos:not\(\[hidden\]\)\)/);
    expect(largo).toMatch(/> \.lateral\s*\{[^}]*position:\s*sticky/);
  });

  it('links de fonte têm 44px por padrão e só ficam compactos com mouse', () => {
    const inicio = css.indexOf('@media (hover: hover) and (pointer: fine)');
    expect(inicio).toBeGreaterThan(-1);
    expect(css.slice(0, inicio)).toMatch(/\.fontes a, \.permalink \{[^}]*min-height: 44px;/);
    expect(css.slice(0, inicio)).not.toMatch(/\.fontes a, \.permalink \{[^}]*min-height: 0;/);
    expect(css.slice(inicio)).toMatch(/\.fontes a, \.permalink \{ min-height: 0; padding: 4px 0; \}/);
  });

  it('respeita prefers-reduced-motion: rolagem suave só para quem não pediu menos movimento', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*html\s*\{\s*scroll-behavior: smooth;/);
    expect(css).not.toMatch(/\b(transition|animation)\b/);
  });

  it('não carrega nada de fora do site', () => {
    expect(css).not.toMatch(/@import/);
    const urls = [...css.matchAll(/url\([^)]*\)/g)].map((m) => m[0]);
    for (const url of urls) expect(url).toMatch(/^url\('\.\/fontes\/[a-z0-9-]+\.woff2'\)$/);
    const blocos = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(blocos).toHaveLength(4);
    for (const bloco of blocos) expect(bloco).toMatch(/font-display:\s*swap/);
  });

  it('nada é reordenado pelo CSS: a ordem na tela é a do DOM (e a do foco)', () => {
    expect(css).not.toMatch(/\border:\s*-?\d|flex-direction:\s*\S*reverse|flex-wrap:\s*wrap-reverse/);
  });

  it('os marcadores da linha do tempo têm as cinco faixas de tamanho, em círculo e em losango', () => {
    const lado = (tipo: string, n: number) => css.match(new RegExp(`\\.marca-${tipo}\\.tam-${n}\\s*\\{\\s*width:\\s*(\\d+)px`))?.[1];
    expect([1, 2, 3, 4, 5].map((n) => lado('agenda', n))).toEqual(['13', '16', '19', '22', '26']);
    expect([1, 2, 3, 4, 5].map((n) => lado('ato', n))).toEqual(['11', '13', '15', '18', '21']);
    expect(css).toMatch(/\.marca-agenda\s*\{[^}]*border-radius:\s*50%[^}]*var\(--agenda\)/);
    expect(css).toMatch(/\.marca-ato\s*\{[^}]*var\(--ato\)[^}]*rotate\(45deg\)/);
  });

  it('a faixa de dias rola de lado sem barra visível', () => {
    expect(css).toMatch(/#linha-rolagem\s*\{[^}]*overflow-x:\s*auto[^}]*scrollbar-width:\s*none/);
    expect(css).toMatch(/#linha-rolagem::-webkit-scrollbar\s*\{\s*display:\s*none;?\s*\}/);
  });
});
