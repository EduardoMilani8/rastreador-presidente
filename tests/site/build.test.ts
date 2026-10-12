import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// form-action 'self' (e não 'none'): o formulário de filtros é um GET para a própria página.
const CSP_ESPERADA =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'";

describe('build de produção', () => {
  it('gera as páginas com CSP exata, sem scripts/estilos inline, e copia os dados', () => {
    execSync('npm run build', { stdio: 'pipe' });
    for (const pagina of ['dist/index.html', 'dist/registros.html', 'dist/noticias.html', 'dist/sobre.html']) {
      const html = readFileSync(pagina, 'utf8');
      const metas = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g)];
      expect(metas, pagina).toHaveLength(1);
      expect(metas[0][1]).toBe(CSP_ESPERADA);
      expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/); // nenhum script inline
      expect(html).not.toMatch(/<style[\s>]/); // nenhum <style> inline
      expect(html).not.toMatch(/\sstyle=/); // nenhum atributo style
      expect(html).not.toMatch(/\son[a-z]+=/i); // nenhum handler inline
    }
    expect(readFileSync('dist/sobre.html', 'utf8')).toContain('Sobre e metodologia');
    // cada página com dados leva o próprio módulo (o de sobre.html não tem script) e nenhum caminho absoluto
    for (const pagina of ['dist/index.html', 'dist/registros.html', 'dist/noticias.html']) {
      const html = readFileSync(pagina, 'utf8');
      expect(html, pagina).toMatch(/<script type="module"[^>]* src="\.\/assets\/[^"]+\.js">/);
      expect(html, pagina).not.toMatch(/(src|href)="\/(?!\/)/);
    }
    expect(readFileSync('dist/sobre.html', 'utf8')).not.toMatch(/<script/);
    expect(existsSync('dist/data') || !existsSync('data')).toBe(true);
  }, 120_000);

  it('publica quatro fontes .woff2 (até 90 kB) e o CSS só aponta para elas, em caminho relativo', () => {
    execSync('npm run build', { stdio: 'pipe' });
    const fontes = readdirSync('dist/assets').filter((f) => f.endsWith('.woff2'));
    expect(fontes).toHaveLength(4);
    const total = fontes.reduce((soma, f) => soma + statSync(join('dist/assets', f)).size, 0);
    expect(total).toBeLessThanOrEqual(90_000);
    const arquivosCss = readdirSync('dist/assets').filter((f) => f.endsWith('.css'));
    expect(arquivosCss.length).toBeGreaterThan(0);
    for (const arquivo of arquivosCss) {
      const css = readFileSync(join('dist/assets', arquivo), 'utf8');
      const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1].replace(/^["']|["']$/g, ''));
      expect(urls).toHaveLength(4);
      for (const url of urls) expect(url).toMatch(/^(\.\/|\.\.\/)?[A-Za-z0-9_./-]+\.woff2$/);
    }
  }, 120_000);
});

describe('mapa de viagens', () => {
  it('o contorno vai num pedaço separado de até 60 kB, carregado sob demanda', () => {
    execSync('npm run build', { stdio: 'pipe' });
    const pedacos = readdirSync('dist/assets').filter((f) => /^mapa-contorno-.*\.js$/.test(f));
    expect(pedacos).toHaveLength(1);
    expect(statSync(join('dist/assets', pedacos[0])).size).toBeLessThanOrEqual(60_000);
    expect(readFileSync('dist/index.html', 'utf8')).not.toContain('mapa-contorno');
  }, 120_000);
});

describe('scripts/copy-data.mjs', () => {
  const script = resolve(process.cwd(), 'scripts/copy-data.mjs');

  it('copia data/ para dist/data/ recursivamente', () => {
    const dir = mkdtempSync(join(tmpdir(), 'copy-data-'));
    try {
      mkdirSync(join(dir, 'data/sub'), { recursive: true });
      mkdirSync(join(dir, 'dist'));
      writeFileSync(join(dir, 'data/a.json'), '{"a":1}');
      writeFileSync(join(dir, 'data/sub/b.json'), '{"b":2}');
      execSync(`node ${JSON.stringify(script)}`, { cwd: dir, stdio: 'pipe' });
      expect(readFileSync(join(dir, 'dist/data/a.json'), 'utf8')).toBe('{"a":1}');
      expect(readFileSync(join(dir, 'dist/data/sub/b.json'), 'utf8')).toBe('{"b":2}');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('não falha quando data/ não existe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'copy-data-'));
    try {
      execSync(`node ${JSON.stringify(script)}`, { cwd: dir, stdio: 'pipe' });
      expect(existsSync(join(dir, 'dist/data'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
