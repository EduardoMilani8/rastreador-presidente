import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { URL_AGENCIA_BRASIL } from '../../src/collectors/noticias';
import { URL_FEED_PLANALTO } from '../../src/collectors/planalto';
import { lerEstado, lerEventos, lerNoticias } from '../../src/pipeline/store';
import { atualizar, retroagir, type Deps } from '../../src/pipeline/run';
import type { Mandato } from '../../src/shared/schema';
import {
  DECRETO_DOU, PAGINA_404, PAGINA_PLANALTO_D11430, PAGINA_PLANALTO_L15090, htmlAgenda, htmlDou, rdfPlanalto, rssGoogle,
  rssVazio,
} from '../helpers';

const MANDATO: Mandato = {
  presidente: 'Luiz Inácio Lula da Silva', nomes: ['Lula'], inicio: '2023-01-01', fim: null,
  agendaBase: 'https://gov.test/agenda-do-presidente-da-republica',
};
const HOJE = '2025-03-10';
const DIA_MS = 86_400_000;

const diasDeAgendaPedidos = () => cfg.pedidos.filter((u) => u.includes('/agenda-do-presidente-da-republica/')).map((u) => u.slice(-10));
const edicoesDouPedidas = () => cfg.pedidos.filter((u) => u.includes('leiturajornal'))
  .map((u) => `${new URL(u).searchParams.get('data')} ${new URL(u).searchParams.get('secao')}`);
const ato = (title: string, urlTitle: string) => ({
  title, urlTitle, artType: 'Decreto numerado', hierarchyStr: 'Atos do Poder Executivo', content: `${title} Dispõe sobre algo.`,
});

const cfg = {
  agenda: {} as Record<string, string>, // data -> html (200). Ausente => 404.
  falhaAgenda: false,
  falhaAgendaDias: [] as string[], // dias cuja página dá erro de rede
  loginAgenda: [] as string[], // dias cuja página o Plone manda para a tela de login (existe, mas não é pública)
  loginOutroDia: false, // o login aponta (came_from) para a página de OUTRO dia
  loginOutroHost: false, // a tela de login está em outro domínio
  statusDou: 200,
  falhaDou: false,
  pedidos: [] as string[], // todas as URLs pedidas, na ordem
  mensagemFalha: 'rede caiu',
  redirecionaAgenda: null as string | null, // URL final devolvida para as páginas de agenda
  redirecionaDou: null as string | null, // URL final devolvida para as edições do DOU
  comunicados: rdfPlanalto([]),
  textoPlanalto: 404,
  corpoPlanalto: '', // HTML devolvido por planalto.gov.br/ccivil_03 quando textoPlanalto = 200
  dou: {} as Record<string, object[]>, // AAAA-MM-DD -> itens da edição ordinária (secao=do1). Ausente => edição vazia.
  extraDou: [] as object[], // itens da edição extra do DOU (secao=do1e) em HOJE
  falhaExtraDou: false,
};

// Formato real (verificado em 2024-10-20, 2024-12-10, 2025-08-03 e 2026-07-25): a página do dia existe mas não está
// pública; o servidor responde 200 na tela de login, com came_from apontando para a página pedida.
const LOGIN = 'https://gov.test/acl_users/credentials_cookie_auth/require_login';
const PAGINA_LOGIN = '<!DOCTYPE html><html lang="pt-br"><head><meta charset="utf-8"><title>Planalto</title></head><body><form id="login_form"></form></body></html>';

const MP_EXTRA = {
  title: 'MEDIDA PROVISÓRIA Nº 1.291, DE 6 DE MARÇO DE 2025', urlTitle: 'medida-provisoria-n-1.291-de-6-de-marco-de-2025-1',
  artType: 'Medida provisória', hierarchyStr: 'Atos do Poder Executivo',
  content: 'MEDIDA PROVISÓRIA Nº 1.291, DE 6 DE MARÇO DE 2025 Dispõe sobre algo. O PRESIDENTE DA REPÚBLICA, no uso',
};

async function buscar(url: string) {
  cfg.pedidos.push(url);
  if (url.includes('/agenda-do-presidente-da-republica/')) {
    const dia = url.slice(-10);
    if (cfg.falhaAgenda || cfg.falhaAgendaDias.includes(dia)) throw new Error(cfg.mensagemFalha);
    if (cfg.loginAgenda.includes(dia)) {
      const origem = cfg.loginOutroDia ? url.replace(dia, '2000-01-01') : url;
      const login = cfg.loginOutroHost ? LOGIN.replace('gov.test', 'outro.test') : LOGIN;
      return { status: 200, corpo: PAGINA_LOGIN, url: `${login}?came_from=${encodeURIComponent(origem)}` };
    }
    const corpo = cfg.agenda[dia];
    const final = cfg.redirecionaAgenda ?? url;
    return corpo ? { status: 200, corpo, url: final } : { status: 404, corpo: PAGINA_404, url: final };
  }
  if (url.includes('leiturajornal')) {
    const [d, m, a] = new URL(url).searchParams.get('data')!.split('-');
    const dia = `${a}-${m}-${d}`;
    if (cfg.falhaDou) throw new Error('rede caiu no DOU');
    if (url.includes('secao=do1e')) {
      if (cfg.falhaExtraDou) throw new Error('rede caiu na edição extra');
      return { status: 200, corpo: htmlDou(dia === HOJE ? cfg.extraDou : []), url: cfg.redirecionaDou ?? url };
    }
    return { status: cfg.statusDou, corpo: htmlDou(cfg.dou[dia] ?? []), url: cfg.redirecionaDou ?? url };
  }
  if (url === URL_FEED_PLANALTO) return { status: 200, corpo: cfg.comunicados, url };
  if (url.startsWith('https://news.google.com')) return { status: 200, corpo: rssGoogle(), url };
  if (url === URL_AGENCIA_BRASIL) return { status: 200, corpo: rssVazio(), url };
  if (url.includes('planalto.gov.br/ccivil_03')) return { status: cfg.textoPlanalto, corpo: cfg.corpoPlanalto, url };
  throw new Error(`URL inesperada no teste: ${url}`);
}

async function novoDeps(): Promise<Deps> {
  return {
    buscar,
    agora: () => new Date('2025-03-10T15:00:00Z'),
    dataDir: await mkdtemp(join(tmpdir(), 'rp-run-')),
    mandatos: [MANDATO],
  };
}

