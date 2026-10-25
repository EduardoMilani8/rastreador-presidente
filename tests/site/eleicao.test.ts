// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { RESULTADO, avisoEleicao, montarAvisoEleicao } from '../../site/src/eleicao';

const PAGINA = () => readFileSync(resolve(process.cwd(), 'site/index.html'), 'utf8');

beforeEach(() => {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.innerHTML = PAGINA();
});

describe('aviso da eleição na capa', () => {
  it('é o primeiro aviso do cabeçalho e começa escondido', () => {
    const avisos = document.querySelectorAll('.avisos > p');
    expect(avisos[0].id).toBe('aviso-eleicao');
    expect((avisos[0] as HTMLElement).hidden).toBe(true);
  });

  it('o resultado só é preenchido com a fonte oficial (hoje continua nulo até o TSE declarar)', () => {
    expect(RESULTADO).toBeNull();
  });

  it('antes, no dia e depois do 2º turno: informa a data, remete ao TSE e não diz quem ganhou', () => {
    const antes = avisoEleicao('2026-10-20')!;
    const dia = avisoEleicao('2026-10-25')!;
    const depois = avisoEleicao('2026-11-02')!;
    expect(antes.texto).toContain('será em 25/10/2026');
    expect(dia.texto).toContain('é hoje, 25/10/2026');
    expect(depois.texto).toContain('foi em 25/10/2026');
    for (const a of [antes, dia, depois]) {
      expect(a.linkUrl).toBe('https://resultados.tse.jus.br/');
      expect(a.texto).toContain('01/01/2027');
      expect(a.texto).not.toMatch(/foi eleito/);
    }
  });

  it('com resultado e fonte https, nomeia o eleito e liga à fonte', () => {
    const a = avisoEleicao('2026-10-26', { eleito: 'Fulano de Tal', fonteUrl: 'https://tse.jus.br/resultado' })!;
    expect(a.texto).toContain('Fulano de Tal foi eleito(a) no 2º turno, segundo o TSE');
    expect(a.linkUrl).toBe('https://tse.jus.br/resultado');
  });

  it('com resultado mas sem fonte https válida, não nomeia ninguém', () => {
    for (const fonteUrl of ['http://tse.jus.br/x', 'javascript:alert(1)', 'não é url']) {
      const a = avisoEleicao('2026-10-26', { eleito: 'Fulano de Tal', fonteUrl })!;
      expect(a.texto).not.toContain('Fulano');
      expect(a.linkUrl).toBe('https://resultados.tse.jus.br/');
    }
  });

  it('some a partir da posse, em 01/01/2027', () => {
    expect(avisoEleicao('2026-12-31')).not.toBeNull();
    expect(avisoEleicao('2027-01-01')).toBeNull();
  });

  it('monta o aviso no DOM só com texto e um link https, e esconde depois da posse', () => {
    montarAvisoEleicao(document, new Date('2026-10-25T21:00:00Z'));
    const el = document.getElementById('aviso-eleicao')!;
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain('o 2º turno é hoje, 25/10/2026');
    const link = el.querySelector('a')!;
    expect(link.href).toBe('https://resultados.tse.jus.br/');
    expect(link.rel).toContain('noopener');
    expect(el.children).toHaveLength(1);

    montarAvisoEleicao(document, new Date('2027-01-02T15:00:00Z'));
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe('');
  });
});
