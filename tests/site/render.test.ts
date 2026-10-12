// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ROTULO_COMUNICADO, ROTULO_STATUS, formatarDataCurta, formatarDataLonga, renderEvento, renderFontes, renderNoticia } from '../../site/src/render';
import { ICONES } from '../../site/src/icones';
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
  it('duas publicações do mesmo tipo (DOU e sua retificação) contam como uma fonte só', () => {
    const e = renderFontes(document, [fonte('dou', 'https://www.in.gov.br/a'), fonte('dou', 'https://www.in.gov.br/b')]);
    expect(e.textContent).toContain('Fonte única');
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
    expect(renderEvento(document, base, { nivelTitulo: 3 }).querySelector('h3')).not.toBeNull();
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
    expect(a.getAttribute('href')).toBe('registros.html?de=2026-10-08&ate=2026-10-08#ev-agenda-2026-10-08-10-00-1');
    expect(a.hasAttribute('target')).toBe(false); // navegação interna, na mesma aba
    // o nome acessível começa pelo texto visível e diz de qual item é o link (numa lista de links, todos seriam iguais)
    expect(a.getAttribute('aria-label')).toBe('Link permanente: Reunião');
  });
  it('na faixa de fontes a ordem do DOM é a da tela: selo, link permanente, lista de fontes', () => {
    const duas: Evento = { ...base, fontes: [...base.fontes, fonte('comunicado-planalto', 'https://www.gov.br/c')] };
    const faixa = renderEvento(document, duas).querySelector('.bloco-fontes')!;
    expect([...faixa.children].map((e) => e.className)).toEqual(['selo', 'permalink', 'fontes']);
    expect([...faixa.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      'Link permanente', 'Agenda do dia — Planalto (governo)', 'Comunicado — Planalto (governo)',
    ]);
  });
  it('a cópia de destaque (sem id) aponta para a mesma âncora', () => {
    const li = renderEvento(document, base, { nivelTitulo: 3, comId: false });
    expect(li.id).toBe('');
    expect(li.querySelector('a.permalink')!.getAttribute('href')).toBe('registros.html?de=2026-10-08&ate=2026-10-08#ev-agenda-2026-10-08-10-00-1');
  });
  it('id com caracteres do DOU ("*", ".") vira âncora segura e igual à do link', () => {
    const ato: Evento = { ...base, id: 'dou:lei-n-14.701-de-20-de-outubro-de-2023-*-535292810', tipo: 'ato', hora: undefined, data: '2024-01-02', status: 'publicado' };
    const li = renderEvento(document, ato);
    expect(li.id).toBe('ev-dou-lei-n-14.701-de-20-de-outubro-de-2023---535292810');
    expect(li.querySelector('a.permalink')!.getAttribute('href')).toBe(`registros.html?de=2024-01-02&ate=2024-01-02#${li.id}`);
  });
  it('id do elemento é seguro para âncora', () => {
    expect(renderEvento(document, base).id).toBe('ev-agenda-2026-10-08-10-00-1');
  });

  it('a hora fica em coluna própria, fora da caixa do cartão', () => {
    const li = renderEvento(document, base);
    const hora = li.querySelector(':scope > time.evento-hora')!;
    expect(hora.textContent).toBe('10:00');
    expect(hora.getAttribute('datetime')).toBe('2026-10-08T10:00');
    expect(li.classList.contains('com-hora')).toBe(true);
    expect(li.querySelector('.evento-corpo time')).toBeNull();
    expect(li.querySelector('.evento-meta time')).toBeNull();
  });

  it('item sem hora não tem coluna de hora', () => {
    const ato: Evento = { ...base, tipo: 'ato', hora: undefined, status: 'publicado' };
    const li = renderEvento(document, ato);
    expect(li.querySelector('time')).toBeNull();
    expect(li.classList.contains('com-hora')).toBe(false);
    expect(li.querySelector(':scope > .evento-corpo')).not.toBeNull();
  });

  it('no destaque (comData) a data e a hora ficam dentro da caixa', () => {
    const li = renderEvento(document, base, { comData: true });
    const quando = li.querySelector('.evento-corpo > time.evento-hora')!;
    expect(quando.textContent).toBe('08/10/2026 · 10:00');
    expect(quando.getAttribute('datetime')).toBe('2026-10-08T10:00');
    expect(li.classList.contains('com-hora')).toBe(false);
    expect(li.querySelectorAll('time')).toHaveLength(1);
  });

  it('no destaque, item sem hora mostra só a data', () => {
    const ato: Evento = { ...base, tipo: 'ato', hora: undefined, status: 'publicado' };
    const quando = renderEvento(document, ato, { comData: true }).querySelector('time.evento-hora')!;
    expect(quando.textContent).toBe('08/10/2026');
    expect(quando.getAttribute('datetime')).toBe('2026-10-08');
  });

  it('o status leva ícone svg decorativo e texto, sem emoji', () => {
    const li = renderEvento(document, base);
    const status = li.querySelector('.evento-meta .status')!;
    expect(status.querySelector('svg.icone[aria-hidden="true"] path')!.getAttribute('d')).toBe(ICONES.lista);
    expect(status.textContent!.trim()).toBe('Consta na agenda');
    expect(li.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('todo status e o comunicado apontam para um ícone que existe', () => {
    for (const r of [...Object.values(ROTULO_STATUS), ROTULO_COMUNICADO]) expect(ICONES[r.icone]).toMatch(/^M/);
  });

  it('nenhum status usa desenho de alerta: alterado e removido têm ícones próprios', () => {
    expect(ROTULO_STATUS.alterado.icone).toBe('lapis');
    expect(ROTULO_STATUS.removido.icone).toBe('cortado');
  });

  it('o link permanente fica na faixa de fontes, fora da lista de fontes', () => {
    const li = renderEvento(document, base);
    expect(li.querySelector('.bloco-fontes > a.permalink')).not.toBeNull();
    expect(li.querySelector('.fontes a.permalink')).toBeNull();
    expect(li.querySelector('.evento-meta a')).toBeNull();
    expect(li.querySelectorAll('.fontes a')).toHaveLength(1);
  });

  it('tipo e título continuam dentro da caixa, com as classes do contrato', () => {
    const li = renderEvento(document, base);
    expect(li.className).toBe('evento tipo-agenda status-consta_na_agenda com-hora');
    expect(li.querySelector('.evento-corpo .evento-meta .tipo')!.textContent).toBe('Agenda');
    expect(li.querySelector('.evento-corpo h4.evento-titulo')!.textContent).toBe('Reunião');
    expect(li.querySelector('.evento-corpo .local')!.textContent).toBe('Palácio do Planalto');
    expect(li.querySelector('.evento-corpo .bloco-fontes .selo')!.textContent).toBe('Fonte única');
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
