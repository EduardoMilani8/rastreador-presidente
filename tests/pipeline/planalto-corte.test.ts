import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { URL_AGENCIA_BRASIL } from '../../src/collectors/noticias';
import { INICIO_PAGINA_PLANALTO, URL_PAGINA_PLANALTO } from '../../src/collectors/planalto';
import { atualizar } from '../../src/pipeline/run';
import { lerEstado, lerEventos } from '../../src/pipeline/store';
import type { Mandato } from '../../src/shared/schema';
import { PAGINA_404, htmlDou, rssGoogle, rssVazio } from '../helpers';

const PAGINA = readFileSync(resolve(process.cwd(), 'tests/fixtures/planalto/noticias-2026-10-27.html'), 'utf8');
const MANDATO: Mandato = {
  presidente: 'Luiz Inácio Lula da Silva', nomes: ['Lula'], inicio: '2023-01-01', fim: null,
  agendaBase: 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/agenda-do-presidente-da-republica-lula/agenda-do-presidente-da-republica',
};

async function buscar(url: string) {
  if (url === URL_PAGINA_PLANALTO) return { status: 200, corpo: PAGINA, url };
  if (url.includes('/agenda-do-presidente-da-republica/')) return { status: 404, corpo: PAGINA_404, url };
  if (url.includes('leiturajornal')) return { status: 200, corpo: htmlDou([]), url };
  if (url.startsWith('https://news.google.com')) return { status: 200, corpo: rssGoogle(), url };
  if (url === URL_AGENCIA_BRASIL) return { status: 200, corpo: rssVazio(), url };
  throw new Error(`URL inesperada no teste: ${url}`);
}

describe('troca do feed pela página de notícias do Planalto (página real de 27/10/2026)', () => {
  it(`só entram notícias a partir de ${INICIO_PAGINA_PLANALTO}: as de antes repetiriam eventos já gravados pelo feed`, async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'rp-corte-'));
    await atualizar({ buscar, agora: () => new Date('2026-10-28T12:00:00Z'), dataDir, mandatos: [MANDATO] });

    const comunicados = (await lerEventos(dataDir)).filter((e) => e.tipo === 'comunicado');
    expect(comunicados.length).toBeGreaterThan(0);
    expect(comunicados.every((c) => c.data >= INICIO_PAGINA_PLANALTO)).toBe(true);
    const ids = comunicados.map((c) => c.id);
    // Notícia de 24/09 sobre a visita à BR-116, que o aviso de pauta do feed já registrou em 23/09.
    expect(ids).not.toContain('planalto:presidente-lula-visita-obras-da-br-116-em-nova-iguacu-rj');
    expect(ids).toContain(
      'planalto:lula-sanciona-lei-que-amplia-beneficios-para-meis-e-envia-ao-congresso-pec-sobre-tarifa-zero-no-transporte-coletivo',
    );
    expect((await lerEstado(dataDir)).fontes.planalto.ok).toBe(true);
  });
});
