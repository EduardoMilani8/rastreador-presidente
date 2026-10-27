import { describe, expect, it } from 'vitest';
import { carregarMandatos } from '../../src/config';
import { carregarAgencias, carregarChecagens, montarFalas } from '../../src/pipeline/falas';
import { FalaChecadaSchema, type Agencia, type Checagem, type Mandato } from '../../src/shared/schema';
import { dataSaoPaulo } from '../../src/shared/text';

const AGENCIAS: Agencia[] = [
  { id: 'aos-fatos', nome: 'Aos Fatos', prefixos: ['https://www.aosfatos.org/noticias/'] },
  { id: 'afp-checamos', nome: 'AFP Checamos', prefixos: ['https://checamos.afp.com/'] },
];
const MANDATOS: Mandato[] = [{
  presidente: 'Fulano', nomes: ['Fulano'], inicio: '2023-01-01', fim: '2027-01-04', agendaBase: 'https://www.gov.br/x',
}];
const HOJE = '2026-10-27';

const checagem = (extra: Partial<Checagem> = {}): Checagem => ({
  id: '2026-03-12-aos-fatos-entrevista',
  data: '2026-03-12',
  tipo: 'entrevista',
  evento: 'Entrevista a uma rádio',
  agencia: 'aos-fatos',
  titulo: 'Checamos a entrevista',
  url: 'https://www.aosfatos.org/noticias/checamos-entrevista/',
  publicadaEm: '2026-03-13',
  ...extra,
});

const erroDe = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return String(e);
  }
  throw new Error('deveria ter lançado');
};

describe('carregarChecagens: o esquema de cada checagem', () => {
  it('aceita uma checagem completa, com vereditos e errata', () => {
    const c = checagem({
      vereditos: [{ rotulo: 'Falso', frases: 3 }, { rotulo: 'Verdadeiro', frases: 5 }],
      errata: { data: '2026-03-14', texto: 'A matéria corrigiu o número de frases.' },
    });
    expect(carregarChecagens([c])).toEqual([c]);
  });

  it.each([
    ['url http', { url: 'http://www.aosfatos.org/noticias/x/' }],
    ['url javascript:', { url: 'javascript:alert(1)' }],
    ['tipo desconhecido', { tipo: 'live' }],
    ['id que não começa pela data da fala', { id: '2026-03-11-aos-fatos-entrevista' }],
    ['id com maiúscula', { id: '2026-03-12-Aos-Fatos' }],
    ['id só com a data', { id: '2026-03-12' }],
    ['checagem publicada antes da fala', { publicadaEm: '2026-03-11' }],
    ['evento vazio', { evento: '   ' }],
    ['título longo demais', { titulo: 'x'.repeat(301) }],
    ['veredito sem frases', { vereditos: [{ rotulo: 'Falso', frases: 0 }] }],
    ['lista de vereditos vazia', { vereditos: [] }],
    ['errata anterior à checagem', { errata: { data: '2026-03-12', texto: 'x' } }],
    ['campo desconhecido', { nota: 'verdadeiro' }],
    ['data impossível no formato', { data: '12/03/2026' }],
  ])('recusa %s', (_nome, extra) => {
    expect(() => carregarChecagens([checagem(extra as Partial<Checagem>)])).toThrow();
  });

  it('recusa corpo que não é lista', () => {
    expect(() => carregarChecagens({})).toThrow();
  });
});

describe('carregarAgencias', () => {
  it('aceita a tabela de exemplo', () => {
    expect(carregarAgencias(AGENCIAS)).toEqual(AGENCIAS);
  });

  it('recusa id repetido, prefixo http e prefixo sem barra no fim', () => {
    expect(erroDe(() => carregarAgencias([...AGENCIAS, AGENCIAS[0]]))).toMatch(/id repetido \(aos-fatos\)/);
    expect(() => carregarAgencias([{ ...AGENCIAS[0], prefixos: ['http://www.aosfatos.org/noticias/'] }])).toThrow();
    // sem a barra, "https://checamos.afp.com" aceitaria "https://checamos.afp.com.golpe.example/"
    expect(() => carregarAgencias([{ ...AGENCIAS[1], prefixos: ['https://checamos.afp.com'] }])).toThrow();
  });
});

