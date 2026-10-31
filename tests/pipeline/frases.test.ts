import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFactcheck, type ChecagemBruta } from '../../src/collectors/factcheck';
import { carregarMandatos } from '../../src/config';
import { carregarAgencias } from '../../src/pipeline/falas';
import {
  aceitarFrases, carregarExclusoes, dominioDaAgencia, idFrase, mesclarFrases, nomesAceitos,
} from '../../src/pipeline/frases';
import { FraseChecadaSchema, type FraseChecada } from '../../src/shared/schema';

const fixture = (nome: string) => parseFactcheck(readFileSync(`tests/fixtures/factcheck/${nome}`, 'utf8')).itens;
const AGENCIAS = carregarAgencias();
const MANDATOS = await carregarMandatos();
const HOJE = '2026-10-28';
const COLETADO = '2026-10-28T12:00:00.000Z';
const aceitar = (brutas: ChecagemBruta[], extra: { hoje?: string; exclusoes?: Set<string> } = {}) =>
  aceitarFrases(brutas, { agencias: AGENCIAS, mandatos: MANDATOS, hoje: extra.hoje ?? HOJE, exclusoes: extra.exclusoes ?? new Set(), coletadoEm: COLETADO });

// Item real do Aos Fatos (28/10/2026), base dos casos sintéticos.
const FLOW = fixture('todas-2026-10-28.json')[1];

describe('aceitarFrases com respostas reais de 28/10/2026', () => {
  it('da busca sem filtro, só a frase que o Aos Fatos atribui ao presidente entra', () => {
    const frases = aceitar(fixture('todas-2026-10-28.json'));
    expect(frases).toEqual([{
      id: idFrase('aos-fatos', FLOW.url, FLOW.frase),
      frase: 'Um senador da República que tem coragem de assinar uma petição defendendo o assassino de uma criança de cinco anos de idade',
      data: '2026-10-01',
      agencia: 'aos-fatos',
      agenciaNome: 'Aos Fatos',
      veredito: 'não_é_bem_assim',
      url: 'https://www.aosfatos.org/noticias/checamos-entrevista-lula-ao-flow/',
      titulo: 'Checamos a entrevista de Lula ao Flow',
      publicadaEm: '2026-10-01',
      coletadoEm: COLETADO,
    }]);
    for (const f of frases) expect(FraseChecadaSchema.parse(f)).toEqual(f);
  });

  it('boatos do Estadão (inclusive "Lula disse que..." com autor uniaopatriotabrasil) ficam de fora', () => {
    expect(aceitar(fixture('estadao-2026-10-28.json'))).toEqual([]);
  });

  it('"Lula Flávio Bolsonaro" (AFP, resumo do debate) fica de fora: o autor precisa ser igual, não conter', () => {
    const afp = fixture('todas-2026-10-28.json')[0];
    expect(afp.autor).toBe('Lula Flávio Bolsonaro');
    expect(aceitar([afp])).toEqual([]);
  });

  it('agência fora da lista (UOL) fica de fora mesmo com autor do presidente', () => {
    const uol = { ...fixture('todas-2026-10-28.json')[3], autor: 'Lula', dataFrase: '2026-10-27T00:00:00Z' };
    expect(aceitar([uol])).toEqual([]);
  });
});

