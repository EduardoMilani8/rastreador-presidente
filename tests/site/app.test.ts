// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { irParaAncora, montar } from '../../site/src/app';
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
  mesesCarregados: ['2026-10', '2026-09'],
  mesesDisponiveis: ['2026-10', '2026-09', '2026-08', '2026-07'],
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

  it('mostra há quanto tempo os dados foram atualizados e avisa quando uma fonte está com falha', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toBe('Última alteração nos dados há 30 min');
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
    expect(li.querySelectorAll('.fontes a')).toHaveLength(2);
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
    montar(document, { ...DADOS, eventos: [], mesesCarregados: [], mesesDisponiveis: [] }, { aba: 'linha' }, HOJE, AGORA);
    const t = document.getElementById('linha-do-tempo')!.textContent!;
    expect(t).toContain('Ainda não há registros');
    expect(t).not.toContain('filtros');
    expect(document.getElementById('periodo')!.textContent).toBe('');
  });

  it('meses recentes vazios, mas com meses anteriores: fala do período e oferece os anteriores', () => {
    montar(document, { ...DADOS, eventos: [] }, { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('linha-do-tempo')!.textContent).toBe('Nenhum registro neste período.');
    expect(document.getElementById('mais-antigos')!.hidden).toBe(false);
  });

  it('não monta a lista de notícias na aba Linha do tempo', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('lista-noticias')!.children).toHaveLength(0);
  });

  it('"dados atualizados" ignora data inválida e usa singular/plural de dias', () => {
    const com = (ultimaNovidadeEm: string) => ({ ...DADOS, estado: { ...DADOS.estado, ultimaNovidadeEm } });
    montar(document, com('não-é-data'), { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toBe('');
    montar(document, com('2026-10-07T14:00:00.000Z'), { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toBe('Última alteração nos dados há 1 dia');
    montar(document, com('2026-10-05T14:00:00.000Z'), { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toBe('Última alteração nos dados há 3 dias');
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
    expect([...document.querySelectorAll('#linha-do-tempo .fontes a')].map((a) => a.getAttribute('href'))).toEqual(['https://www.gov.br/ok']);
    // fora das fontes, os únicos links são os permanentes, sempre relativos à própria página
    const outros = [...document.querySelectorAll('#linha-do-tempo a:not(.fontes a)')].map((a) => a.getAttribute('href')!);
    expect(outros.length).toBeGreaterThan(0);
    expect(outros.every((h) => h.startsWith('?de='))).toBe(true);
  });
});

describe('período mostrado e meses anteriores (I5)', () => {
  const texto = (id: string) => document.getElementById(id)!.textContent!;
  const maisAntigos = () => document.getElementById('mais-antigos') as HTMLElement;
  const hrefMaisAntigos = () => maisAntigos().querySelector('a')!.getAttribute('href');

  it('sem datas, diz qual período foi consultado (os meses carregados até hoje) e quantos registros há', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    expect(texto('periodo')).toBe('Mostrando 01/09/2026 a 08/10/2026: 3 registros em 2 dias.');
  });

  it('filtro de tipo sem datas e sem resultado: não diz que "não existe", diz o período e oferece os meses anteriores', () => {
    montar(document, DADOS, { aba: 'linha', tipo: 'comunicado' }, HOJE, AGORA);
    expect(texto('periodo')).toBe('Mostrando 01/09/2026 a 08/10/2026.');
    expect(texto('linha-do-tempo')).toBe('Nenhum registro neste período.');
    expect(maisAntigos().hidden).toBe(false);
    expect(maisAntigos().textContent).toContain('Ver meses anteriores');
    expect(hrefMaisAntigos()).toBe('?aba=linha&de=2026-08-01&tipo=comunicado');
  });

  it('"Ver meses anteriores" recua um mês disponível por vez e mantém tipo, status e a data final', () => {
    montar(document, { ...DADOS, mesesCarregados: ['2026-10', '2026-09', '2026-08'] },
      { aba: 'linha', de: '2026-08-01', ate: '2026-10-07', tipo: 'agenda', status: 'realizado' }, HOJE, AGORA);
    expect(hrefMaisAntigos()).toBe('?aba=linha&de=2026-07-01&ate=2026-10-07&tipo=agenda&status=realizado');
    expect(texto('periodo')).toBe('Mostrando 01/08/2026 a 07/10/2026: 1 registro em 1 dia.');
  });

  it('pula meses sem dados: vai para o mês anterior que existe', () => {
    montar(document, { ...DADOS, mesesDisponiveis: ['2026-10', '2026-09', '2026-05'] }, { aba: 'linha' }, HOJE, AGORA);
    expect(hrefMaisAntigos()).toBe('?aba=linha&de=2026-05-01');
  });

  it('sem nada mais antigo, o link some', () => {
    montar(document, { ...DADOS, mesesDisponiveis: ['2026-10', '2026-09'] }, { aba: 'linha' }, HOJE, AGORA);
    expect(maisAntigos().hidden).toBe(true);
    montar(document, { ...DADOS, mesesCarregados: ['2026-07'] }, { aba: 'linha', de: '2026-07-10', ate: '2026-07-20' }, HOJE, AGORA);
    expect(maisAntigos().hidden).toBe(true);
  });

  it('com filtro, registros futuros entram na linha do tempo e o período vai até o último deles', () => {
    montar(document, DADOS, { aba: 'linha', tipo: 'agenda' }, HOJE, AGORA);
    expect(texto('periodo')).toBe('Mostrando 01/09/2026 a 09/10/2026: 3 registros em 3 dias.');
  });

  it('data inicial no futuro não vira um período invertido', () => {
    montar(document, { ...DADOS, mesesCarregados: [] }, { aba: 'linha', de: '2030-01-01' }, HOJE, AGORA);
    expect(texto('periodo')).toBe('Mostrando a partir de 01/01/2030.');
    expect(texto('linha-do-tempo')).toBe('Nenhum registro neste período.');
  });

  it('números grandes usam o formato brasileiro', () => {
    const muitos = Array.from({ length: 1500 }, (_, i) => ev(`m${i}`, '2026-10-07'));
    montar(document, { ...DADOS, eventos: muitos }, { aba: 'linha' }, HOJE, AGORA);
    expect(texto('periodo')).toBe('Mostrando 01/09/2026 a 08/10/2026: 1.500 registros em 1 dia.');
  });
});

describe('linha do tempo longa aparece aos poucos (I6)', () => {
  const dia = (i: number) => new Date(Date.UTC(2026, 9, 7) - i * 86_400_000).toISOString().slice(0, 10);
  const CEM_DIAS: Dados = {
    ...DADOS, eventos: Array.from({ length: 100 }, (_, i) => ev(`d${i}`, dia(i))),
    mesesCarregados: ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06'], mesesDisponiveis: ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05'],
  };
  const dias = () => document.querySelectorAll('#linha-do-tempo section.dia');
  const botao = () => document.querySelector<HTMLButtonElement>('#mais-dias button');

  it('mostra os 60 dias mais recentes e um botão para os seguintes', () => {
    montar(document, CEM_DIAS, { aba: 'linha', de: '2026-06-01' }, HOJE, AGORA);
    expect(dias()).toHaveLength(60);
    expect(dias()[0].querySelector('time')!.getAttribute('datetime')).toBe('2026-10-07');
    expect(botao()!.textContent).toBe('Mostrar mais dias');
    expect(botao()!.getAttribute('type')).toBe('button');
    expect(document.getElementById('mais-dias')!.textContent).toContain('60 de 100 dias');
    expect(document.getElementById('periodo')!.textContent).toBe('Mostrando 01/06/2026 a 08/10/2026: 100 registros em 100 dias.');
    // o link para meses anteriores só faz sentido depois do último dia já carregado
    expect(document.getElementById('mais-antigos')!.hidden).toBe(true);
  });

  it('o botão acrescenta o lote seguinte, leva o foco ao primeiro dia novo e some quando acaba', () => {
    montar(document, CEM_DIAS, { aba: 'linha', de: '2026-06-01' }, HOJE, AGORA);
    const primeiro = dias()[0];
    botao()!.click();
    expect(dias()).toHaveLength(100);
    expect(dias()[0]).toBe(primeiro); // acrescenta, não redesenha
    const novo = dias()[60].querySelector('h3')!;
    expect(document.activeElement).toBe(novo);
    expect(novo.getAttribute('tabindex')).toBe('-1');
    expect(botao()).toBeNull();
    expect(document.getElementById('mais-dias')!.hidden).toBe(true);
    expect(document.getElementById('mais-antigos')!.hidden).toBe(false);
    expect(new Set([...document.querySelectorAll('[id]')].map((e) => e.id)).size).toBe(document.querySelectorAll('[id]').length);
  });

  it('com mais de dois lotes o botão continua até o fim', () => {
    const muitos = { ...CEM_DIAS, eventos: Array.from({ length: 130 }, (_, i) => ev(`d${i}`, dia(i))) };
    montar(document, muitos, { aba: 'linha', de: '2026-05-01' }, HOJE, AGORA);
    botao()!.click();
    expect(dias()).toHaveLength(120);
    expect(document.getElementById('mais-dias')!.textContent).toContain('120 de 130 dias');
    botao()!.click();
    expect(dias()).toHaveLength(130);
    expect(botao()).toBeNull();
  });

  it('poucos dias: sem botão', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    expect(botao()).toBeNull();
    expect(document.getElementById('mais-dias')!.hidden).toBe(true);
  });

  it('nada de handler inline (CSP) e axe limpo com o botão visível', async () => {
    montar(document, CEM_DIAS, { aba: 'linha', de: '2026-06-01' }, HOJE, AGORA);
    expect(document.querySelectorAll('[onclick], [style]')).toHaveLength(0);
    const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
  });
});

describe('dados sem alteração há muito tempo (I3/N2)', () => {
  const com = (ultimaNovidadeEm: string) => ({ ...DADOS, estado: { ...DADOS.estado, ultimaNovidadeEm } });
  const aviso = () => document.getElementById('aviso-desatualizado') as HTMLElement;

  it('mais de 24 horas sem gravação: diz quando foi a última alteração, sem afirmar que a coleta parou', () => {
    montar(document, com('2026-10-07T08:00:00.000Z'), { aba: 'linha' }, HOJE, AGORA);
    expect(aviso().hidden).toBe(false);
    expect(aviso().textContent).toBe('Última alteração nos dados: 07/10/2026 às 05:00 (horário de Brasília). Se as fontes publicaram algo depois disso, ainda não aparece aqui.');
    expect(aviso().getAttribute('role')).toBe('status');
  });

  it('madrugada parada (12 horas sem notícia nova) não gera aviso; até 24 horas também não', () => {
    for (const quando of ['2026-10-08T03:00:00.000Z', '2026-10-07T15:00:00.000Z']) {
      montar(document, com(quando), { aba: 'linha' }, HOJE, AGORA);
      expect(aviso().hidden).toBe(true);
      expect(aviso().textContent).toBe('');
    }
  });

  it('sem data conhecida não afirma nada', () => {
    montar(document, { ...DADOS, estado: { fontes: {} } }, { aba: 'linha' }, HOJE, AGORA);
    expect(aviso().hidden).toBe(true);
    expect(document.getElementById('ultima-novidade')!.textContent).toBe('');
  });

  it('o aviso também aparece na aba Notícias', () => {
    montar(document, com('2026-10-06T08:00:00.000Z'), { aba: 'noticias' }, HOJE, AGORA);
    expect(aviso().textContent).toContain('Última alteração nos dados: 06/10/2026 às 05:00');
  });
});

describe('período não sugere cobertura que não existe', () => {
  it('"de" anterior ao primeiro mês com dados: o período começa no primeiro mês disponível', () => {
    montar(document, { ...DADOS, mesesCarregados: ['2026-10', '2026-09', '2026-08', '2026-07'] }, { aba: 'linha', de: '2020-01-01' }, HOJE, AGORA);
    expect(document.getElementById('periodo')!.textContent).toMatch(/^Mostrando 01\/07\/2026 a /);
    expect(document.getElementById('mais-antigos')!.hidden).toBe(true);
  });
  it('"de" dentro dos dados continua como foi pedido', () => {
    montar(document, { ...DADOS, mesesCarregados: ['2026-10', '2026-09', '2026-08'] }, { aba: 'linha', de: '2026-08-15' }, HOJE, AGORA);
    expect(document.getElementById('periodo')!.textContent).toMatch(/^Mostrando 15\/08\/2026 a /);
  });
});

describe('filtros não empurram os destaques (spec §1)', () => {
  const caixa = () => document.getElementById('caixa-filtros') as HTMLDetailsElement;
  const antes = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('o formulário fica recolhido e vem depois de "Último registro" e "Próximos compromissos"', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    expect(caixa().tagName).toBe('DETAILS');
    expect(caixa().open).toBe(false);
    expect(caixa().querySelector('summary')!.textContent).toMatch(/Filtrar/);
    expect(caixa().querySelector('form#filtros')).not.toBeNull();
    expect(antes(document.getElementById('bloco-ultimo')!, caixa())).toBe(true);
    expect(antes(document.getElementById('bloco-proximos')!, caixa())).toBe(true);
    expect(antes(caixa(), document.getElementById('linha-do-tempo')!)).toBe(true);
  });

  it('com filtro ativo o formulário abre, para o filtro em uso ficar à vista', async () => {
    montar(document, DADOS, { aba: 'linha', tipo: 'ato' }, HOJE, AGORA);
    expect(caixa().open).toBe(true);
    const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
  });
});

