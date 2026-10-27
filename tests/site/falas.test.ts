// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { carregarFalas } from '../../site/src/dados';
import { lerTipoFala, montarPaginaFalas, ROTULO_TIPO_FALA, type DadosFalas } from '../../site/src/falas';
import { TipoFalaSchema, type FalaChecada } from '../../src/shared/schema';

// jsdom não dá a import.meta.url um esquema file:, então resolve a partir da raiz do projeto.
const PAGINA = () => readFileSync(resolve(process.cwd(), 'site/falas.html'), 'utf8');
const T = '2026-10-08T12:00:00.000Z';
const AGORA = new Date('2026-10-27T15:00:00Z');

const fala = (extra: Partial<FalaChecada> = {}): FalaChecada => ({
  id: '2026-03-12-aos-fatos-entrevista',
  data: '2026-03-12',
  tipo: 'entrevista',
  evento: 'Entrevista a uma rádio',
  agencia: 'aos-fatos',
  agenciaNome: 'Aos Fatos',
  titulo: 'Checamos a entrevista',
  url: 'https://www.aosfatos.org/noticias/checamos-entrevista/',
  publicadaEm: '2026-03-13',
  ...extra,
});
const PODCAST = fala({
  id: '2026-05-02-afp-podcast', data: '2026-05-02', tipo: 'podcast', evento: 'Entrevista a um podcast',
  agencia: 'afp-checamos', agenciaNome: 'AFP Checamos', titulo: 'Checamos o podcast',
  url: 'https://checamos.afp.com/doc.afp.com.ABC', publicadaEm: '2026-05-04',
});
const dados = (falas: FalaChecada[], extra: Partial<DadosFalas> = {}): DadosFalas => ({
  falas, estado: { fontes: { checagens: { ok: true, desde: T } }, ultimaNovidadeEm: '2026-10-27T14:30:00.000Z' },
  incompleto: false, ...extra,
});

const cartoes = () => [...document.querySelectorAll<HTMLElement>('#lista-falas > li.fala')];
const filtros = () => [...document.querySelectorAll<HTMLAnchorElement>('#filtro-falas a')];

beforeEach(() => {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.innerHTML = PAGINA();
});

describe('site/falas.html', () => {
  it('tem título, aviso de que não é registro oficial e a lista, nessa ordem', () => {
    expect(document.querySelector('main > h1')!.textContent).toBe('Falas checadas');
    const aviso = document.querySelector('#painel-falas > .aviso-imprensa')!.textContent!.replace(/\s+/g, ' ');
    expect(aviso).toContain('Esta seção não é registro oficial.');
    expect(aviso).toContain('agências independentes de checagem');
    expect(aviso).toContain('O Rastreador não avalia falas');
    expect(document.querySelector('#painel-falas > ol#lista-falas')).not.toBeNull();
    expect(document.querySelector('#painel-falas > #filtro-falas')).not.toBeNull();
  });

  it('carrega só o próprio módulo', () => {
    const scripts = [...PAGINA().matchAll(/<script[^>]*>/g)].map((m) => m[0]);
    expect(scripts).toEqual(['<script type="module" src="./src/main-falas.ts">']);
  });
});

describe('lerTipoFala', () => {
  it('aceita só os tipos do esquema; o resto é "todas"', () => {
    for (const t of TipoFalaSchema.options) expect(lerTipoFala(`?tipo=${t}`)).toBe(t);
    for (const q of ['', '?tipo=', '?tipo=live', '?tipo=ENTREVISTA', '?tipo=<script>', '?outro=entrevista']) {
      expect(lerTipoFala(q), q).toBeUndefined();
    }
  });

  it('todo tipo tem rótulo no singular e no plural', () => {
    for (const t of TipoFalaSchema.options) {
      expect(ROTULO_TIPO_FALA[t].um.length).toBeGreaterThan(0);
      expect(ROTULO_TIPO_FALA[t].varios.length).toBeGreaterThan(0);
    }
  });
});

