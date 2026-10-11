import { describe, expect, it } from 'vitest';
import { lerFiltros } from '../../site/src/params';

describe('lerFiltros', () => {
  it('padrão: aba linha e nenhum filtro', () => {
    expect(lerFiltros('')).toEqual({ aba: 'linha' });
  });
  it('lê valores válidos', () => {
    expect(lerFiltros('?aba=noticias&tipo=ato&status=publicado&de=2026-09-01&ate=2026-09-30'))
      .toEqual({ aba: 'noticias', tipo: 'ato', status: 'publicado', de: '2026-09-01', ate: '2026-09-30' });
  });
  it('campos vazios do formulário viram "sem filtro"', () => {
    expect(lerFiltros('?aba=linha&de=&ate=&tipo=&status=')).toEqual({ aba: 'linha' });
  });
  it('ignora valores inválidos ou maliciosos', () => {
    expect(lerFiltros('?aba=<script>&tipo=hack&status=%27%3B&de=2026-13-45&ate=ontem'))
      .toEqual({ aba: 'linha' });
  });
  it('intervalo invertido (de > até) é desinvertido, em vez de mostrar "nenhum registro" (I5)', () => {
    expect(lerFiltros('?de=2026-09-30&ate=2026-09-01')).toEqual({ aba: 'linha', de: '2026-09-01', ate: '2026-09-30' });
    expect(lerFiltros('?de=2026-09-10&ate=2026-09-10')).toEqual({ aba: 'linha', de: '2026-09-10', ate: '2026-09-10' });
  });
  it('recusa data impossível mesmo com formato correto', () => {
    expect(lerFiltros('?de=2026-02-30')).toEqual({ aba: 'linha' });
  });
});
