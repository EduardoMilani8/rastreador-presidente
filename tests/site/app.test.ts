// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { montar } from '../../site/src/app';
import type { Dados } from '../../site/src/dados';
import type { Evento, Noticia } from '../../src/shared/schema';

// jsdom não dá a import.meta.url um esquema file:, então resolve a partir da raiz do projeto.
const PAGINA = () => readFileSync(resolve(process.cwd(), 'site/index.html'), 'utf8');
const T = '2026-10-08T12:00:00.000Z';
const HOJE = '2026-10-08';
const AGORA = new Date('2026-10-08T15:00:00Z');
const f = (nome: string, url: string) => ({ nome, rotulo: 'Planalto (governo)', url, coletadoEm: T });
const ev = (id: string, data: string, sobre: Partial<Evento> = {}): Evento => ({
  id, tipo: 'agenda', data, hora: '10:00', titulo: `Compromisso ${id}`, local: 'Palácio do Planalto',
  status: 'consta_na_agenda', fontes: [f('agenda-planalto', `https://www.gov.br/${id}`)],
  confirmadoPor: [], historico: [], ...sobre,
});

const noticia: Noticia = {
  id: 'google-news:abc', titulo: 'Manchete', veiculo: 'BBC', data: '2026-10-08T11:00:00.000Z',
  url: 'https://news.google.com/x', origem: 'google-news',
};
const DADOS: Dados = {
  eventos: [
    ev('a', '2026-10-06'),
    ev('b', '2026-10-07', { status: 'realizado', confirmadoPor: ['planalto:b'], fontes: [f('agenda-planalto', 'https://www.gov.br/b'), f('comunicado-planalto', 'https://www.gov.br/cb')] }),
    ev('c', '2026-10-07', { tipo: 'ato', hora: undefined, status: 'publicado', datasAto: { assinatura: '2026-10-06', publicacao: '2026-10-07' } }),
    ev('d', '2026-10-09', { status: 'agendado' }),
  ],
  noticias: [noticia],
  estado: { fontes: { agenda: { ok: true, desde: T }, dou: { ok: false, desde: T, mensagem: 'x' } }, ultimaNovidadeEm: '2026-10-08T14:30:00.000Z' },
  incompleto: false,
};

beforeEach(() => {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.innerHTML = PAGINA();
});

describe('montar', () => {
  it('mostra último registro, próximos compromissos e a linha do tempo agrupada por dia', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('ultimo-registro')!.textContent).toContain('Compromisso b'); // 07/10 10:00 vence o ato sem hora
    expect(document.getElementById('proximos')!.textContent).toContain('Compromisso d');
    const timeline = document.getElementById('linha-do-tempo')!;
    expect(timeline.textContent).not.toContain('Compromisso d'); // agendado só na faixa de próximos
    expect(timeline.querySelectorAll('section.dia')).toHaveLength(2);
    expect(timeline.querySelector('section.dia h3')!.textContent).toContain('quarta-feira, 7 de outubro de 2026');
  });

  it('mostra "última novidade" e avisa quando uma fonte está com falha', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toContain('há 30 min');
    const aviso = document.getElementById('aviso-fontes')!;
    expect(aviso.hidden).toBe(false);
    expect(aviso.textContent).toContain('Diário Oficial');
  });

  it('com filtro ativo esconde próximos/último e aplica o filtro', () => {
    montar(document, DADOS, { aba: 'linha', tipo: 'ato' }, HOJE, AGORA);
    expect(document.getElementById('bloco-proximos')!.hidden).toBe(true);
    expect(document.getElementById('bloco-ultimo')!.hidden).toBe(true);
    expect(document.getElementById('linha-do-tempo')!.querySelectorAll('li.evento')).toHaveLength(1);
  });

  it('sem resultados mostra mensagem clara', () => {
    montar(document, DADOS, { aba: 'linha', de: '2030-01-01' }, HOJE, AGORA);
    expect(document.getElementById('linha-do-tempo')!.textContent).toContain('Nenhum registro');
  });

  it('aba Notícias mostra notícias e esconde a linha do tempo', () => {
    montar(document, DADOS, { aba: 'noticias' }, HOJE, AGORA);
    expect(document.getElementById('painel-linha')!.hidden).toBe(true);
    expect(document.getElementById('painel-noticias')!.hidden).toBe(false);
    expect(document.getElementById('lista-noticias')!.textContent).toContain('Manchete');
    expect(document.getElementById('aba-noticias')!.getAttribute('aria-current')).toBe('page');
  });

  it('preenche o formulário com os filtros da URL', () => {
    montar(document, DADOS, { aba: 'linha', tipo: 'ato', de: '2026-10-01' }, HOJE, AGORA);
    expect((document.querySelector('#filtros [name=tipo]') as HTMLSelectElement).value).toBe('ato');
    expect((document.querySelector('#filtros [name=de]') as HTMLInputElement).value).toBe('2026-10-01');
  });

  it('não tem violações de acessibilidade detectáveis pelo axe (linha do tempo e notícias)', async () => {
    for (const aba of ['linha', 'noticias'] as const) {
      document.documentElement.innerHTML = PAGINA();
      montar(document, DADOS, { aba }, HOJE, AGORA);
      const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
      expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
    }
  });
});