describe('montarPaginaFalas', () => {
  it('desenha um cartão por checagem, da fala mais recente à mais antiga, com tudo o que a spec pede', () => {
    const f = fala({
      vereditos: [{ rotulo: 'Falso', frases: 3 }, { rotulo: 'Verdadeiro', frases: 1 }],
      errata: { data: '2026-03-14', texto: 'A agência corrigiu o número de frases.' },
    });
    montarPaginaFalas(document, dados([f, PODCAST]), AGORA, '');
    const [primeiro, segundo] = cartoes();
    expect(cartoes()).toHaveLength(2);
    expect(primeiro.querySelector('h2')!.textContent).toBe('Entrevista a um podcast');
    expect(segundo.id).toBe('fala-2026-03-12-aos-fatos-entrevista');
    const texto = segundo.textContent!.replace(/\s+/g, ' ');
    expect(segundo.querySelector('.evento-meta')!.textContent).toBe('Entrevista · 12/03/2026');
    expect(segundo.querySelector('time')!.getAttribute('datetime')).toBe('2026-03-12');
    expect(texto).toContain('Checagem de Aos Fatos, publicada em 13/03/2026');
    expect([...segundo.querySelectorAll('.vereditos li')].map((li) => li.textContent)).toEqual(['Falso: 3 frases', 'Verdadeiro: 1 frase']);
    expect(segundo.querySelector('.vereditos')!.getAttribute('aria-label')).toBe('Vereditos da agência');
    expect(segundo.querySelector('.errata')!.textContent).toBe('Errata da agência (14/03/2026): A agência corrigiu o número de frases.');
    const link = segundo.querySelector('a')!;
    expect(link.textContent).toBe('Checamos a entrevista');
    expect(link.getAttribute('href')).toBe('https://www.aosfatos.org/noticias/checamos-entrevista/');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(primeiro.querySelector('.vereditos')).toBeNull();
    expect(primeiro.querySelector('.errata')).toBeNull();
  });

  it('a ordem não depende da ordem do arquivo', () => {
    montarPaginaFalas(document, dados([fala(), PODCAST]), AGORA, '');
    const a = cartoes().map((c) => c.id);
    montarPaginaFalas(document, dados([PODCAST, fala()]), AGORA, '');
    expect(cartoes().map((c) => c.id)).toEqual(a);
  });

  it('filtro por tipo: só os itens do tipo, com a opção atual marcada e contagens', () => {
    montarPaginaFalas(document, dados([fala(), PODCAST]), AGORA, '?tipo=podcast');
    expect(cartoes().map((c) => c.id)).toEqual(['fala-2026-05-02-afp-podcast']);
    expect(filtros().map((a) => [a.getAttribute('href'), a.textContent])).toEqual([
      ['falas.html', 'Todas (2)'], ['falas.html?tipo=entrevista', 'Entrevistas (1)'], ['falas.html?tipo=podcast', 'Podcasts (1)'],
    ]);
    const atual = filtros().filter((a) => a.hasAttribute('aria-current'));
    expect(atual.map((a) => [a.textContent, a.getAttribute('aria-current')])).toEqual([['Podcasts (1)', 'true']]);
  });

  it('tipo pedido sem nenhum item: a opção continua visível e a lista diz que não há', () => {
    montarPaginaFalas(document, dados([fala()]), AGORA, '?tipo=debate');
    expect(cartoes()).toHaveLength(0);
    expect(document.querySelector('#lista-falas > li.vazio')!.textContent).toBe('Nenhuma checagem de debates registrada até agora.');
    expect(filtros().map((a) => a.textContent)).toEqual(['Todas (1)', 'Entrevistas (1)', 'Debates (0)']);
  });

  it('sem nenhuma checagem: mensagem própria e sem filtro', () => {
    montarPaginaFalas(document, dados([]), AGORA, '');
    expect(document.querySelector('#lista-falas > li.vazio')!.textContent).toBe('Nenhuma checagem registrada até agora.');
    expect((document.getElementById('filtro-falas') as HTMLElement).hidden).toBe(true);
  });

  it('remontar não duplica nada', () => {
    montarPaginaFalas(document, dados([fala(), PODCAST]), AGORA, '');
    montarPaginaFalas(document, dados([fala(), PODCAST]), AGORA, '');
    expect(cartoes()).toHaveLength(2);
    expect(filtros()).toHaveLength(3);
  });

  it('preenche os avisos comuns: falha da lista de checagens e dados incompletos', () => {
    montarPaginaFalas(document, dados([], {
      estado: { fontes: { checagens: { ok: false, desde: T, mensagem: 'x' } }, ultimaNovidadeEm: '2026-10-27T14:30:00.000Z' },
      incompleto: true,
    }), AGORA, '');
    expect(document.getElementById('aviso-fontes')!.textContent).toContain('Lista de falas checadas');
    expect(document.getElementById('aviso-incompleto')!.hidden).toBe(false);
  });

  it('texto da fonte entra só como texto: marcação vira letra, nunca elemento', () => {
    const ataque = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    montarPaginaFalas(document, dados([fala({
      evento: ataque, titulo: ataque, agenciaNome: ataque,
      vereditos: [{ rotulo: ataque, frases: 1 }], errata: { data: '2026-03-14', texto: ataque },
    })]), AGORA, '');
    const painel = document.getElementById('painel-falas')!;
    expect(painel.querySelector('img, script')).toBeNull();
    expect(painel.textContent).toContain(ataque);
    expect(painel.querySelectorAll('[onerror]')).toHaveLength(0);
  });

  it('URL que não é https (vinda de fora do esquema) não vira link', () => {
    for (const url of ['javascript:alert(1)', 'http://www.aosfatos.org/noticias/x/', 'data:text/html,oi']) {
      montarPaginaFalas(document, dados([fala({ url })]), AGORA, '');
      expect(cartoes()[0].querySelector('a'), url).toBeNull();
      expect(cartoes()[0].textContent).toContain('Checamos a entrevista');
    }
  });

  it('id com caractere estranho não quebra a âncora', () => {
    montarPaginaFalas(document, dados([fala({ id: '2026-03-12-x" onclick="y' })]), AGORA, '');
    expect(cartoes()[0].id).toMatch(/^fala-[a-zA-Z0-9._-]+$/);
  });

  it('axe: sem violações, com filtro, vereditos e errata', async () => {
    montarPaginaFalas(document, dados([
      fala({ vereditos: [{ rotulo: 'Falso', frases: 2 }], errata: { data: '2026-03-14', texto: 'Correção.' } }), PODCAST,
    ]), AGORA, '?tipo=entrevista');
    const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
  });
});

describe('carregarFalas', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (mapa: Record<string, unknown>) => vi.stubGlobal('fetch', async (url: string) =>
    (url in mapa ? new Response(JSON.stringify(mapa[url]), { status: 200 }) : new Response('nope', { status: 404 })));
  const STATUS = { fontes: { checagens: { ok: true, desde: T } } };

  it('lê falas.json e status.json; item inválido é descartado sem derrubar os outros', async () => {
    stub({ 'data/status.json': STATUS, 'data/falas.json': [fala(), { ...fala(), url: 'http://inseguro.example/' }, { lixo: 1 }] });
    const d = await carregarFalas();
    expect(d.falas).toEqual([fala()]);
    expect(d.incompleto).toBe(false);
    expect(d.estado).toEqual(STATUS);
  });

  it('sem falas.json, ou com corpo que não é lista, a lista fica vazia e a página avisa', async () => {
    stub({ 'data/status.json': STATUS });
    expect(await carregarFalas()).toMatchObject({ falas: [], incompleto: true });
    stub({ 'data/status.json': STATUS, 'data/falas.json': { a: 1 } });
    expect(await carregarFalas()).toMatchObject({ falas: [], incompleto: true });
  });
});