describe('link permanente (spec §7.4)', () => {
  it('cada item da linha do tempo e dos destaques tem link visível para o próprio dia e âncora', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    const link = document.querySelector('#ev-b a.permalink')!;
    expect(link.textContent).toBe('Link permanente');
    expect(link.getAttribute('aria-label')).toBe('Link permanente: Compromisso b');
    expect(link.getAttribute('href')).toBe('?de=2026-10-07&ate=2026-10-07#ev-b');
    expect(document.querySelectorAll('#linha-do-tempo a.permalink')).toHaveLength(3);
    expect(document.querySelector('#proximos a.permalink')!.getAttribute('href')).toBe('?de=2026-10-09&ate=2026-10-09#ev-d');
  });

  it('abrir o link mostra o item: a página do dia contém a âncora, mesmo para compromisso futuro', () => {
    montar(document, DADOS, { aba: 'linha', de: '2026-10-09', ate: '2026-10-09' }, HOJE, AGORA);
    expect(document.getElementById('ev-d')).not.toBeNull();
  });

  it('irParaAncora rola até o item da âncora e o destaca', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    const alvo = document.getElementById('ev-b')!;
    alvo.scrollIntoView = vi.fn();
    irParaAncora(document, '#ev-b');
    expect(alvo.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(alvo.classList.contains('em-destaque')).toBe(true);
    expect(document.activeElement).toBe(alvo);
  });

  it('irParaAncora ignora âncora vazia, inexistente, malformada ou que pareça seletor', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    const espiao = vi.fn();
    for (const e of document.querySelectorAll<HTMLElement>('*')) e.scrollIntoView = espiao;
    for (const hash of ['', '#', '#nao-existe', '#%E0%A4%A', '#linha-do-tempo .evento', '#ev-b, #ev-a', '#"]<img src=x>']) {
      expect(() => irParaAncora(document, hash)).not.toThrow();
    }
    expect(espiao).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.em-destaque')).toHaveLength(0);
  });
});