describe('montarFalas: regras entre as tabelas', () => {
  const montar = (lista: Checagem[], hoje = HOJE) => montarFalas(lista, AGENCIAS, MANDATOS, hoje);

  it('acrescenta o nome da agência e ordena da fala mais recente à mais antiga', () => {
    const a = checagem();
    const b = checagem({
      id: '2026-05-02-afp-discurso', data: '2026-05-02', agencia: 'afp-checamos', tipo: 'discurso',
      url: 'https://checamos.afp.com/doc.afp.com.ABC123', publicadaEm: '2026-05-03',
    });
    const falas = montar([a, b]);
    expect(falas.map((f) => [f.id, f.agenciaNome])).toEqual([
      ['2026-05-02-afp-discurso', 'AFP Checamos'], ['2026-03-12-aos-fatos-entrevista', 'Aos Fatos'],
    ]);
    for (const f of falas) expect(FalaChecadaSchema.parse(f)).toEqual(f);
  });

  it('a ordem não depende da ordem da tabela', () => {
    const lista = [
      checagem({ id: '2026-03-12-a', url: 'https://www.aosfatos.org/noticias/a/' }),
      checagem({ id: '2026-03-12-b', url: 'https://www.aosfatos.org/noticias/b/', publicadaEm: '2026-03-20' }),
      checagem({ id: '2026-03-12-c', url: 'https://www.aosfatos.org/noticias/c/' }),
    ];
    const ids = montar(lista).map((f) => f.id);
    expect(montar([...lista].reverse()).map((f) => f.id)).toEqual(ids);
    expect(ids).toEqual(['2026-03-12-b', '2026-03-12-a', '2026-03-12-c']);
  });

  it('tabela vazia dá lista vazia', () => {
    expect(montar([])).toEqual([]);
  });

  it('recusa agência que não está na tabela de agências', () => {
    expect(erroDe(() => montar([checagem({ agencia: 'lupa' })]))).toMatch(/agência desconhecida \(lupa\)/);
  });

  it.each([
    ['de outro site', 'https://www.exemplo.com/noticias/checamos/'],
    ['de outra seção do mesmo site', 'https://www.aosfatos.org/outra/coisa/'],
    ['que imita o domínio com usuário na URL', 'https://www.aosfatos.org@golpe.example/noticias/x/'],
    ['que imita o domínio com sufixo', 'https://www.aosfatos.org.golpe.example/noticias/x/'],
    ['que sai do prefixo com ../', 'https://www.aosfatos.org/noticias/../outra/'],
  ])('recusa URL %s', (_nome, url) => {
    expect(erroDe(() => montar([checagem({ url })]))).toMatch(/não é um endereço da agência Aos Fatos/);
  });

  it('recusa id ou URL repetidos', () => {
    const a = checagem();
    expect(erroDe(() => montar([a, { ...a, url: 'https://www.aosfatos.org/noticias/outra/' }]))).toMatch(/id repetido/);
    expect(erroDe(() => montar([a, { ...a, id: '2026-03-12-outra' }]))).toMatch(/URL repetida/);
  });

  it('recusa fala fora de qualquer mandato e datas no futuro', () => {
    expect(erroDe(() => montar([checagem({ id: '2022-12-30-x', data: '2022-12-30', publicadaEm: '2022-12-31' })])))
      .toMatch(/fora dos mandatos/);
    expect(erroDe(() => montar([checagem()], '2026-03-12'))).toMatch(/publicada depois de hoje/);
    expect(erroDe(() => montar([checagem({ id: '2026-11-01-x', data: '2026-11-01', publicadaEm: '2026-11-01' })])))
      .toMatch(/fala depois de hoje/);
  });

  it('junta todos os problemas numa mensagem só, com o id de cada um', () => {
    const msg = erroDe(() => montar([checagem({ agencia: 'lupa' }), checagem({ id: '2026-03-12-b', url: 'https://x.example/' })]));
    expect(msg).toContain('config/checagens.json');
    expect(msg).toContain('2026-03-12-aos-fatos-entrevista');
    expect(msg).toContain('2026-03-12-b');
  });
});

describe('tabelas reais em config/', () => {
  it('config/agencias.json é válida e só tem as agências verificadas da spec', () => {
    const agencias = carregarAgencias();
    expect(agencias.map((a) => a.nome)).toEqual(['Aos Fatos', 'Estadão Verifica', 'AFP Checamos']);
  });

  it('config/checagens.json é válida contra as agências e os mandatos reais', async () => {
    const mandatos = await carregarMandatos();
    expect(() => montarFalas(carregarChecagens(), carregarAgencias(), mandatos, dataSaoPaulo(new Date()))).not.toThrow();
  });
});
