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
  DECRETO_DOU, PAGINA_404, htmlAgenda, htmlDou, rdfPlanalto, rssGoogle, rssVazio,
} from '../helpers';

const MANDATO: Mandato = {
  presidente: 'Luiz Inácio Lula da Silva', nomes: ['Lula'], inicio: '2023-01-01', fim: null,
  agendaBase: 'https://gov.test/agenda-do-presidente-da-republica',
};
const HOJE = '2025-03-10';

const cfg = {
  agenda: {} as Record<string, string>, // data -> html (200). Ausente => 404.
  falhaAgenda: false,
  mensagemFalha: 'rede caiu',
  redirecionaAgenda: null as string | null, // URL final devolvida para as páginas de agenda
  redirecionaDou: null as string | null, // URL final devolvida para as edições do DOU
  comunicados: rdfPlanalto([]),
  textoPlanalto: 404,
  extraDou: [] as object[], // itens da edição extra do DOU (secao=do1e) em HOJE
  falhaExtraDou: false,
};

const MP_EXTRA = {
  title: 'MEDIDA PROVISÓRIA Nº 1.157, DE 1º DE JANEIRO DE 2023', urlTitle: 'medida-provisoria-n-1.157-de-1-de-janeiro-de-2023-1',
  artType: 'Medida provisória', hierarchyStr: 'Atos do Poder Executivo',
  content: 'MEDIDA PROVISÓRIA Nº 1.157, DE 1º DE JANEIRO DE 2023 Dispõe sobre algo. O PRESIDENTE DA REPÚBLICA, no uso',
};

async function buscar(url: string) {
  if (url.includes('/agenda-do-presidente-da-republica/')) {
    if (cfg.falhaAgenda) throw new Error(cfg.mensagemFalha);
    const corpo = cfg.agenda[url.slice(-10)];
    const final = cfg.redirecionaAgenda ?? url;
    return corpo ? { status: 200, corpo, url: final } : { status: 404, corpo: PAGINA_404, url: final };
  }
  if (url.includes('leiturajornal')) {
    const comDecreto = url.includes('data=10-03-2025');
    if (url.includes('secao=do1e')) {
      if (cfg.falhaExtraDou) throw new Error('rede caiu na edição extra');
      return { status: 200, corpo: htmlDou(comDecreto ? cfg.extraDou : []), url: cfg.redirecionaDou ?? url };
    }
    return { status: 200, corpo: htmlDou(comDecreto ? [DECRETO_DOU] : []), url: cfg.redirecionaDou ?? url };
  }
  if (url === URL_FEED_PLANALTO) return { status: 200, corpo: cfg.comunicados, url };
  if (url.startsWith('https://news.google.com')) return { status: 200, corpo: rssGoogle(), url };
  if (url === URL_AGENCIA_BRASIL) return { status: 200, corpo: rssVazio(), url };
  if (url.includes('planalto.gov.br/ccivil_03')) return { status: cfg.textoPlanalto, corpo: '', url };
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
  cfg.mensagemFalha = 'rede caiu';
  cfg.redirecionaAgenda = null;
  cfg.redirecionaDou = null;
  cfg.comunicados = rdfPlanalto([]);
  cfg.textoPlanalto = 404;
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

  it('coleta também a edição extra do DOU (MP publicada em edição extra não pode sumir)', async () => {
    cfg.extraDou = [MP_EXTRA];
    const deps = await novoDeps();
    await atualizar(deps);
    const atos = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'ato');
    expect(atos.map((a) => a.titulo).sort()).toEqual([
      'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026', 'MEDIDA PROVISÓRIA Nº 1.157, DE 1º DE JANEIRO DE 2023',
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

  it('adiciona o texto do ato no Planalto só quando a URL responde 200', async () => {
    cfg.textoPlanalto = 200;
    const deps = await novoDeps();
    await atualizar(deps);
    const ato = (await lerEventos(deps.dataDir)).find((e) => e.tipo === 'ato')!;
    expect(ato.fontes.map((f) => f.nome)).toEqual(['dou', 'texto-planalto']);
    expect(ato.fontes[1].url).toContain('/decreto/D13132.htm');
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

  it('fonte fora do ar: mantém os dados, registra ok:false, e só vira falha persistente na 2ª seguida', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    const antes = await lerEventos(deps.dataDir);

    cfg.falhaAgenda = true;
    const r2 = await atualizar(deps);
    expect(r2.falhasPersistentes).toEqual([]);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(false);
    expect(await lerEventos(deps.dataDir)).toEqual(antes);

    const r3 = await atualizar(deps);
    expect(r3.falhasPersistentes).toEqual(['agenda']);
    expect(r3.arquivosEscritos).toBe(0); // estado idêntico não gera commit

    cfg.falhaAgenda = false;
    await atualizar(deps);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(true);
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
  it('falha de um dia é reportada e não interrompe os demais', async () => {
    cfg.falhaAgenda = true;
    const deps = await novoDeps();
    const falhas = await retroagir(deps, '2025-03-09', '2025-03-10');
    expect(falhas).toEqual(['2025-03-09', '2025-03-10']);
  });
});
