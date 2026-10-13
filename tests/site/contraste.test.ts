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

// [frente, fundo, mínimo]. 4,5 para texto; 3 para marca, fio e borda de campo que carregam informação.
const FUNDOS = ['fundo', 'terra'];
const PARES: [string, string, number][] = [
  ...FUNDOS.map((f): [string, string, number] => ['texto', f, 4.5]),
  ...FUNDOS.map((f): [string, string, number] => ['suave', f, 4.5]),
  ['agenda', 'fundo', 4.5],
  ['ato', 'fundo', 4.5],
  ['agenda', 'terra', 3],
  ['ato', 'terra', 3],
  ['aviso-tx', 'aviso-bg', 4.5],
  ['linha', 'fundo', 1.2],
];

describe('contraste das cores', () => {
  it('os dois temas definem as mesmas cores', () => {
    expect(Object.keys(escuro).sort()).toEqual(Object.keys(claro).sort());
    expect(Object.keys(claro)).toHaveLength(9);
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

  it('movimento só para quem não pediu menos: transição e animação ficam dentro do bloco de prefers-reduced-motion', () => {
    const inicio = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    expect(inicio).toBeGreaterThan(-1);
    expect(css.slice(inicio)).toMatch(/^@media \(prefers-reduced-motion: no-preference\)\s*\{\s*html\s*\{\s*scroll-behavior: smooth;/);
    expect(css.slice(0, inicio)).not.toMatch(/\b(transition|animation)(-[a-z-]+)?\s*:/);
    expect(css.match(/@media \(prefers-reduced-motion: no-preference\)/g)).toHaveLength(1);
  });

  it('só animam opacidade, transformação, cor e traço', () => {
    const quadros = [...css.matchAll(/@keyframes\s+[a-z-]+\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map((m) => m[1]);
    expect(quadros.length).toBeGreaterThan(0);
    for (const q of quadros) {
      const props = [...q.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(['opacity', 'transform', 'stroke-dashoffset']).toContain(p);
    }
    const transicoes = [...css.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
    for (const t of transicoes) expect(t).toMatch(/^((color|background-color|border-color) \.12s(, )?)+$/);
  });

  it('o título do dia fica fixo em Registros, e a âncora de um registro não fica atrás dele', () => {
    expect(css).toMatch(/section\.dia > h3\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.evento\s*\{[^}]*scroll-margin-top:/);
  });

  it('no celular o recuo da âncora é um só: scroll-padding do documento, sem somar com o do registro', () => {
    expect(css).toMatch(/html\s*\{[^}]*scroll-padding-top:\s*6rem/);
    expect([...css.matchAll(/scroll-margin-top:\s*([^;}]+)/g)].map((m) => m[1].trim())).not.toContain('6rem');
  });

  it('o link do título tem pelo menos 44 px de altura para toque, sem deslocar o cabeçalho', () => {
    const regra = css.match(/\.faixa \.marca\s*\{([^}]*)\}/)![1];
    // letra mínima de 2rem (32 px) com line-height 1, mais 6 px acima e abaixo; a margem negativa devolve o espaço
    expect(css).toMatch(/--t-titulo:\s*clamp\(2rem,/);
    expect(regra).toMatch(/display:\s*inline-block/);
    expect(regra).toMatch(/padding-block:\s*6px/);
    expect(regra).toMatch(/margin-block:\s*-6px/);
  });

  it('a dica de arrastar só aparece onde a faixa de dias não cabe inteira', () => {
    expect(css).toMatch(/@media \(min-width: 58rem\)\s*\{[^@]*\.dica-linha\s*\{\s*display:\s*none/);
  });

  it('Sobre: índice fixo ao lado em tela larga e listas longas em colunas', () => {
    expect(css).toMatch(/\.prosa > \.indice\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.limites ul[^{]*\{[^}]*columns:\s*2 20rem/);
  });

  it("'Public Sans' só entra em regra de peso 600: é o único peso hospedado", () => {
    expect(css.match(/--sans:\s*([^;]*);/)![1]).not.toContain('Public Sans');
    const regras = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[2].includes('var(--rotulo)'));
    expect(regras.length).toBeGreaterThan(0);
    for (const m of regras) expect(m[2], m[1].trim()).toMatch(/font-weight:\s*600/);
    const herdam = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /font:\s*inherit/.test(m[2]) && /font-weight:\s*(?!600)\d+/.test(m[2]));
    expect(herdam.length).toBeGreaterThan(0);
    for (const m of herdam) expect(m[2], m[1].trim()).toMatch(/font-family:\s*var\(--sans\)/);
  });

  it('não carrega nada de fora do site', () => {
    expect(css).not.toMatch(/@import/);
    const urls = [...css.matchAll(/url\([^)]*\)/g)].map((m) => m[0]);
    for (const url of urls) expect(url).toMatch(/^url\('\.\/fontes\/[a-z0-9-]+\.woff2'\)$/);
    const blocos = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(blocos).toHaveLength(4);
    for (const bloco of blocos) expect(bloco).toMatch(/font-display:\s*swap/);
  });

  it('o CSS não usa order nem direções invertidas', () => {
    expect(css).not.toMatch(/\border:\s*-?\d|flex-direction:\s*\S*reverse|flex-wrap:\s*wrap-reverse/);
  });

  it('os marcadores da linha do tempo têm as cinco faixas de tamanho, em círculo e em losango', () => {
    const lado = (tipo: string, n: number) => css.match(new RegExp(`\\.marca-${tipo}\\.tam-${n}\\s*\\{\\s*width:\\s*(\\d+)px`))?.[1];
    expect([1, 2, 3, 4, 5].map((n) => lado('agenda', n))).toEqual(['13', '16', '19', '22', '26']);
    expect([1, 2, 3, 4, 5].map((n) => lado('ato', n))).toEqual(['11', '13', '15', '18', '21']);
    expect(css).toMatch(/\.marca-agenda\s*\{[^}]*border-radius:\s*50%[^}]*var\(--agenda\)/);
    expect(css).toMatch(/\.marca-ato\s*\{[^}]*var\(--ato\)[^}]*rotate\(45deg\)/);
  });

  it('comunicado, dia vazio e compromisso removido têm marcador, e o comunicado tem as cinco faixas', () => {
    expect(css).toMatch(/\.marca-comunicado\b[^{]*\{/);
    expect(css).toMatch(/\.marca-vazio\b[^{]*\{/);
    expect(css).toMatch(/\.marca-removido\s*\{[^}]*background:\s*transparent[^}]*border:\s*2px solid var\(--agenda\)/);
    const lado = (n: number) => css.match(new RegExp(`\\.marca-comunicado\\.tam-${n}\\s*\\{\\s*width:\\s*(\\d+)px`))?.[1];
    expect([1, 2, 3, 4, 5].map(lado)).toEqual(['10', '12', '14', '16', '19']);
  });

  it('a faixa de dias rola de lado sem barra visível', () => {
    expect(css).toMatch(/#linha-rolagem\s*\{[^}]*overflow-x:\s*auto[^}]*scrollbar-width:\s*none/);
    expect(css).toMatch(/#linha-rolagem::-webkit-scrollbar\s*\{\s*display:\s*none;?\s*\}/);
  });

  it('o mapa de viagens tem as cinco faixas de raio e a rota não define cor literal', () => {
    const raio = (n: number) => css.match(new RegExp(`\\.mapa-cidade\\.tam-${n}\\s*\\{\\s*r:\\s*([\\d.]+)`))?.[1];
    expect([1, 2, 3, 4, 5].map(raio)).toEqual(['2', '2.8', '3.8', '5', '6.5']);
    const regra = css.match(/\.mapa-rota\s*\{([^}]*)\}/)![1];
    expect(regra).toMatch(/stroke:\s*var\(--texto\)/);
    expect(regra).toMatch(/stroke-opacity:\s*0?\.5/);
    expect(regra).toMatch(/fill:\s*none/);
    expect(regra).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it('sem JavaScript a faixa de data não desenha fios soltos', () => {
    expect(css).toMatch(/\.datado:has\(> #hoje:empty\)\s*\{[^}]*border-color:\s*transparent/);
  });

  it('a regra .so-leitor existe: sem ela o título da capa e as datas apareceriam duas vezes', () => {
    const regra = css.match(/\.so-leitor\s*\{([^}]*)\}/)![1];
    expect(regra).toMatch(/position:\s*absolute/);
    expect(regra).toMatch(/clip-path:\s*inset\(50%\)/);
  });
});
