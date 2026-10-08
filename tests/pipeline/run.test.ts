import { mkdtemp } from 'node:fs/promises';
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
  comunicados: rdfPlanalto([]),
  textoPlanalto: 404,
};

async function buscar(url: string) {
  if (url.includes('/agenda-do-presidente-da-republica/')) {
    if (cfg.falhaAgenda) throw new Error('rede caiu');
    const corpo = cfg.agenda[url.slice(-10)];
    return corpo ? { status: 200, corpo, url } : { status: 404, corpo: PAGINA_404, url };
  }
  if (url.includes('leiturajornal')) {
    const comDecreto = url.includes('data=10-03-2025');
    return { status: 200, corpo: htmlDou(comDecreto ? [DECRETO_DOU] : []), url };
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
  cfg.comunicados = rdfPlanalto([]);
  cfg.textoPlanalto = 404;
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

  it('adiciona o texto do ato no Planalto só quando a URL responde 200', async () => {
    cfg.textoPlanalto = 200;
    const deps = await novoDeps();
    await atualizar(deps);
    const ato = (await lerEventos(deps.dataDir)).find((e) => e.tipo === 'ato')!;
    expect(ato.fontes.map((f) => f.nome)).toEqual(['dou', 'texto-planalto']);
    expect(ato.fontes[1].url).toContain('/decreto/D13132.htm');
  });

  it('comunicado que casa com o compromisso (data + local) o marca como realizado', async () => {
    cfg.comunicados = rdfPlanalto([
      { slug: 'visita-barretos', titulo: 'Presidente visita o hospital, em Barretos (SP)', data: '2025-03-10T18:00:00-03:00' },
    ]);
    const deps = await novoDeps();
    await atualizar(deps);
    const eventos = await lerEventos(deps.dataDir);
    const visita = eventos.find((e) => e.titulo === 'Visita ao hospital')!;
    expect(visita.status).toBe('realizado');
    expect(visita.fontes).toHaveLength(2);
    expect(eventos.some((e) => e.tipo === 'comunicado')).toBe(false);
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
