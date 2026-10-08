import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LayoutError, parseAgenda, urlAgendaDia } from '../../src/collectors/agenda';

const ler = (nome: string) => readFileSync(new URL(`../fixtures/agenda/${nome}`, import.meta.url), 'utf8');
const COLETA = '2026-10-08T12:00:00.000Z';
const TITULO = '<title>Agenda do Presidente da República — Planalto</title>';

describe('urlAgendaDia', () => {
  it('concatena base e data', () => {
    expect(urlAgendaDia('https://x.test/base', '2025-03-10')).toBe('https://x.test/base/2025-03-10');
  });
});

describe('parseAgenda', () => {
  it('lê os 4 compromissos reais de 2025-03-10', () => {
    const r = parseAgenda(ler('2025-03-10.html'), 200, '2025-03-10', COLETA, 'https://x.test/p');
    expect(r.diaPublicado).toBe(true);
    expect(r.eventos).toHaveLength(4);
    const [primeiro, , terceiro] = r.eventos;
    expect(primeiro).toMatchObject({
      id: 'agenda:2025-03-10:09:00:1', tipo: 'agenda', data: '2025-03-10', hora: '09:00',
      local: 'Palácio do Planalto', status: 'agendado',
    });
    expect(primeiro.titulo.startsWith('Ministro da Secretaria de Comunicação Social, Sidônio Palmeira')).toBe(true);
    expect(terceiro.hora).toBe('15:00');
    expect(terceiro.titulo.startsWith('Cerimônia de transmissões de cargos')).toBe(true);
    expect(primeiro.fontes[0]).toMatchObject({ nome: 'agenda-planalto', rotulo: 'Planalto (governo)', url: 'https://x.test/p' });
  });

  it('lê os 10 compromissos de 2023-01-02 (início do mandato)', () => {
    const r = parseAgenda(ler('2023-01-02.html'), 200, '2023-01-02', COLETA, 'https://x.test/p');
    expect(r.eventos).toHaveLength(10);
  });

  it('404 com a página padrão é dia sem agenda, não erro', () => {
    const r = parseAgenda(ler('2026-10-04.404.html'), 404, '2026-10-04', COLETA, 'https://x.test/p');
    expect(r).toEqual({ eventos: [], diaPublicado: false });
  });

  it('200 sem o contêiner de compromissos é LayoutError', () => {
    const html = `<html><head>${TITULO}</head><body></body></html>`;
    expect(() => parseAgenda(html, 200, '2025-03-10', COLETA, 'https://x.test/p')).toThrow(LayoutError);
  });

  it('página que não é a agenda é LayoutError (ex.: JSON de erro)', () => {
    expect(() => parseAgenda('{"error_type": "NotFound"}', 404, '2025-03-10', COLETA, 'https://x.test/p'))
      .toThrow(LayoutError);
  });

  it('status inesperado (302, 403) é LayoutError', () => {
    const html = `<html><head>${TITULO}</head><body></body></html>`;
    expect(() => parseAgenda(html, 403, '2025-03-10', COLETA, 'https://x.test/p')).toThrow(LayoutError);
  });

  it('mesmo horário vira ids com sequência 1 e 2', () => {
    const item = (t: string) =>
      `<div class="item-compromisso"><span class="compromisso-inicio">10h00</span><span class="compromisso-titulo">${t}</span></div>`;
    const html = `<html><head>${TITULO}</head><body><div class="list-compromissos">${item('A')}${item('B')}</div></body></html>`;
    const r = parseAgenda(html, 200, '2025-03-10', COLETA, 'https://x.test/p');
    expect(r.eventos.map((e) => e.id)).toEqual(['agenda:2025-03-10:10:00:1', 'agenda:2025-03-10:10:00:2']);
    expect(r.eventos[0].local).toBeUndefined();
  });

  it('compromisso sem horário usa "sem-hora" no id e não define hora', () => {
    const html = `<html><head>${TITULO}</head><body><div class="list-compromissos"><div class="item-compromisso"><span class="compromisso-titulo">Dia todo</span></div></div></body></html>`;
    const r = parseAgenda(html, 200, '2025-03-10', COLETA, 'https://x.test/p');
    expect(r.eventos[0].id).toBe('agenda:2025-03-10:sem-hora:1');
    expect(r.eventos[0].hora).toBeUndefined();
  });

  it('contêiner com texto mas classes internas renomeadas é LayoutError, não dia sem eventos', () => {
    const html = `<html><head>${TITULO}</head><body><div class="list-compromissos"><div class="novo-item"><span class="novo-titulo">X</span></div></div></body></html>`;
    expect(() => parseAgenda(html, 200, '2025-03-10', COLETA, 'https://x.test/p')).toThrow(LayoutError);
  });

  it('item sem título legível, com outro texto no contêiner, é LayoutError', () => {
    const html = `<html><head>${TITULO}</head><body><div class="list-compromissos"><div class="item-compromisso"><span class="compromisso-inicio">10h00</span></div><p>Texto novo</p></div></body></html>`;
    expect(() => parseAgenda(html, 200, '2025-03-10', COLETA, 'https://x.test/p')).toThrow(LayoutError);
  });

  it('contêiner vazio é dia não publicado (conservador, nunca marca remoções)', () => {
    const html = `<html><head>${TITULO}</head><body><div class="list-compromissos"></div></body></html>`;
    const r = parseAgenda(html, 200, '2025-03-10', COLETA, 'https://x.test/p');
    expect(r).toEqual({ eventos: [], diaPublicado: false });
  });
});
