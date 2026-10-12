import { describe, expect, it } from 'vitest';
import { lerFiltros } from '../../site/src/params';

describe('lerFiltros', () => {
  it('padrão: nenhum filtro', () => {
    expect(lerFiltros('')).toEqual({});
  });
  it('lê valores válidos', () => {
    expect(lerFiltros('?tipo=ato&status=publicado&de=2026-09-01&ate=2026-09-30'))
      .toEqual({ tipo: 'ato', status: 'publicado', de: '2026-09-01', ate: '2026-09-30' });
  });
  it('o parâmetro aba do site antigo é ignorado: cada página tem o próprio endereço', () => {
    expect(lerFiltros('?aba=noticias&tipo=ato')).toEqual({ tipo: 'ato' });
    expect(lerFiltros('?aba=linha')).toEqual({});
  });
  it('campos vazios do formulário viram "sem filtro"', () => {
    expect(lerFiltros('?aba=linha&de=&ate=&tipo=&status=')).toEqual({});
  });
  it('ignora valores inválidos ou maliciosos', () => {
    expect(lerFiltros('?aba=<script>&tipo=hack&status=%27%3B&de=2026-13-45&ate=ontem'))
      .toEqual({});
  });
  it('intervalo invertido (de > até) é desinvertido, em vez de mostrar "nenhum registro" (I5)', () => {
    expect(lerFiltros('?de=2026-09-30&ate=2026-09-01')).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
    expect(lerFiltros('?de=2026-09-10&ate=2026-09-10')).toEqual({ de: '2026-09-10', ate: '2026-09-10' });
  });
  it('recusa data impossível mesmo com formato correto', () => {
    expect(lerFiltros('?de=2026-02-30')).toEqual({});
  });
});
