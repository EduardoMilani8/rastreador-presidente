import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { caminhoSeguro } from '../../scripts/dados-dev';

let base: string;
let raiz: string;
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'dados-dev-'));
  raiz = join(base, 'data');
  mkdirSync(join(raiz, 'sub'), { recursive: true });
  writeFileSync(join(raiz, 'eventos.json'), '[]');
  writeFileSync(join(base, 'segredo.txt'), 'x'); // irmão de data/, com prefixo parecido
  mkdirSync(join(base, 'data-extra'));
  writeFileSync(join(base, 'data-extra/y.json'), '[]');
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('caminhoSeguro (middleware /data do dev server)', () => {
  it('resolve arquivos dentro da pasta de dados', () => {
    expect(caminhoSeguro(raiz, '/eventos.json')).toBe(join(raiz, 'eventos.json'));
    expect(caminhoSeguro(raiz, '/eventos.json?v=1')).toBe(join(raiz, 'eventos.json'));
    expect(caminhoSeguro(raiz, '/sub/../eventos.json')).toBe(join(raiz, 'eventos.json'));
    expect(caminhoSeguro(raiz, '//etc/passwd')).toBe(join(raiz, 'etc/passwd')); // continua dentro de data/
  });

  it.each([
    '/../segredo.txt',
    '/../../etc/passwd',
    '/..%2fsegredo.txt',
    '/%2e%2e/segredo.txt',
    '/%2E%2E%2Fsegredo.txt',
    '/sub/../../segredo.txt',
    '/../data-extra/y.json', // prefixo de string igual, mas fora da pasta
    '/\0eventos.json',
    '/%00',
    '/%zz',
    '/',
    '',
  ])('recusa %j', (url) => {
    expect(caminhoSeguro(raiz, url)).toBeNull();
  });
});