describe('dados incompletos', () => {
  it('avisa de forma acessível quando algum dado não pôde ser carregado', () => {
    montar(document, { ...DADOS, incompleto: true }, { aba: 'linha' }, HOJE, AGORA);
    const aviso = document.getElementById('aviso-incompleto')!;
    expect(aviso.hidden).toBe(false);
    expect(aviso.getAttribute('role')).toMatch(/status|alert/);
    expect(aviso.textContent).toBe('Alguns dados não puderam ser carregados; a lista pode estar incompleta.');
  });

  it('não mostra o aviso quando os dados estão completos', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('aviso-incompleto')!.hidden).toBe(true);
  });

  it('o aviso também aparece na aba Notícias e não conflita com o aviso de fontes', () => {
    montar(document, { ...DADOS, incompleto: true }, { aba: 'noticias' }, HOJE, AGORA);
    expect(document.getElementById('aviso-incompleto')!.hidden).toBe(false);
    expect(document.getElementById('aviso-fontes')!.textContent).toContain('Diário Oficial');
  });

  it('axe: sem violações com o aviso visível', async () => {
    montar(document, { ...DADOS, incompleto: true }, { aba: 'linha' }, HOJE, AGORA);
    const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
  });
});

describe('próximos x linha do tempo', () => {
  it('agendado com data passada não é "próximo" e continua na linha do tempo', () => {
    const velho = ev('velho', '2026-10-05', { status: 'agendado' });
    montar(document, { ...DADOS, eventos: [...DADOS.eventos, velho] }, { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('proximos')!.textContent).not.toContain('Compromisso velho');
    expect(document.getElementById('proximos')!.textContent).toContain('Compromisso d');
    expect(document.getElementById('linha-do-tempo')!.textContent).toContain('Compromisso velho');
  });

  it('agendado para hoje aparece só nos próximos', () => {
    const hojeEv = ev('hoje', HOJE, { status: 'agendado' });
    montar(document, { ...DADOS, eventos: [...DADOS.eventos, hojeEv] }, { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('proximos')!.textContent).toContain('Compromisso hoje');
    expect(document.getElementById('linha-do-tempo')!.textContent).not.toContain('Compromisso hoje');
  });
});

describe('item removido', () => {
  it('continua mostrando a confirmação por várias fontes', () => {
    const removido = ev('r', '2026-10-07', {
      status: 'removido', confirmadoPor: ['planalto:r'],
      fontes: [f('agenda-planalto', 'https://www.gov.br/r'), f('comunicado-planalto', 'https://www.gov.br/cr')],
    });
    montar(document, { ...DADOS, eventos: [removido] }, { aba: 'linha' }, HOJE, AGORA);
    const li = document.getElementById('ev-r')!;
    expect(li.textContent).toContain('Removido da agenda');
    expect(li.textContent).toContain('Confirmado por 2 fontes');
    expect(li.querySelectorAll('a')).toHaveLength(2);
  });
});

describe('ids únicos', () => {
  it('o documento montado não tem ids duplicados (destaque repete item da linha do tempo)', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    // 'b' é o último registro E aparece na linha do tempo
    expect(document.getElementById('ultimo-registro')!.textContent).toContain('Compromisso b');
    expect(document.getElementById('linha-do-tempo')!.textContent).toContain('Compromisso b');
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(document.querySelectorAll('#ultimo-registro [id], #proximos [id]')).toHaveLength(0);
    expect(document.getElementById('ev-b')).not.toBeNull();
  });
});

describe('estados vazios e mensagens', () => {
  it('aba Notícias sem notícias mostra mensagem', () => {
    montar(document, { ...DADOS, noticias: [] }, { aba: 'noticias' }, HOJE, AGORA);
    expect(document.getElementById('lista-noticias')!.textContent).toContain('Nenhuma notícia');
  });

  it('linha do tempo vazia sem filtros não culpa os filtros', () => {
    montar(document, { ...DADOS, eventos: [] }, { aba: 'linha' }, HOJE, AGORA);
    const t = document.getElementById('linha-do-tempo')!.textContent!;
    expect(t).toContain('Ainda não há registros');
    expect(t).not.toContain('filtros');
  });

  it('não monta a lista de notícias na aba Linha do tempo', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('lista-noticias')!.children).toHaveLength(0);
  });

  it('"última novidade" ignora data inválida e usa singular/plural de dias', () => {
    const com = (ultimaNovidadeEm: string) => ({ ...DADOS, estado: { ...DADOS.estado, ultimaNovidadeEm } });
    montar(document, com('não-é-data'), { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toBe('');
    montar(document, com('2026-10-07T14:00:00.000Z'), { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toBe('Última novidade há 1 dia');
    montar(document, com('2026-10-05T14:00:00.000Z'), { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toBe('Última novidade há 3 dias');
  });
});

describe('texto hostil', () => {
  const RUIM = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const fonteRuim = (url: string) => ({ nome: 'agenda-planalto', rotulo: RUIM, url, coletadoEm: T });

  it('vira texto: sem script/img e sem link http:/javascript:', () => {
    // construído direto (o schema recusa http:, aqui é defesa em profundidade da renderização)
    const hostil: Evento = {
      ...ev('h', '2026-10-07', { status: 'alterado' }),
      titulo: RUIM, local: RUIM, ementa: RUIM,
      historico: [{ titulo: RUIM, local: RUIM, hora: RUIM, registradoEm: T }],
      fontes: [fonteRuim('http://inseguro.example/x'), fonteRuim('javascript:alert(1)'), fonteRuim('https://www.gov.br/ok')],
    };
    const futuro: Evento = { ...hostil, id: 'h2', data: '2026-10-09', status: 'agendado' };
    const news = { ...noticia, titulo: RUIM, veiculo: RUIM, url: 'javascript:alert(1)' };
    const news2 = { ...noticia, id: 'n2', titulo: RUIM, veiculo: RUIM, url: 'http://inseguro.example/n' };
    for (const aba of ['linha', 'noticias'] as const) {
      document.documentElement.innerHTML = PAGINA();
      montar(document, { ...DADOS, eventos: [hostil, futuro], noticias: [news, news2] }, { aba }, HOJE, AGORA);
      const area = document.getElementById('conteudo')!;
      expect(area.querySelectorAll('script, img')).toHaveLength(0);
      expect(area.querySelectorAll('a[href^="http:"], a[href^="javascript:"]')).toHaveLength(0);
      expect(area.textContent).toContain(RUIM);
    }
    // a única fonte https vira link, na linha do tempo
    document.documentElement.innerHTML = PAGINA();
    montar(document, { ...DADOS, eventos: [hostil], noticias: [] }, { aba: 'linha' }, HOJE, AGORA);
    expect([...document.querySelectorAll('#linha-do-tempo a')].map((a) => a.getAttribute('href'))).toEqual(['https://www.gov.br/ok']);
  });
});
