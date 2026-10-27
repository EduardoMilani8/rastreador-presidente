import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = '.github/workflows';
const workflows = readdirSync(DIR).filter((a) => /\.ya?ml$/.test(a)).map((a) => [a, readFileSync(`${DIR}/${a}`, 'utf8')] as const);

/** Linhas de comando de shell: `run: ...` e o bloco indentado de `run: |`. */
function linhasDeShell(yml: string): string[] {
  const linhas = yml.split('\n');
  const saida: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(/^(\s*)(?:- )?run:\s*(.*)$/);
    if (!m) continue;
    if (m[2] !== '|' && m[2] !== '>') {
      saida.push(m[2]);
      continue;
    }
    const recuo = m[1].length;
    while (i + 1 < linhas.length && (linhas[i + 1].trim() === '' || linhas[i + 1].search(/\S/) > recuo)) saida.push(linhas[++i]);
  }
  return saida;
}

describe('workflows do GitHub Actions', () => {
  it('lê os três workflows', () => {
    expect(workflows.map(([a]) => a).sort()).toEqual(['ci.yml', 'testar-feed.yml', 'update.yml']);
  });

  it.each(workflows.map(([a]) => a))('%s: toda action é fixada por SHA de 40 caracteres, com a versão em comentário', (arquivo) => {
    const yml = workflows.find(([a]) => a === arquivo)![1];
    for (const [, linha] of yml.matchAll(/^\s*(?:- )?uses:\s*(.+)$/gm)) {
      expect(linha, arquivo).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  });

  it.each(workflows.map(([a]) => a))('%s: nenhum ${{ }} dentro de comando de shell (valores entram por env)', (arquivo) => {
    const yml = workflows.find(([a]) => a === arquivo)![1];
    const shell = linhasDeShell(yml);
    expect(shell.length, arquivo).toBeGreaterThan(0);
    expect(shell.filter((l) => l.includes('${{'))).toEqual([]);
  });

  it.each(workflows.map(([a]) => a))('%s: declara permissões explícitas, sem write-all', (arquivo) => {
    const yml = workflows.find(([a]) => a === arquivo)![1];
    expect(yml).toMatch(/^\s*permissions:/m);
    expect(yml).not.toMatch(/write-all/);
  });

  it('só o job que grava os dados guarda o token no checkout; os outros usam persist-credentials: false', () => {
    let comToken = 0;
    for (const [arquivo, yml] of workflows) {
      for (const m of yml.matchAll(/uses: actions\/checkout@\S+[^\n]*\n((?:\s+(?:with:|\w[\w-]*:).*\n)*)/g)) {
        if (/persist-credentials: false/.test(m[1])) continue;
        comToken++;
        expect(arquivo).toBe('update.yml');
      }
    }
    expect(comToken).toBe(1);
  });
});