describe('aceitarFrases: regras', () => {
  it.each(['Lula', 'LULA', ' lula ', 'Luiz Inácio Lula da Silva', 'luiz inacio lula da silva', 'Presidente Lula', 'presidente Luiz Inácio Lula da Silva'])(
    'aceita o autor "%s"', (autor) => {
      expect(aceitar([{ ...FLOW, autor }])).toHaveLength(1);
    });

  it.each(['Lula Flávio Bolsonaro', 'Lula e Alckmin', 'ex-presidente Lula', 'desinformação', 'Várias fontes', '', undefined])(
    'recusa o autor "%s"', (autor) => {
      expect(aceitar([{ ...FLOW, autor }])).toEqual([]);
    });

  it.each([
    ['frase só com "/" (caso real do Aos Fatos)', { frase: '/' }],
    ['frase curta demais', { frase: 'Não sei.' }],
    ['frase sem letra', { frase: '123 456 789 012 345' }],
    ['frase longa demais', { frase: 'a'.repeat(1001) }],
    ['veredito vazio', { veredito: '   ' }],
    ['veredito longo demais', { veredito: 'x'.repeat(61) }],
    ['URL de outra seção do site da agência', { url: 'https://www.aosfatos.org/outra/coisa/' }],
    ['URL que imita a agência com usuário', { url: 'https://www.aosfatos.org@golpe.example/noticias/x/' }],
    ['URL http', { url: 'http://www.aosfatos.org/noticias/x/' }],
    ['frase no futuro', { dataFrase: '2026-10-29T00:00:00Z', dataChecagem: '2026-10-29T00:00:00Z' }],
    ['checagem no futuro', { dataChecagem: '2026-11-02T00:00:00Z' }],
    ['frase antes de qualquer mandato configurado', { dataFrase: '2022-12-31T00:00:00Z' }],
    ['sem nenhuma data', { dataFrase: undefined, dataChecagem: undefined }],
    ['data que não é data', { dataFrase: 'ontem', dataChecagem: 'ontem' }],
  ])('recusa %s, sem derrubar os outros itens', (_nome, extra) => {
    const ruim = { ...FLOW, ...extra } as ChecagemBruta;
    expect(aceitar([ruim, FLOW]).map((f) => f.frase)).toEqual([FLOW.frase]);
  });

  it('sem data da checagem (como no Estadão), usa a data da frase; sem data da frase, usa a da checagem', () => {
    expect(aceitar([{ ...FLOW, dataChecagem: undefined }])[0]).toMatchObject({ data: '2026-10-01', publicadaEm: '2026-10-01' });
    expect(aceitar([{ ...FLOW, dataFrase: undefined, dataChecagem: '2026-10-02T23:00:00Z' }])[0])
      .toMatchObject({ data: '2026-10-02', publicadaEm: '2026-10-02' });
  });

  it('a data é a que a agência escreveu (meia-noite UTC não vira o dia anterior)', () => {
    expect(aceitar([FLOW])[0].data).toBe('2026-10-01');
  });

  it('limpa espaços da frase, do veredito e do título', () => {
    const f = aceitar([{ ...FLOW, frase: `  ${FLOW.frase}\n `, veredito: ' falso ', titulo: '  Título  da checagem ' }])[0];
    expect([f.frase, f.veredito, f.titulo]).toEqual([FLOW.frase, 'falso', 'Título da checagem']);
  });

  it('título vazio ou longo demais é omitido, sem descartar a frase', () => {
    expect(aceitar([{ ...FLOW, titulo: '  ' }])[0].titulo).toBeUndefined();
    expect(aceitar([{ ...FLOW, titulo: 't'.repeat(301) }])[0].titulo).toBeUndefined();
  });

  it('mesma frase na mesma checagem (veio em duas buscas) entra uma vez', () => {
    expect(aceitar([FLOW, { ...FLOW }])).toHaveLength(1);
  });

  it('item excluído à mão não entra', () => {
    const id = idFrase('aos-fatos', FLOW.url, FLOW.frase);
    expect(aceitar([FLOW], { exclusoes: new Set([id]) })).toEqual([]);
  });
});

describe('idFrase', () => {
  it('é estável e não muda com espaços ou caixa da frase', () => {
    const a = idFrase('aos-fatos', FLOW.url, FLOW.frase);
    expect(a).toMatch(/^aos-fatos-[0-9a-f]{12}$/);
    expect(idFrase('aos-fatos', FLOW.url, `  ${FLOW.frase.toUpperCase()} `)).toBe(a);
    expect(idFrase('aos-fatos', 'https://www.aosfatos.org/noticias/outra/', FLOW.frase)).not.toBe(a);
  });
});

describe('mesclarFrases', () => {
  const base = aceitar([FLOW])[0];
  const outra: FraseChecada = { ...base, id: 'aos-fatos-000000000001', frase: 'Outra frase checada pela agência', publicadaEm: '2026-10-05', data: '2026-10-05' };

  it('acumula: o que a API deixou de devolver continua; o novo entra; da checagem mais recente à mais antiga', () => {
    expect(mesclarFrases([base], [outra], new Set()).map((f) => f.id)).toEqual([outra.id, base.id]);
    expect(mesclarFrases([base, outra], [], new Set())).toHaveLength(2);
  });

  it('item já gravado não é reescrito (nem a data de coleta), para não gerar commit sem novidade', () => {
    const deNovo = { ...base, coletadoEm: '2026-10-29T00:00:00.000Z' };
    expect(mesclarFrases([base], [deNovo], new Set())).toEqual([base]);
  });

  it('a exclusão manual tira também o que já estava gravado', () => {
    expect(mesclarFrases([base, outra], [], new Set([base.id]))).toEqual([outra]);
  });
});

describe('nomes e domínios', () => {
  it('nomes aceitos vêm do mandato: nome completo, apelidos e "presidente" + cada um, normalizados', () => {
    expect([...nomesAceitos(MANDATOS[0])].sort()).toEqual(
      ['luiz inacio lula da silva', 'lula', 'presidente luiz inacio lula da silva', 'presidente lula']);
  });

  it('domínio de busca de cada agência sai do primeiro prefixo, sem www', () => {
    expect(AGENCIAS.map(dominioDaAgencia)).toEqual(['aosfatos.org', 'estadao.com.br', 'checamos.afp.com', 'agencialupa.org']);
  });

  it('config/frases-excluidas.json é válida', () => {
    expect(carregarExclusoes()).toBeInstanceOf(Set);
    expect(() => carregarExclusoes([{ id: 'x', motivo: '' }])).toThrow();
    expect(() => carregarExclusoes([{ id: 'x', motivo: 'agência marcou o autor errado', extra: 1 }])).toThrow();
  });
});