beforeEach(() => {
  cfg.agenda = {
    [HOJE]: htmlAgenda([
      { hora: '09h00', titulo: 'Reunião A', local: 'Palácio do Planalto' },
      { hora: '15h00', titulo: 'Visita ao hospital', local: 'Barretos - SP' },
    ]),
  };
  cfg.falhaAgenda = false;
  cfg.falhaAgendaDias = [];
  cfg.loginAgenda = [];
  cfg.loginOutroDia = false;
  cfg.loginOutroHost = false;
  cfg.statusDou = 200;
  cfg.falhaDou = false;
  cfg.pedidos = [];
  cfg.mensagemFalha = 'rede caiu';
  cfg.redirecionaAgenda = null;
  cfg.redirecionaDou = null;
  cfg.comunicados = rdfPlanalto([]);
  cfg.textoPlanalto = 404;
  cfg.corpoPlanalto = '';
  cfg.dou = { [HOJE]: [DECRETO_DOU] };
  cfg.extraDou = [];
  cfg.falhaExtraDou = false;
});

describe('atualizar', () => {
  it('primeira execução grava agenda, ato, notícias e estado; a segunda não altera nada', async () => {
    const deps = await novoDeps();
    const r1 = await atualizar(deps);
    expect(r1.arquivosEscritos).toBeGreaterThan(0);

    const eventos = await lerEventos(deps.dataDir);
    expect(eventos.filter((e) => e.tipo === 'agenda')).toHaveLength(2);
    expect(eventos.filter((e) => e.tipo === 'ato')).toHaveLength(1);
    expect((await lerNoticias(deps.dataDir)).length).toBe(1);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(true);

    const r2 = await atualizar(deps);
    expect(r2.arquivosEscritos).toBe(0);
  });

  it('mantém data/resumo.json com as contagens do que foi gravado, sem reescrever quando nada muda', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    const resumo = JSON.parse(await readFile(join(deps.dataDir, 'resumo.json'), 'utf8'));
    const eventos = await lerEventos(deps.dataDir);
    expect(resumo).toEqual({
      total: eventos.length,
      porTipo: { agenda: 2, ato: 1, comunicado: 0 },
      desde: eventos.map((e) => e.data).sort()[0],
    });
    expect((await atualizar(deps)).arquivosEscritos).toBe(0);
  });

  it('coleta também a edição extra do DOU (MP publicada em edição extra não pode sumir)', async () => {
    cfg.extraDou = [MP_EXTRA];
    const deps = await novoDeps();
    await atualizar(deps);
    const atos = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'ato');
    expect(atos.map((a) => a.titulo).sort()).toEqual([
      'DECRETO Nº 12.392, DE 7 DE MARÇO DE 2025', 'MEDIDA PROVISÓRIA Nº 1.291, DE 6 DE MARÇO DE 2025',
    ]);
  });

  it('falha na edição extra do DOU marca a fonte "dou" como falha (e não grava silenciosamente só metade)', async () => {
    cfg.falhaExtraDou = true;
    const deps = await novoDeps();
    await atualizar(deps);
    const estado = await lerEstado(deps.dataDir);
    expect(estado.fontes.dou.ok).toBe(false);
    expect(estado.fontes.dou.mensagem).toContain('edição extra');
  });

  it('ato assinado antes do início do mandato não é ato deste Presidente: não é gravado (C1)', async () => {
    // Publicado 4 dias depois da assinatura (não é republicação), mas assinado pelo governo anterior.
    const LEI_GOVERNO_ANTERIOR = {
      title: 'LEI Nº 14.514, DE 29 DE DEZEMBRO DE 2022', urlTitle: 'lei-n-14.514-de-29-de-dezembro-de-2022-1',
      artType: 'Lei', hierarchyStr: 'Atos do Poder Legislativo',
      content: 'LEI Nº 14.514, DE 29 DE DEZEMBRO DE 2022 Dispõe sobre algo. O PRESIDENTE DA REPÚBLICA Faço saber',
    };
    const DECRETO_DA_POSSE = {
      title: 'DECRETO Nº 11.329, DE 1º DE JANEIRO DE 2023', urlTitle: 'decreto-n-11.329-de-1-de-janeiro-de-2023-1',
      artType: 'Decreto numerado', hierarchyStr: 'Atos do Poder Executivo',
      content: 'DECRETO Nº 11.329, DE 1º DE JANEIRO DE 2023 Aprova algo. O PRESIDENTE DA REPÚBLICA, no uso',
    };
    cfg.dou = { '2023-01-02': [LEI_GOVERNO_ANTERIOR, DECRETO_DA_POSSE] };
    const deps = await novoDeps();
    deps.agora = () => new Date('2023-01-02T15:00:00Z');
    await atualizar(deps);
    const atos = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'ato');
    expect(atos.map((a) => a.titulo)).toEqual(['DECRETO Nº 11.329, DE 1º DE JANEIRO DE 2023']);
    expect((await lerEstado(deps.dataDir)).fontes.dou.ok).toBe(true);
  });

  it('republicação (Lei 14.701 em 28/12/2023 e "(*)" em 02/01/2024) não é regravada por uma nova coleta (C1)', async () => {
    const lei = (title: string, urlTitle: string) => ({
      title, urlTitle, artType: 'Lei', hierarchyStr: 'Atos do Poder Legislativo',
      content: `${title} Regulamenta o art. 231 da Constituição Federal. O PRESIDENTE DA REPÚBLICA Faço saber`,
    });
    cfg.dou = {
      '2023-10-20': [lei('LEI Nº 14.701, DE 20 DE OUTUBRO DE 2023', 'lei-n-14.701-de-20-de-outubro-de-2023-517807334')],
      '2023-12-28': [lei('LEI Nº 14.701, DE 20 DE OUTUBRO DE 2023', 'lei-n-14.701-de-20-de-outubro-de-2023-533926998')],
      '2024-01-02': [lei('LEI Nº 14.701, DE 20 DE OUTUBRO DE 2023 (*)', 'lei-n-14.701-de-20-de-outubro-de-2023-*-535292810')],
    };
    const deps = await novoDeps();
    for (const dia of ['2023-10-20', '2023-12-28', '2024-01-02']) {
      expect(await retroagir(deps, dia, dia)).toEqual([]);
    }
    const atos = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'ato');
    expect(atos.map((a) => a.id)).toEqual(['dou:lei-n-14.701-de-20-de-outubro-de-2023-517807334']);
    expect(atos[0].data).toBe('2023-10-20');
  });

  it('adiciona o texto do ato no Planalto quando a URL responde 200 e a página traz a data do ato', async () => {
    cfg.textoPlanalto = 200;
    cfg.corpoPlanalto = '<html><body><p>DECRETO N\uFFFD 12.392, DE 7 DE MAR\uFFFDO DE 2025</p></body></html>';
    const deps = await novoDeps();
    await atualizar(deps);
    const ato = (await lerEventos(deps.dataDir)).find((e) => e.tipo === 'ato')!;
    expect(ato.fontes.map((f) => f.nome)).toEqual(['dou', 'texto-planalto']);
    expect(ato.fontes[1].url).toContain('/decreto/D12392.htm');
  });

  it('URL do Planalto que responde 404 não vira fonte', async () => {
    cfg.corpoPlanalto = '<p>DECRETO Nº 12.392, DE 7 DE MARÇO DE 2025</p>';
    const deps = await novoDeps();
    await atualizar(deps);
    const ato = (await lerEventos(deps.dataDir)).find((e) => e.tipo === 'ato')!;
    expect(ato.fontes.map((f) => f.nome)).toEqual(['dou']);
  });

  it('número errado no título do DOU: página 200 de OUTRO ato não vira "Texto do ato" (C2, casos reais)', async () => {
    const ato = (title: string, urlTitle: string) => ({
      title, urlTitle, artType: 'x', hierarchyStr: 'Atos do Poder Executivo', content: `${title} Dispõe sobre algo.`,
    });
    cfg.textoPlanalto = 200;
    // DOU de 03/03/2023 chamou de "11.430" um decreto de 3 de março; D11430.htm é o decreto de 8 de março.
    cfg.corpoPlanalto = PAGINA_PLANALTO_D11430;
    cfg.dou = {
      '2023-03-03': [ato('DECRETO Nº 11.430, DE 3 DE MARÇO DE 2023', 'decreto-n-11.430-de-3-de-marco-de-2023-467657997')],
      '2023-03-09': [ato('DECRETO Nº 11.430, DE 8 DE MARÇO DE 2023', 'decreto-n-11.430-de-8-de-marco-de-2023-468754527')],
    };
    const deps = await novoDeps();
    await retroagir(deps, '2023-03-03', '2023-03-09');
    // DOU de 08/08/2025 chamou de "15.090" a Lei 15.190; L15090.htm é a lei de 7 de janeiro.
    cfg.corpoPlanalto = PAGINA_PLANALTO_L15090;
    cfg.dou = { '2025-08-08': [ato('LEI Nº 15.090, DE 8 DE AGOSTO DE 2025', 'lei-n-15.090-de-8-de-agosto-de-2025-647407023')] };
    await retroagir(deps, '2025-08-08', '2025-08-08');

    const fontes = Object.fromEntries((await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'ato')
      .map((e) => [e.id, e.fontes.map((f) => f.url.split('/').pop())]));
    expect(fontes).toEqual({
      'dou:decreto-n-11.430-de-3-de-marco-de-2023-467657997': ['decreto-n-11.430-de-3-de-marco-de-2023-467657997'],
      'dou:decreto-n-11.430-de-8-de-marco-de-2023-468754527': ['decreto-n-11.430-de-8-de-marco-de-2023-468754527', 'D11430.htm'],
      'dou:lei-n-15.090-de-8-de-agosto-de-2025-647407023': ['lei-n-15.090-de-8-de-agosto-de-2025-647407023'],
    });
  });

  it('comunicado do mesmo dia e local NÃO marca o compromisso como realizado (aviso de pauta não prova o fato)', async () => {
    cfg.comunicados = rdfPlanalto([
      { slug: 'visita-barretos', titulo: 'Presidente visita o hospital, em Barretos (SP)', data: '2025-03-10T18:00:00-03:00' },
    ]);
    const deps = await novoDeps();
    await atualizar(deps);
    const eventos = await lerEventos(deps.dataDir);
    const visita = eventos.find((e) => e.titulo === 'Visita ao hospital')!;
    expect(visita.status).not.toBe('realizado');
    expect(visita.confirmadoPor).toEqual([]);
    expect(visita.fontes).toHaveLength(1);
    const c = eventos.find((e) => e.tipo === 'comunicado')!;
    expect(c).toMatchObject({ id: 'planalto:visita-barretos', status: 'publicado' });
  });

  it('fonte fora do ar: mantém os dados, registra ok:false, e só vira falha persistente depois de 6 horas', async () => {
    const deps = await novoDeps();
    let t = Date.parse('2025-03-10T15:00:00Z');
    deps.agora = () => new Date(t);
    await atualizar(deps);
    const antes = await lerEventos(deps.dataDir);

    cfg.falhaAgenda = true;
    t += 600_000;
    const r2 = await atualizar(deps);
    expect(r2.falhasPersistentes).toEqual([]);
    expect(Object.keys(r2.errosDestaExecucao)).toEqual(['agenda']);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(false);
    expect(await lerEventos(deps.dataDir)).toEqual(antes);

    t += 5 * 3_600_000 + 50 * 60_000; // 5h50 depois da primeira falha
    expect((await atualizar(deps)).falhasPersistentes).toEqual([]);

    t += 600_000; // 6h depois da primeira falha
    const r3 = await atualizar(deps);
    expect(r3.falhasPersistentes).toEqual(['agenda']);
    expect(r3.arquivosEscritos).toBe(0); // estado idêntico não gera commit

    cfg.falhaAgenda = false;
    const r4 = await atualizar(deps);
    expect(r4.falhasPersistentes).toEqual([]);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(true);
  });

  it('DOU fora do ar há mais de 6 horas: o status registra a falha, mas ele não vira falha persistente (só avisa)', async () => {
    const deps = await novoDeps();
    let t = Date.parse('2025-03-10T15:00:00Z');
    deps.agora = () => new Date(t);
    await atualizar(deps);

    cfg.falhaDou = true;
    t += 600_000;
    await atualizar(deps);
    t += 7 * 3_600_000;
    const r = await atualizar(deps);
    expect((await lerEstado(deps.dataDir)).fontes.dou.ok).toBe(false);
    expect(Object.keys(r.errosDestaExecucao)).toContain('dou');
    expect(r.falhasPersistentes).toEqual([]);
  });

  it('dia com 404 nunca remove compromissos já gravados', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    cfg.agenda = {}; // agora hoje responde 404
    await atualizar(deps);
    const agenda = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'agenda');
    expect(agenda).toHaveLength(2);
    expect(agenda.every((e) => !e.removidoEm)).toBe(true);
  });

  it('dia cuja página só abre com login (não pública) é "sem agenda pública": sem falha e nada é removido', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    cfg.loginAgenda = [HOJE];
    await atualizar(deps);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(true);
    const agenda = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'agenda');
    expect(agenda).toHaveLength(2);
    expect(agenda.every((e) => !e.removidoEm)).toBe(true);
  });

  it('login que aponta para a página de outro dia continua sendo falha (redirecionamento inesperado)', async () => {
    cfg.loginAgenda = [HOJE];
    cfg.loginOutroDia = true;
    const deps = await novoDeps();
    await atualizar(deps);
    const estado = await lerEstado(deps.dataDir);
    expect(estado.fontes.agenda.ok).toBe(false);
    expect(estado.fontes.agenda.mensagem).toContain('Redirecionamento inesperado');
  });

  it('se TODOS os dias da janela pedem login, o site mudou: é falha, não "sem agenda"', async () => {
    cfg.loginAgenda = Array.from({ length: 11 }, (_, i) => `2025-03-${String(7 + i).padStart(2, '0')}`);
    const deps = await novoDeps();
    await atualizar(deps);
    const estado = await lerEstado(deps.dataDir);
    expect(estado.fontes.agenda.ok).toBe(false);
    expect(estado.fontes.agenda.mensagem).toContain('pediram login');
  });

  it('bloqueio real: dias úteis pedem login e fins de semana dão 404 — é falha, não "sem agenda" (I1)', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    // janela de 07/03 a 17/03/2025; 08, 09, 15 e 16 são sábado e domingo
    cfg.loginAgenda = ['2025-03-07', '2025-03-10', '2025-03-11', '2025-03-12', '2025-03-13', '2025-03-14', '2025-03-17'];
    await atualizar(deps);
    const estado = await lerEstado(deps.dataDir);
    expect(estado.fontes.agenda.ok).toBe(false);
    expect(estado.fontes.agenda.mensagem).toContain('pediram login');
    const agenda = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'agenda');
    expect(agenda).toHaveLength(2);
    expect(agenda.every((e) => !e.removidoEm)).toBe(true);
  });

  it('dois dias pedindo login na mesma coleta já é falha (nunca houve dois em 11 dias) (I1)', async () => {
    cfg.loginAgenda = ['2025-03-08', '2025-03-12'];
    const deps = await novoDeps();
    await atualizar(deps);
    const estado = await lerEstado(deps.dataDir);
    expect(estado.fontes.agenda.ok).toBe(false);
    expect(estado.fontes.agenda.mensagem).toContain('2025-03-08, 2025-03-12');
    // os dias que responderam normalmente continuam sendo gravados
    expect((await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'agenda')).toHaveLength(2);
  });

  it('tela de login em outro domínio não vale como "página não pública" (I1)', async () => {
    cfg.loginAgenda = [HOJE];
    cfg.loginOutroHost = true;
    const deps = await novoDeps();
    await atualizar(deps);
    const estado = await lerEstado(deps.dataDir);
    expect(estado.fontes.agenda.ok).toBe(false);
    expect(estado.fontes.agenda.mensagem).toContain('Redirecionamento inesperado');
  });

  it('página do dia servida por outro domínio não vira dado (I1)', async () => {
    cfg.redirecionaAgenda = `https://outro.test/agenda-do-presidente-da-republica/${HOJE}`;
    const deps = await novoDeps();
    await atualizar(deps);
    const estado = await lerEstado(deps.dataDir);
    expect(estado.fontes.agenda.ok).toBe(false);
    expect(estado.fontes.agenda.mensagem).toContain('Redirecionamento inesperado');
    expect((await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'agenda')).toHaveLength(0);
  });

  it('mesmo ato listado duas vezes no mesmo dia (MP 1.373, 29/06/2026) vira um item só, com as duas fontes', async () => {
    const mp = (n: string) => ({
      title: 'MEDIDA PROVISÓRIA Nº 1.373, DE 29 DE JUNHO DE 2026', urlTitle: `medida-provisoria-n-1.373-de-29-de-junho-de-2026-${n}`,
      artType: 'Medida Provisória', hierarchyStr: 'Atos do Poder Executivo',
      content: 'MEDIDA PROVISÓRIA Nº 1.373, DE 29 DE JUNHO DE 2026 Dispõe sobre algo. O PRESIDENTE DA REPÚBLICA, no uso',
    });
    cfg.dou = { '2026-06-29': [mp('715441349'), mp('715441341')] }; // fora de ordem: fica o de menor id, sempre
    const deps = await novoDeps();
    deps.agora = () => new Date('2026-06-29T15:00:00Z');
    await atualizar(deps);
    const atos = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'ato');
    expect(atos.map((a) => a.id)).toEqual(['dou:medida-provisoria-n-1.373-de-29-de-junho-de-2026-715441341']);
    expect(atos[0].fontes.map((f) => f.url)).toEqual([
      'https://www.in.gov.br/web/dou/-/medida-provisoria-n-1.373-de-29-de-junho-de-2026-715441341',
      'https://www.in.gov.br/web/dou/-/medida-provisoria-n-1.373-de-29-de-junho-de-2026-715441349',
    ]);
    cfg.dou = { '2026-06-29': [mp('715441341'), mp('715441349')] };
    expect((await atualizar(deps)).arquivosEscritos).toBe(0);
  });

  it('títulos diferentes no mesmo dia continuam separados; o mesmo título repetido no dia seguinte não vira outro item', async () => {
    cfg.dou = {
      '2025-03-09': [ato('DECRETO Nº 12.391, DE 7 DE MARÇO DE 2025', 'decreto-n-12.391-de-7-de-marco-de-2025-1')],
      '2025-03-10': [
        ato('DECRETO Nº 12.391, DE 7 DE MARÇO DE 2025', 'decreto-n-12.391-de-7-de-marco-de-2025-2'),
        ato('DECRETO Nº 12.392, DE 7 DE MARÇO DE 2025', 'decreto-n-12.392-de-7-de-marco-de-2025-3'),
      ],
    };
    const deps = await novoDeps();
    await atualizar(deps);
    const atos = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'ato');
    expect(atos.map((a) => `${a.data} ${a.id}`)).toEqual([
      '2025-03-09 dou:decreto-n-12.391-de-7-de-marco-de-2025-1', '2025-03-10 dou:decreto-n-12.392-de-7-de-marco-de-2025-3',
    ]);
  });

  describe('retificação "(*)" publicada logo depois da assinatura', () => {
    const lei = (title: string, urlTitle: string) => ({
      title, urlTitle, artType: 'Lei', hierarchyStr: 'Atos do Poder Legislativo',
      content: `${title} Dispõe sobre algo. O PRESIDENTE DA REPÚBLICA Faço saber`,
    });
    const atos = async (deps: Deps) => (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'ato');

    it('Lei 14.642 "(*)" de 03/08/2023, única publicação na lista do DOU: o ato é listado, uma vez, e a 2ª execução não grava nada', async () => {
      cfg.dou = { '2023-08-03': [lei('LEI Nº 14.642, DE 1º DE AGOSTO DE 2023 (*)', 'lei-n-14.642-de-1-de-agosto-de-2023-*-500470021')] };
      cfg.textoPlanalto = 200;
      cfg.corpoPlanalto = '<p>LEI N\uFFFD 14.642, DE 1\uFFFD DE AGOSTO DE 2023</p>';
      const deps = await novoDeps();
      deps.agora = () => new Date('2023-08-03T15:00:00Z');
      await atualizar(deps);
      const r = await atos(deps);
      expect(r.map((a) => a.titulo)).toEqual(['LEI Nº 14.642, DE 1º DE AGOSTO DE 2023 (*)']);
      expect(r[0].fontes.map((f) => f.nome)).toEqual(['dou', 'texto-planalto']);
      expect((await atualizar(deps)).arquivosEscritos).toBe(0);
    });

    it('Lei 15.321: a "(*)" de 31/12/2025 fica; a republicação de 27/05/2026 continua de fora', async () => {
      cfg.dou = {
        '2025-12-31': [lei('LEI Nº 15.321, DE 31 DE DEZEMBRO DE 2025 (*)', 'lei-n-15.321-de-31-de-dezembro-de-2025-*-1')],
        '2026-05-27': [lei('LEI Nº 15.321, DE 31 DE DEZEMBRO DE 2025', 'lei-n-15.321-de-31-de-dezembro-de-2025-708379237')],
      };
      const deps = await novoDeps();
      await retroagir(deps, '2025-12-31', '2025-12-31');
      await retroagir(deps, '2026-05-27', '2026-05-27');
      expect((await atos(deps)).map((a) => `${a.data} ${a.titulo}`)).toEqual(['2025-12-31 LEI Nº 15.321, DE 31 DE DEZEMBRO DE 2025 (*)']);
    });

    it('ato já listado (MP 1.182, 25/07/2023) + "(*)" no dia seguinte: continua um item só, sem buscar o texto de novo', async () => {
      const mp = (t: string, u: string) => ({ ...lei(t, u), hierarchyStr: 'Atos do Poder Executivo' });
      cfg.dou = {
        '2023-07-25': [mp('MEDIDA PROVISÓRIA Nº 1.182, DE 24 DE JULHO DE 2023', 'medida-provisoria-n-1.182-de-24-de-julho-de-2023-1')],
        '2023-07-26': [mp('MEDIDA PROVISÓRIA Nº 1.182, DE 24 DE JULHO DE 2023 (*)', 'medida-provisoria-n-1.182-de-24-de-julho-de-2023-*-498926032')],
      };
      const deps = await novoDeps();
      let t = Date.parse('2023-07-25T15:00:00Z');
      deps.agora = () => new Date(t);
      await atualizar(deps);
      t += DIA_MS;
      await atualizar(deps);
      expect((await atos(deps)).map((a) => `${a.data} ${a.titulo}`)).toEqual(['2023-07-25 MEDIDA PROVISÓRIA Nº 1.182, DE 24 DE JULHO DE 2023']);
      t += 600_000;
      expect((await atualizar(deps)).arquivosEscritos).toBe(0);
    });

    it('"(*)" e publicação comum no mesmo dia (Lei 14.535, 17/01/2023), em qualquer ordem: só a comum', async () => {
      const par = [
        lei('LEI Nº 14.535, DE 17 DE JANEIRO DE 2023 (*)', 'lei-n-14.535-de-17-de-janeiro-de-2023-*-458405010'),
        lei('LEI Nº 14.535, DE 17 DE JANEIRO DE 2023', 'lei-n-14.535-de-17-de-janeiro-de-2023-1'),
      ];
      for (const lista of [par, [...par].reverse()]) {
        cfg.dou = { '2023-01-17': lista };
        const deps = await novoDeps();
        deps.agora = () => new Date('2023-01-17T15:00:00Z');
        await atualizar(deps);
        expect((await atos(deps)).map((a) => a.titulo)).toEqual(['LEI Nº 14.535, DE 17 DE JANEIRO DE 2023']);
        expect((await atualizar(deps)).arquivosEscritos).toBe(0);
      }
    });

    it('"(*)" já gravada sai quando a publicação comum do mesmo ato chega depois', async () => {
      cfg.dou = { '2023-08-03': [lei('LEI Nº 14.642, DE 1º DE AGOSTO DE 2023 (*)', 'lei-n-14.642-de-1-de-agosto-de-2023-*-500470021')] };
      const deps = await novoDeps();
      await retroagir(deps, '2023-08-03', '2023-08-03');
      expect(await atos(deps)).toHaveLength(1);
      cfg.dou = { '2023-08-02': [lei('LEI Nº 14.642, DE 1º DE AGOSTO DE 2023', 'lei-n-14.642-de-1-de-agosto-de-2023-1')] };
      await retroagir(deps, '2023-08-02', '2023-08-02');
      expect((await atos(deps)).map((a) => `${a.data} ${a.titulo}`)).toEqual(['2023-08-02 LEI Nº 14.642, DE 1º DE AGOSTO DE 2023']);
    });

    it('duas "(*)" do mesmo ato sem publicação comum: fica só a primeira', async () => {
      cfg.dou = {
        '2026-07-28': [ato('DECRETO Nº 13.081, DE 27 DE JULHO DE 2026 (*)', 'decreto-n-13.081-de-27-de-julho-de-2026-*-1')],
        '2026-07-30': [ato('DECRETO Nº 13.081, DE 27 DE JULHO DE 2026 (*)', 'decreto-n-13.081-de-27-de-julho-de-2026-*-2')],
      };
      const deps = await novoDeps();
      await retroagir(deps, '2026-07-28', '2026-07-30');
      expect((await atos(deps)).map((a) => a.data)).toEqual(['2026-07-28']);
    });
  });

  describe('cada ato uma vez só (N1, N4, N7)', () => {
    const dec = (title: string, urlTitle: string, resumo: string) => ({
      title, urlTitle, artType: 'Decreto numerado', hierarchyStr: 'Atos do Poder Executivo', content: `${title} ${resumo}`,
    });
    const atos = async (deps: Deps) => (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'ato');
    const D11906 = 'DECRETO Nº 11.906, DE 30 DE JANEIRO DE 2024';

    it('Decreto 11.906: a retificação de 01/02/2024 (mesmo título, "(*)" só no corpo) não vira um segundo item', async () => {
      cfg.dou = {
        '2024-01-31': [dec(D11906, 'decreto-n-11.906-de-30-de-janeiro-de-2024-540569888', 'Altera o Decreto nº 11.830, de 14 de dezembro de 2023. O PRESIDENTE DA REPÚBLICA, no uso')],
        '2024-02-01': [dec(D11906, 'decreto-n-11.906-de-30-de-janeiro-de-2024-540637381', '(Publicado no DOU de 31/1/2024) ANEXO II (*) (Anexo II ao Decreto nº 11.830)')],
      };
      const deps = await novoDeps();
      let t = Date.parse('2024-01-31T15:00:00Z');
      deps.agora = () => new Date(t);
      await atualizar(deps);
      t += DIA_MS;
      await atualizar(deps);
      const r = await atos(deps);
      expect(r.map((a) => `${a.data} ${a.id}`)).toEqual(['2024-01-31 dou:decreto-n-11.906-de-30-de-janeiro-de-2024-540569888']);
      expect(r[0].ementa).toBe('Altera o Decreto nº 11.830, de 14 de dezembro de 2023.');
      expect(r[0].fontes.map((f) => f.url.split('-').pop())).toEqual(['540569888', '540637381']);
      t += 600_000;
      cfg.pedidos = [];
      expect((await atualizar(deps)).arquivosEscritos).toBe(0);
      expect(cfg.pedidos.filter((u) => u.includes('planalto.gov.br/ccivil_03'))).toEqual([]); // a cópia não é consultada de novo
    });

    it('a retificação coletada ANTES da publicação original (carga fora de ordem): fica a mais antiga', async () => {
      cfg.dou = { '2024-02-01': [dec(D11906, 'decreto-n-11.906-de-30-de-janeiro-de-2024-540637381', '(Publicado no DOU de 31/1/2024) ANEXO II (*)')] };
      const deps = await novoDeps();
      await retroagir(deps, '2024-02-01', '2024-02-01');
      cfg.dou = { '2024-01-31': [dec(D11906, 'decreto-n-11.906-de-30-de-janeiro-de-2024-540569888', 'Altera o Decreto nº 11.830. O PRESIDENTE DA REPÚBLICA, no uso')] };
      await retroagir(deps, '2024-01-31', '2024-01-31');
      const r = await atos(deps);
      expect(r.map((a) => a.data)).toEqual(['2024-01-31']);
      expect(r[0].ementa).toBe('Altera o Decreto nº 11.830.');
    });

    it('duplicata do mesmo dia que só aparece numa execução POSTERIOR (N4) é unida à linha já gravada', async () => {
      const mp = (n: string) => dec('MEDIDA PROVISÓRIA Nº 1.373, DE 29 DE JUNHO DE 2026', `medida-provisoria-n-1.373-de-29-de-junho-de-2026-${n}`, 'Dispõe sobre algo. O PRESIDENTE DA REPÚBLICA, no uso');
      cfg.dou = { '2026-06-29': [mp('715441349')] };
      const deps = await novoDeps();
      let t = Date.parse('2026-06-29T15:00:00Z');
      deps.agora = () => new Date(t);
      await atualizar(deps);
      cfg.dou = { '2026-06-29': [mp('715441349'), mp('715441341')] };
      t += 600_000;
      await atualizar(deps);
      const r = await atos(deps);
      expect(r).toHaveLength(1);
      expect(r[0].fontes.map((f) => f.url.split('-').pop()).sort()).toEqual(['715441341', '715441349']);
      t += 600_000;
      expect((await atualizar(deps)).arquivosEscritos).toBe(0);
    });

    it('Lei 14.535 (17/01/2023): a linha que fica tem ementa "(Publicada no DOU…)"; vale a ementa de verdade da outra (N7)', async () => {
      const lei = (t: string, u: string, resumo: string) => ({ ...dec(t, u, resumo), hierarchyStr: 'Atos do Poder Legislativo' });
      cfg.dou = { '2023-01-17': [
        lei('LEI Nº 14.535, DE 17 DE JANEIRO DE 2023', 'lei-n-14.535-de-17-de-janeiro-de-2023-458405520', '(Publicada no DOU de 17/1/2023, edição extra)'),
        lei('LEI Nº 14.535, DE 17 DE JANEIRO DE 2023 (*)', 'lei-n-14.535-de-17-de-janeiro-de-2023-*-458405010', 'Estima a receita e fixa a despesa da União para o exercício financeiro de 2023. O PRESIDENTE DA REPÚBLICA Faço saber'),
      ] };
      const deps = await novoDeps();
      deps.agora = () => new Date('2023-01-17T15:00:00Z');
      await atualizar(deps);
      const r = await atos(deps);
      expect(r.map((a) => a.titulo)).toEqual(['LEI Nº 14.535, DE 17 DE JANEIRO DE 2023']);
      expect(r[0].ementa).toBe('Estima a receita e fixa a despesa da União para o exercício financeiro de 2023.');
      expect((await atualizar(deps)).arquivosEscritos).toBe(0);
    });

    it('títulos diferentes com o mesmo número (erro do DOU: Decreto "11.430" de 3/3 e de 8/3/2023) continuam separados', async () => {
      cfg.dou = {
        '2023-03-03': [dec('DECRETO Nº 11.430, DE 3 DE MARÇO DE 2023', 'decreto-n-11.430-de-3-de-marco-de-2023-467657997', 'Dispõe sobre A.')],
        '2023-03-09': [dec('DECRETO Nº 11.430, DE 8 DE MARÇO DE 2023', 'decreto-n-11.430-de-8-de-marco-de-2023-468754527', 'Dispõe sobre B.')],
      };
      const deps = await novoDeps();
      await retroagir(deps, '2023-03-03', '2023-03-09');
      expect(await atos(deps)).toHaveLength(2);
    });
  });

  it('fonte que não responde: a coleta dela para depois de 2 falhas de rede seguidas; as outras fontes e o estado seguem (N5)', async () => {
    cfg.falhaAgenda = true;
    cfg.falhaDou = true;
    const deps = await novoDeps();
    const r = await atualizar(deps);
    expect(diasDeAgendaPedidos()).toHaveLength(2); // e não os 11 dias da janela
    expect(edicoesDouPedidas()).toHaveLength(2);
    const estado = await lerEstado(deps.dataDir);
    expect(estado.fontes.agenda.ok).toBe(false);
    expect(estado.fontes.agenda.mensagem).toContain('rede caiu');
    expect(estado.fontes.agenda.mensagem).toContain('coleta interrompida');
    expect(estado.fontes.dou.ok).toBe(false);
    expect(estado.fontes.planalto.ok).toBe(true);
    expect(estado.fontes['noticias-google'].ok).toBe(true);
    expect((await lerNoticias(deps.dataDir)).length).toBe(1);
    expect(r.arquivosEscritos).toBeGreaterThan(0);
  });

  it('falhas de rede isoladas (não seguidas) não interrompem a coleta (N5)', async () => {
    cfg.falhaAgendaDias = ['2025-03-07', '2025-03-09', '2025-03-11'];
    const deps = await novoDeps();
    await atualizar(deps);
    expect(diasDeAgendaPedidos()).toHaveLength(11);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.mensagem).not.toContain('coleta interrompida');
    expect((await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'agenda')).toHaveLength(2);
  });

  it('erro de conteúdo (layout, redirecionamento) em dias seguidos não é falha de rede: a coleta vai até o fim (N5)', async () => {
    cfg.redirecionaAgenda = 'https://gov.test/agenda-do-presidente-da-republica';
    const deps = await novoDeps();
    await atualizar(deps);
    expect(diasDeAgendaPedidos()).toHaveLength(11);
  });

  it('DOU com HTTP 404 é falha: dia sem edição responde 200 com lista vazia, nunca 404 (I2)', async () => {
    cfg.statusDou = 404;
    const deps = await novoDeps();
    await atualizar(deps);
    const estado = await lerEstado(deps.dataDir);
    expect(estado.fontes.dou.ok).toBe(false);
    expect(estado.fontes.dou.mensagem).toContain('HTTP 404');
    expect((await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'ato')).toHaveLength(0);
  });

  it('execução normal: agenda de -3 a +7 dias e DOU de ontem e hoje, nas duas edições (I3 não muda o caso comum)', async () => {
    const deps = await novoDeps();
    let t = Date.parse('2025-03-10T15:00:00Z');
    deps.agora = () => new Date(t);
    await atualizar(deps);
    cfg.pedidos = [];
    t += 600_000;
    const r = await atualizar(deps);
    expect(r.arquivosEscritos).toBe(0);
    expect(diasDeAgendaPedidos()).toEqual([
      '2025-03-07', '2025-03-08', '2025-03-09', '2025-03-10', '2025-03-11', '2025-03-12',
      '2025-03-13', '2025-03-14', '2025-03-15', '2025-03-16', '2025-03-17',
    ]);
    expect(edicoesDouPedidas()).toEqual(['09-03-2025 do1', '09-03-2025 do1e', '10-03-2025 do1', '10-03-2025 do1e']);
  });

  it('depois de 5 dias parado, recolhe o DOU e a agenda dos dias perdidos (I3)', async () => {
    cfg.dou['2025-03-12'] = [ato('DECRETO Nº 12.400, DE 11 DE MARÇO DE 2025', 'decreto-n-12.400-de-11-de-marco-de-2025-1')];
    cfg.agenda['2025-03-11'] = htmlAgenda([{ hora: '10h00', titulo: 'Compromisso do dia 11', local: 'Brasília - DF' }]);
    const deps = await novoDeps();
    let t = Date.parse('2025-03-10T15:00:00Z');
    deps.agora = () => new Date(t);
    await atualizar(deps);

    cfg.pedidos = [];
    t += 5 * DIA_MS; // 15/03: a última gravação foi em 10/03
    await atualizar(deps);
    expect(edicoesDouPedidas().filter((e) => e.endsWith(' do1'))).toEqual([
      '09-03-2025 do1', '10-03-2025 do1', '11-03-2025 do1', '12-03-2025 do1', '13-03-2025 do1', '14-03-2025 do1', '15-03-2025 do1',
    ]);
    expect(diasDeAgendaPedidos()[0]).toBe('2025-03-07');
    expect(diasDeAgendaPedidos().at(-1)).toBe('2025-03-22');
    const eventos = await lerEventos(deps.dataDir);
    expect(eventos.some((e) => e.titulo === 'DECRETO Nº 12.400, DE 11 DE MARÇO DE 2025')).toBe(true);
    expect(eventos.some((e) => e.titulo === 'Compromisso do dia 11')).toBe(true);
  });

  it('a recuperação volta no máximo 14 dias (I3)', async () => {
    const deps = await novoDeps();
    let t = Date.parse('2025-03-10T15:00:00Z');
    deps.agora = () => new Date(t);
    await atualizar(deps);
    cfg.pedidos = [];
    t += 40 * DIA_MS; // 19/04
    await atualizar(deps);
    expect(edicoesDouPedidas()[0]).toBe('05-04-2025 do1');
    expect(diasDeAgendaPedidos()[0]).toBe('2025-04-05');
  });

  it('DOU falhando há dias enquanto o resto funciona: ao voltar, recolhe desde a véspera da falha (I3)', async () => {
    cfg.dou['2025-03-12'] = [ato('DECRETO Nº 12.400, DE 11 DE MARÇO DE 2025', 'decreto-n-12.400-de-11-de-marco-de-2025-1')];
    const deps = await novoDeps();
    let t = Date.parse('2025-03-10T15:00:00Z');
    deps.agora = () => new Date(t);
    await atualizar(deps);

    cfg.falhaDou = true;
    for (const dia of ['11', '12', '13', '14']) {
      t += DIA_MS;
      // a agenda segue mudando: há gravação todo dia, então "última novidade" não denuncia o buraco do DOU
      cfg.agenda[`2025-03-${dia}`] = htmlAgenda([{ hora: '10h00', titulo: `Compromisso do dia ${dia}`, local: 'Brasília - DF' }]);
      await atualizar(deps);
    }
    expect((await lerEstado(deps.dataDir)).fontes.dou.ok).toBe(false);

    cfg.falhaDou = false;
    cfg.pedidos = [];
    t += DIA_MS; // 15/03
    await atualizar(deps);
    expect(edicoesDouPedidas()[0]).toBe('10-03-2025 do1');
    expect((await lerEstado(deps.dataDir)).fontes.dou.ok).toBe(true);
    expect((await lerEventos(deps.dataDir)).some((e) => e.titulo === 'DECRETO Nº 12.400, DE 11 DE MARÇO DE 2025')).toBe(true);
  });

  it('troca de mandato: cada dia da janela usa a agenda do mandato que o cobre (I7)', async () => {
    const A: Mandato = { ...MANDATO, fim: '2026-12-31', agendaBase: 'https://gov.test/a/agenda-do-presidente-da-republica' };
    const B: Mandato = { presidente: 'Fulana de Tal', nomes: ['Fulana'], inicio: '2027-01-01', fim: null, agendaBase: 'https://gov.test/b/agenda-do-presidente-da-republica' };
    const deps = await novoDeps();
    deps.mandatos = [A, B];
    deps.agora = () => new Date('2027-01-02T15:00:00Z');
    await atualizar(deps);
    const agenda = cfg.pedidos.filter((u) => u.includes('/agenda-do-presidente-da-republica/'));
    expect(agenda.filter((u) => u.includes('/a/')).map((u) => u.slice(-10))).toEqual(['2026-12-30', '2026-12-31']);
    expect(agenda.filter((u) => u.includes('/b/')).map((u) => u.slice(-10))[0]).toBe('2027-01-01');
    expect(agenda).toHaveLength(11);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(true);
  });

  it('fim de mandato: dias da janela que nenhum mandato cobre são pulados, sem erro (I7)', async () => {
    const deps = await novoDeps();
    deps.mandatos = [{ ...MANDATO, fim: '2026-12-31' }];
    deps.agora = () => new Date('2026-12-29T15:00:00Z');
    await atualizar(deps);
    expect(diasDeAgendaPedidos()).toEqual(['2026-12-26', '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31']);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(true);
  });

  it('sem mandato para hoje a atualização falha com instrução clara, em vez de coletar com a base errada (I7)', async () => {
    const deps = await novoDeps();
    deps.mandatos = [{ ...MANDATO, fim: '2026-12-31' }];
    deps.agora = () => new Date('2027-01-01T15:00:00Z');
    await expect(atualizar(deps)).rejects.toThrow(/config\/mandatos\.json/);
    expect(cfg.pedidos).toEqual([]);
  });

  it('dia com 200 em que um compromisso sumiu o marca como removido', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    cfg.agenda = { [HOJE]: htmlAgenda([{ hora: '09h00', titulo: 'Reunião A', local: 'Palácio do Planalto' }]) };
    await atualizar(deps);
    const removido = (await lerEventos(deps.dataDir)).find((e) => e.titulo === 'Visita ao hospital')!;
    expect(removido.status).toBe('removido');
  });

  it('layout inesperado da agenda é falha, não "dia vazio": nada é removido', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    cfg.agenda = { [HOJE]: '<html><head><title>Agenda do Presidente da República — Planalto</title></head><body>novo layout</body></html>' };
    await atualizar(deps);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(false);
    const agenda = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'agenda');
    expect(agenda.every((e) => !e.removidoEm)).toBe(true);
  });

  it('redirecionamento da agenda para outra página não vira compromisso do dia nem remove nada', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    const antes = await lerEventos(deps.dataDir);

    // Hoje passa a redirecionar para a raiz da agenda, que responde 200 com outro conteúdo.
    cfg.redirecionaAgenda = 'https://gov.test/agenda-do-presidente-da-republica';
    cfg.agenda = { [HOJE]: htmlAgenda([{ hora: '08h00', titulo: 'Compromisso de outro dia', local: 'Outro lugar' }]) };
    await atualizar(deps);

    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(false);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.mensagem).toContain('Redirecionamento inesperado');
    expect(await lerEventos(deps.dataDir)).toEqual(antes);
  });

  it('redirecionamento do DOU para outra edição não grava atos e marca a fonte como falha', async () => {
    cfg.redirecionaDou = 'https://www.in.gov.br/leiturajornal?data=09-03-2025&secao=do1';
    const deps = await novoDeps();
    await atualizar(deps);
    expect((await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'ato')).toHaveLength(0);
    const estado = await lerEstado(deps.dataDir);
    expect(estado.fontes.dou.ok).toBe(false);
    expect(estado.fontes.dou.mensagem).toContain('Redirecionamento inesperado');
  });

  it('fonte que segue falhando com textos de erro diferentes não reescreve o estado', async () => {
    const deps = await novoDeps();
    let t = Date.parse('2025-03-10T15:00:00Z');
    deps.agora = () => new Date(t);
    await atualizar(deps);

    cfg.falhaAgenda = true;
    cfg.mensagemFalha = 'rede caiu A';
    t += 600_000;
    await atualizar(deps);
    const arquivo = join(deps.dataDir, 'status.json');
    const bytes = await readFile(arquivo, 'utf8');
    const { desde, mensagem } = (await lerEstado(deps.dataDir)).fontes.agenda;
    expect(mensagem).toContain('rede caiu A');

    t += 5 * 3_600_000 + 50 * 60_000; // a falha passa a contar como persistente na volta seguinte
    for (const texto of ['rede caiu B', 'HTTP 502', 'HTTP 503']) {
      cfg.mensagemFalha = texto;
      t += 600_000;
      const r = await atualizar(deps);
      expect(r.arquivosEscritos).toBe(0);
      expect(r.falhasPersistentes).toEqual(['agenda']);
      expect(await readFile(arquivo, 'utf8')).toBe(bytes);
      expect((await lerEstado(deps.dataDir)).fontes.agenda).toEqual({ ok: false, desde, mensagem });
    }
  });

  it('recuperar e voltar a falhar ainda é uma transição de estado', async () => {
    const deps = await novoDeps();
    let t = Date.parse('2025-03-10T15:00:00Z');
    deps.agora = () => new Date(t);
    await atualizar(deps);
    const desdeOk = (await lerEstado(deps.dataDir)).fontes.agenda.desde;

    cfg.falhaAgenda = true;
    t += 600_000;
    await atualizar(deps);
    const falha1 = (await lerEstado(deps.dataDir)).fontes.agenda;
    expect(falha1.ok).toBe(false);
    expect(falha1.desde).not.toBe(desdeOk);

    cfg.falhaAgenda = false;
    t += 600_000;
    await atualizar(deps);
    const ok2 = (await lerEstado(deps.dataDir)).fontes.agenda;
    expect(ok2.ok).toBe(true);
    expect(ok2.desde).not.toBe(falha1.desde);

    cfg.falhaAgenda = true;
    cfg.mensagemFalha = 'outra falha';
    t += 600_000;
    await atualizar(deps);
    const falha2 = (await lerEstado(deps.dataDir)).fontes.agenda;
    expect(falha2.ok).toBe(false);
    expect(falha2.desde).not.toBe(ok2.desde);
    expect(falha2.mensagem).toContain('outra falha');
  });
});

