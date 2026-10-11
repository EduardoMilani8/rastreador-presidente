// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formatarDataCurta, formatarDataLonga, renderEvento, renderFontes, renderNoticia } from '../../site/src/render';
import type { Evento, Noticia } from '../../src/shared/schema';

const T = '2026-10-08T12:00:00.000Z';
const fonte = (nome: string, url: string, rotulo = 'Planalto (governo)') => ({ nome, rotulo, url, coletadoEm: T });
const base: Evento = {
  id: 'agenda:2026-10-08:10:00:1', tipo: 'agenda', data: '2026-10-08', hora: '10:00',
  titulo: 'Reunião', local: 'Palácio do Planalto', status: 'consta_na_agenda',
  fontes: [fonte('agenda-planalto', 'https://www.gov.br/a')], confirmadoPor: [], historico: [],
};

describe('formatação de datas', () => {
  it('formata por extenso e em curto', () => {
    expect(formatarDataLonga('2026-10-08')).toMatch(/quinta-feira, 8 de outubro de 2026/);
    expect(formatarDataCurta('2026-10-08')).toBe('08/10/2026');
  });
});

describe('renderFontes', () => {
  it('uma fonte -> "Fonte única" com link https', () => {
    const e = renderFontes(document, base.fontes);
    expect(e.textContent).toContain('Fonte única');
    const a = e.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://www.gov.br/a');
    expect(a.getAttribute('rel')).toContain('noopener');
  });
  it('duas fontes distintas -> "Confirmado por 2 fontes"', () => {
    const e = renderFontes(document, [...base.fontes, fonte('comunicado-planalto', 'https://www.gov.br/c')]);
    expect(e.textContent).toContain('Confirmado por 2 fontes');
    expect(e.querySelectorAll('a')).toHaveLength(2);
  });
  it('URL insegura nunca vira link', () => {
    const e = renderFontes(document, [fonte('x', 'javascript:alert(1)')]);
    expect(e.querySelector('a')).toBeNull();
  });
});

describe('renderEvento', () => {
  it('mostra hora, tipo, status com ícone aria-hidden, título e local', () => {
    const li = renderEvento(document, base);
    expect(li.querySelector('time')!.getAttribute('datetime')).toBe('2026-10-08T10:00');
    expect(li.textContent).toContain('Consta na agenda');
    expect(li.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(li.querySelector('h4')!.textContent).toBe('Reunião');
    expect(li.textContent).toContain('Palácio do Planalto');
  });
  it('nivelTitulo muda a tag do título', () => {
    expect(renderEvento(document, base, 3).querySelector('h3')).not.toBeNull();
  });
  it('texto malicioso da fonte aparece como texto, sem criar elementos', () => {
    const ruim = { ...base, titulo: '<img src=x onerror=alert(1)><script>alert(2)</script>', local: '<b>x</b>' };
    const li = renderEvento(document, ruim);
    expect(li.querySelector('img')).toBeNull();
    expect(li.querySelector('script')).toBeNull();
    expect(li.querySelector('b')).toBeNull();
    expect(li.querySelector('h4')!.textContent).toBe('<img src=x onerror=alert(1)><script>alert(2)</script>');
  });
  it('ato mostra datas de assinatura e publicação', () => {
    const ato: Evento = { ...base, tipo: 'ato', hora: undefined, status: 'publicado', datasAto: { assinatura: '2026-10-06', publicacao: '2026-10-07' } };
    expect(renderEvento(document, ato).textContent).toContain('Assinado em 06/10/2026 · Publicado em 07/10/2026');
  });
  it('comunicado mostra "Publicado no site do Planalto", nunca "Realizado" nem "Diário Oficial", e a data de publicação', () => {
    const c: Evento = {
      ...base, id: 'planalto:x', tipo: 'comunicado', hora: undefined, local: undefined, status: 'publicado',
      titulo: 'Presidente da República visita obras', fontes: [fonte('comunicado-planalto', 'https://www.gov.br/c')],
    };
    const t = renderEvento(document, c).textContent!;
    expect(t).toContain('Publicado no site do Planalto');
    expect(t).toContain('Data de publicação do texto: 08/10/2026. O compromisso descrito pode ser em outra data.');
    expect(t).not.toMatch(/Realizado|Diário Oficial/);
  });
  it('compromisso alterado lista as versões anteriores', () => {
    const alt: Evento = { ...base, status: 'alterado', historico: [{ titulo: 'Título antigo', registradoEm: T }] };
    const li = renderEvento(document, alt);
    expect(li.querySelector('details')!.textContent).toContain('Título antigo');
  });
  it('tem link permanente para o dia do item, com a âncora do próprio item', () => {
    const a = renderEvento(document, base).querySelector('a.permalink')!;
    expect(a.textContent).toBe('Link permanente');
    expect(a.getAttribute('href')).toBe('?de=2026-10-08&ate=2026-10-08#ev-agenda-2026-10-08-10-00-1');
    expect(a.hasAttribute('target')).toBe(false); // navegação interna, na mesma aba
    // o nome acessível começa pelo texto visível e diz de qual item é o link (numa lista de links, todos seriam iguais)
    expect(a.getAttribute('aria-label')).toBe('Link permanente: Reunião');
  });
  it('a cópia de destaque (sem id) aponta para a mesma âncora', () => {
    const li = renderEvento(document, base, 3, false);
    expect(li.id).toBe('');
    expect(li.querySelector('a.permalink')!.getAttribute('href')).toBe('?de=2026-10-08&ate=2026-10-08#ev-agenda-2026-10-08-10-00-1');
  });
  it('id com caracteres do DOU ("*", ".") vira âncora segura e igual à do link', () => {
    const ato: Evento = { ...base, id: 'dou:lei-n-14.701-de-20-de-outubro-de-2023-*-535292810', tipo: 'ato', hora: undefined, data: '2024-01-02', status: 'publicado' };
    const li = renderEvento(document, ato);
    expect(li.id).toBe('ev-dou-lei-n-14.701-de-20-de-outubro-de-2023---535292810');
    expect(li.querySelector('a.permalink')!.getAttribute('href')).toBe(`?de=2024-01-02&ate=2024-01-02#${li.id}`);
  });
  it('id do elemento é seguro para âncora', () => {
    expect(renderEvento(document, base).id).toBe('ev-agenda-2026-10-08-10-00-1');
  });
});

describe('renderNoticia', () => {
  const n: Noticia = {
    id: 'google-news:abc', titulo: 'Manchete', veiculo: 'BBC', data: '2026-10-08T11:00:00.000Z',
    url: 'https://news.google.com/x', origem: 'google-news',
  };
  it('mostra título como link, veículo e data', () => {
    const li = renderNoticia(document, n);
    expect(li.querySelector('a')!.getAttribute('href')).toBe('https://news.google.com/x');
    expect(li.textContent).toContain('BBC');
  });
  it('URL insegura vira texto puro', () => {
    expect(renderNoticia(document, { ...n, url: 'javascript:alert(1)' }).querySelector('a')).toBeNull();
  });
});
