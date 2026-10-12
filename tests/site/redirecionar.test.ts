import { describe, expect, it } from 'vitest';
import { destinoAntigo } from '../../site/src/redirecionar';

describe('destinoAntigo', () => {
  it('endereço sem nada do site antigo fica no painel', () => {
    expect(destinoAntigo('', '')).toBeNull();
    expect(destinoAntigo('?utm=x', '')).toBeNull();
    expect(destinoAntigo('', '#conteudo')).toBeNull();
  });

  it('?aba=noticias vai para a página de notícias, sem repassar filtros nem âncora', () => {
    expect(destinoAntigo('?aba=noticias', '')).toBe('noticias.html');
    expect(destinoAntigo('?aba=noticias&tipo=ato', '#x')).toBe('noticias.html');
  });

  it('?aba=linha vai para a página de registros', () => {
    expect(destinoAntigo('?aba=linha', '')).toBe('registros.html');
  });

  it('link permanente antigo mantém o dia e a âncora', () => {
    expect(destinoAntigo('?de=2026-10-08&ate=2026-10-08', '#ev-agenda-2026-10-08-10-00-1'))
      .toBe('registros.html?de=2026-10-08&ate=2026-10-08#ev-agenda-2026-10-08-10-00-1');
  });

  it('repassa os filtros como vieram, menos o parâmetro aba', () => {
    expect(destinoAntigo('?aba=linha&tipo=ato&status=publicado', '')).toBe('registros.html?tipo=ato&status=publicado');
  });

  it('âncora de registro sozinha também vai para registros', () => {
    expect(destinoAntigo('', '#ev-abc')).toBe('registros.html#ev-abc');
  });

  it('o destino é sempre um caminho relativo dentro do site', () => {
    const entradas: [string, string][] = [
      ['?de=//evil.example', ''],
      ['', '#ev-//evil.example'],
      ['?de=https://evil.example/&aba=linha', '#ev-https://evil.example'],
      ['?aba=//evil.example', ''],
      ['?tipo=javascript:alert(1)', '#ev-x'],
      ['?aba=noticias&de=//evil.example', '#//evil.example'],
    ];
    for (const [search, hash] of entradas) {
      const destino = destinoAntigo(search, hash)!;
      expect(destino, `${search} ${hash}`).toMatch(/^(registros|noticias)\.html($|[?#])/);
      expect(destino.startsWith('/')).toBe(false);
      expect(destino.split('?')[0].split('#')[0]).not.toContain(':');
      expect(new URL(destino, 'https://site.example/pasta/').origin).toBe('https://site.example');
      expect(new URL(destino, 'https://site.example/pasta/').pathname).toMatch(/^\/pasta\/(registros|noticias)\.html$/);
    }
  });
});