describe('retroagir', () => {
  it('percorre o intervalo, grava e devolve os dias com falha', async () => {
    const deps = await novoDeps();
    const progresso: string[] = [];
    const falhas = await retroagir(deps, '2025-03-09', '2025-03-10', (d) => progresso.push(d));
    expect(falhas).toEqual([]);
    expect(progresso).toEqual(['2025-03-10']);
    const eventos = await lerEventos(deps.dataDir);
    expect(eventos.filter((e) => e.tipo === 'agenda')).toHaveLength(2);
    expect(eventos.filter((e) => e.tipo === 'ato')).toHaveLength(1);
  });
  it('dia de página não pública (login) não conta como falha e a carga segue', async () => {
    cfg.loginAgenda = ['2025-03-09'];
    const deps = await novoDeps();
    const falhas = await retroagir(deps, '2025-03-09', '2025-03-10');
    expect(falhas).toEqual([]);
    expect((await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'agenda')).toHaveLength(2);
  });
  it('dois dias seguidos pedindo login na carga histórica são reportados como falha (I1)', async () => {
    cfg.loginAgenda = ['2025-03-07', '2025-03-08'];
    const deps = await novoDeps();
    const falhas = await retroagir(deps, '2025-03-06', '2025-03-10');
    expect(falhas).toEqual(['2025-03-07', '2025-03-08']);
  });
  it('dias de login separados por um dia normal não são falha na carga histórica (I1)', async () => {
    cfg.loginAgenda = ['2025-03-07', '2025-03-09'];
    const deps = await novoDeps();
    expect(await retroagir(deps, '2025-03-06', '2025-03-10')).toEqual([]);
  });
  it('falha de um dia é reportada e não interrompe os demais', async () => {
    cfg.falhaAgenda = true;
    const deps = await novoDeps();
    const falhas = await retroagir(deps, '2025-03-09', '2025-03-10');
    expect(falhas).toEqual(['2025-03-09', '2025-03-10']);
  });
});
