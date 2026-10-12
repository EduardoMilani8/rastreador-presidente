import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gravarDerivados } from '../../src/pipeline/derivados';
import { calcularViagens, carregarLocais, cidadeDoLocal, ehAeroporto } from '../../src/pipeline/viagens';
import { ViagemSchema, type Evento } from '../../src/shared/schema';

const T = '2026-10-08T12:00:00.000Z';
const LOCAIS = carregarLocais();
let n = 0;
const ag = (data: string, local: string | undefined, extra: Partial<Evento> = {}): Evento => ({
  id: `agenda:${data}:${++n}`, tipo: 'agenda', data, titulo: 'Compromisso', local, status: 'consta_na_agenda',
  fontes: [{ nome: 'agenda-planalto', rotulo: 'Planalto', url: 'https://x.test/a', coletadoEm: T }],
  confirmadoPor: [], historico: [], ...extra,
});
const id = (local: string) => cidadeDoLocal(local, LOCAIS)?.id;

// Textos reais do campo `local` da agenda (data/eventos), copiados como a fonte publicou.
const REAIS: [string, string][] = [
    ['Abu Dhabi', 'abu-dhabi-ae'],
    ['Aeroporto Internacional Kotoka – Acra, Gana', 'acra-gh'],
    ['Adis Abeba, Etiópia', 'adis-abeba-et'],
    ['Gabinete do Primeiro-Ministro – Adis Abeba, Etiópia', 'adis-abeba-et'],
    ['Aeroporto Internacional Ted Stevens', 'anchorage-us'],
    ['Assunção, Paraguai', 'assuncao-py'],
    ['Edifício Histórico do Porto de Assunção – Paraguai', 'assuncao-py'],
    ['Feira de Barcelona', 'barcelona-es'],
    ['Jardins do Palácio de Pedralbes', 'barcelona-es'],
    ['Berlim', 'berlim-de'],
    ['Berlim, Alemanha', 'berlim-de'],
    ['Bogotá, Colômbia', 'bogota-co'],
    ['Casa de Nariño', 'bogota-co'],
    ['Aeroporto de Brindisi – Itália', 'brindisi-it'],
    ['Bruxelas', 'bruxelas-be'],
    ['Edifício Europa', 'bruxelas-be'],
    ['Casa Rosada – Museu do Bicentenário', 'buenos-aires-ar'],
    ['Casa Rosada – Salão dos Cientistas', 'buenos-aires-ar'],
    ['Palácio Presidencial de Heliópolis – Cairo, Egito', 'cairo-eg'],
    ['Sede da Liga dos Estados Árabes – Cairo, Egito', 'cairo-eg'],
    ['Aeroporto Internacional de Calgary', 'calgary-ca'],
    ['Aeroporto Internacional Mohammed V', 'casablanca-ma'],
    ['Club de Industriales, Hotel JW Marriott – Cidade do México', 'cidade-do-mexico-mx'],
    ['Palácio Legislativo San Lázaro – Cidade do México', 'cidade-do-mexico-mx'],
    ['Centro de Convenções do Panamá', 'cidade-do-panama-pa'],
    ['Eclusa de Cocolí', 'cidade-do-panama-pa'],
    ['Altar da Confissão, Basílica de São Pedro, Estado da Cidade do Vaticano', 'cidade-do-vaticano-va'],
    ['Biblioteca do Palácio Apostólico', 'cidade-do-vaticano-va'],
    ['Amiri Diwan – Doha, Catar', 'doha-qa'],
    ['Doha, Catar', 'doha-qa'],
    ['Dubai, Emirados Árabes Unidos', 'dubai-ae'],
    ['Expo City Dubai', 'dubai-ae'],
    ['Centro de Conferências - Hôtel Royal, Evian Resort', 'evian-les-bains-fr'],
    ['Evian Resort, La Source Vive', 'evian-les-bains-fr'],
    ['Hotel Borgo Egnazia', 'fasano-it'],
    ['Hotel Borgo Egnazia – Itália', 'fasano-it'],
    ['Genebra, Suíça', 'genebra-ch'],
    ['Hotel Intercontinental - Genebra, Suíça', 'genebra-ch'],
    ['Centro de Conferências Arthur Chung – Georgetown, Guiana', 'georgetown-gy'],
    ['Georgetown, Guiana', 'georgetown-gy'],
    ['Hotel Sofitel Legend Metropole Hanoi', 'hanoi-vn'],
    ['Mausoléu do Presidente Ho Chi Minh', 'hanoi-vn'],
    ['Palácio de Herrenhause', 'hanover-de'],
    ['“Messegelände Convention Center”, 3º andar', 'hanover-de'],
    ['Palácio da Revolução', 'havana-cu'],
    ['Palácio de Convenções de Havana', 'havana-cu'],
    ['Hiroshima', 'hiroshima-jp'],
    ['Parque Memorial da Paz de Hiroshima', 'hiroshima-jp'],
    ['Aeroporto Intercontinental George Bush', 'houston-us'],
    ['Aeroporto Amílcar Cabral', 'ilha-do-sal-cv'],
    ['Aeroporto Internacional Amílcar Cabral', 'ilha-do-sal-cv'],
    ['Palácio Merdeka', 'jacarta-id'],
    ['Secretaria-Geral da Associação das Nações do Sudeste Asiático (ASEAN)', 'jacarta-id'],
    ['Centro de Convenções de Sandton', 'joanesburgo-za'],
    ['Centro de Exposições de Joanesburgo', 'joanesburgo-za'],
    ['Alojamento Pomeroy Kananaskis Mountain', 'kananaskis-ca'],
    ['Kingstown, São Vicente e Granadinas', 'kingstown-vc'],
    ['Centro de Convenções MITEC', 'kuala-lumpur-my'],
    ['Centro de Convenções de Kuala Lumpur', 'kuala-lumpur-my'],
    ['Base Aérea de Letícia', 'leticia-co'],
    ['Jardim do Palacete de São Bento', 'lisboa-pt'],
    ['Mosteiro dos Jerônimos', 'lisboa-pt'],
    ['10 Downing Street', 'londres-gb'],
    ['Abadia de Westminster', 'londres-gb'],
    ['Memorial Dr. António Agostinho Neto', 'luanda-ao'],
    ['Sede da Interpol', 'lyon-fr'],
    ['Casa de América', 'madri-es'],
    ['Madri', 'madri-es'],
    ['Centro Internacional de Conferências Joaquim Chissano', 'maputo-mz'],
    ['Palácio da Ponta Vermelha', 'maputo-mz'],
    ['Centro de Engenharia e Desenvolvimento (CEiiA)', 'matosinhos-pt'],
    ['Forum Grimaldi', 'monaco-mc'],
    ['Fórum Grimaldi', 'monaco-mc'],
    ['Chácara Mujica-Topolansky – Uruguai', 'montevideu-uy'],
    ['Edifício MERCOSUL – Montevidéu, Uruguai', 'montevideu-uy'],
    ['Grande Palácio do Kremlin', 'moscou-ru'],
    ['Praça Vermelha', 'moscou-ru'],
    ['Port Lympia', 'nice-fr'],
    ['Casa Hyderabad', 'nova-delhi-in'],
    ['Memorial Mahatma Gandhi (Raj Ghat)', 'nova-delhi-in'],
    ['Jazz at Lincoln Center – Nova York', 'nova-york-us'],
    ['Missão Permanente da Alemanha junto às Nações Unidas – Nova York', 'nova-york-us'],
    ['Academia Francesa', 'paris-fr'],
    ['Campo de Marte, Torre Eiffel', 'paris-fr'],
    ['China National Convention Center II', 'pequim-cn'],
    ['Grande Palácio do Povo', 'pequim-cn'],
    ['Aeroporto Francisco Sá Carneiro', 'porto-pt'],
    ['Aeroporto Internacional da Praia - Nelson Mandela - Cabo Verde', 'praia-cv'],
    ['Hotel Gran Meliá Iguazú', 'puerto-iguazu-ar'],
    ['Palácio de Governo (Perdana Putra), Putrajaya', 'putrajaya-my'],
    ['Palácio Real Al Yamamah', 'riade-sa'],
    ['Embaixada do Brasil em Roma', 'roma-it'],
    ['Palazzo Chigi', 'roma-it'],
    ['Santa Cruz de la Sierra, Bolívia', 'santa-cruz-de-la-sierra-bo'],
    ['Hotel Estelar Santamar', 'santa-marta-co'],
    ['Centro Cultural Matucana 100', 'santiago-cl'],
    ['Gabinete Presidencial – Palácio de La Moneda – Santiago, Chile', 'santiago-cl'],
    ['Aeroporto Internacional de São Tomé', 'sao-tome-st'],
    ['Casa Azul, Seul', 'seul-kr'],
    ['Cemitério Nacional de Seul', 'seul-kr'],
    ['Banco Central de Honduras', 'tegucigalpa-hn'],
    ['Banco Central de Honduras - Salão Dr. Juan Manuel Gálvez', 'tegucigalpa-hn'],
    ['Hotel New Otani', 'toquio-jp'],
    ['Palácio Akasaka', 'toquio-jp'],
    ['Aeroporto Internacional de Túnis-Cartago', 'tunis-tn'],
    ['Aeroporto Internacional de Túnis-Cartago – Tunísia', 'tunis-tn'],
    ['Blair House', 'washington-us'],
    ['Casa Branca', 'washington-us'],
    ['Fábrica da Volkswagen em Wolfsburg', 'wolfsburg-de'],
    ['Novo Banco de Desenvolvimento (NBD) - Xangai', 'xangai-cn'],
    ['Xangai', 'xangai-cn'],
];

describe('tabela de locais (config/locais.json)', () => {
  it.each(REAIS)('%s -> %s', (local, esperado) => {
    expect(id(local)).toBe(esperado);
  });
  it('toda cidade da tabela tem ao menos um texto real testado', () => {
    const testadas = new Set(REAIS.map(([, c]) => c));
    expect(LOCAIS.map((l) => l.id).filter((c) => !testadas.has(c))).toEqual([]);
  });
  it('recusa tabela com id repetido ou com padrão fora da forma normalizada', () => {
    const base = { id: 'x-xx', cidade: 'X', pais: 'Y', lat: 0, lon: 0, exatos: [], contem: ['algum lugar'] };
    expect(() => carregarLocais([base, base])).toThrow(/repetido/);
    expect(() => carregarLocais([{ ...base, contem: ['Palácio'] }])).toThrow(/normalizada/);
    expect(() => carregarLocais([{ ...base, contem: [] }])).toThrow();
    expect(() => carregarLocais([{ ...base, lat: 120 }])).toThrow();
  });
});

describe('o que fica de fora', () => {
  it.each([
    'Nova York - MA', 'Nova York (MA)', 'Buenos Aires - PE', 'Buenos Aires (PE)', 'Prefeitura de Buenos Aires/PE',
    'Santiago - RS', 'Santiago', 'Praia Grande - SP', 'Praia do Forte', 'Bairro Roma', 'Romaria', 'Hotel Paris',
    'Avenida Paris, 100', 'Colégio Madri', 'Hotel Berlim', 'Edifício Dubai', 'Cairo Hotel', 'Lisboa Palace Hotel',
    'Paróquia Nossa Senhora da Assunção', 'Assunção do Piauí', 'Eldorado do Sul', 'Aeroporto de Eldorado',
    'Santa Marta', 'Comunidade Santa Marta – Rio de Janeiro', 'Xangai Restaurante', 'Residencial Pequim',
    'Aeroporto Internacional de Foz do Iguaçu', 'Itaipu Binacional', 'Usina Hidrelétrica de Itaipu',
    'Belmond Hotel Cataratas', 'Palácio do Planalto', 'Base Aérea de Brasília', 'Palácio Itamaraty',
  ])('lugar no Brasil ou só parecido não vira cidade no exterior: %s', (local) => {
    expect(id(local)).toBeUndefined();
  });
  it.each([
    'Local de hospedagem', 'Palácio Presidencial', 'Sala de Bilaterais', 'Sala da Plenária', 'Hotel St. Regis',
    'Hotel Intercontinental', 'Assembleia Nacional', 'Palácio Real', 'Palácio Imperial', 'Hotel Imperial',
    'Plaza de Armas', 'Palácio dos Congressos', 'Hotel Ritz-Carlton', 'Palácio do Povo', 'Hotel Sheraton', '',
  ])('local genérico não identifica cidade sozinho: "%s"', (local) => {
    expect(id(local)).toBeUndefined();
  });
  it('sem local, não há cidade', () => {
    expect(cidadeDoLocal(undefined, LOCAIS)).toBeUndefined();
  });
  it('texto que casa com duas cidades da tabela fica de fora', () => {
    const duas = carregarLocais([
      { id: 'a-aa', cidade: 'A', pais: 'P', lat: 0, lon: 0, exatos: [], contem: ['palacio azul'] },
      { id: 'b-bb', cidade: 'B', pais: 'P', lat: 0, lon: 0, exatos: [], contem: ['sala nobre'] },
    ]);
    expect(cidadeDoLocal('Palácio Azul, Sala Nobre', duas)).toBeUndefined();
    expect(cidadeDoLocal('Palácio Azul', duas)?.id).toBe('a-aa');
  });
});

describe('ehAeroporto', () => {
  it('reconhece aeroporto, base aérea, aeródromo e aeroestação', () => {
    for (const l of ['Aeroporto Internacional John F. Kennedy', 'Base Aérea de Andrews', 'Aeródromo de Alverca',
      'Aeroestação Militar Aeroparque']) expect(ehAeroporto(l)).toBe(true);
    for (const l of ['Casa Branca', 'Sede das Nações Unidas', 'Hotel W – Santiago, Chile']) expect(ehAeroporto(l)).toBe(false);
  });
});

describe('calcularViagens', () => {
  it('conta itens e dias distintos por cidade e informa o primeiro e o último dia', () => {
    const v = calcularViagens([
      ag('2023-09-19', 'Sede das Nações Unidas, Salão da Assembleia Geral'), ag('2023-09-19', 'Nova York'),
      ag('2024-09-24', 'Sede das Nações Unidas – Nova York'), ag('2023-09-16', 'Aeroporto Internacional John F. Kennedy'),
    ], LOCAIS);
    expect(v).toEqual([{
      id: 'nova-york-us', cidade: 'Nova York', pais: 'Estados Unidos', lat: 40.71, lon: -74.01,
      compromissos: 4, dias: 3, primeiroDia: '2023-09-16', ultimoDia: '2024-09-24',
    }]);
    expect(ViagemSchema.array().safeParse(v).success).toBe(true);
  });
  it('só agenda: ato e comunicado com o mesmo texto não contam', () => {
    const v = calcularViagens([
      ag('2023-06-23', 'Palácio do Eliseu'),
      ag('2023-06-23', 'Palácio do Eliseu', { tipo: 'ato', status: 'publicado' }),
      ag('2023-06-23', 'Palácio do Eliseu', { tipo: 'comunicado', status: 'publicado' }),
    ], LOCAIS);
    expect(v).toHaveLength(1);
    expect(v[0].compromissos).toBe(1);
  });
  it('item removido da agenda não conta', () => {
    const v = calcularViagens([
      ag('2023-06-23', 'Palácio do Eliseu'),
      ag('2023-06-24', 'Palácio do Eliseu', { status: 'removido', removidoEm: T }),
    ], LOCAIS);
    expect(v[0]).toMatchObject({ compromissos: 1, dias: 1, ultimoDia: '2023-06-23' });
    expect(calcularViagens([ag('2023-06-24', 'Palácio do Eliseu', { status: 'removido', removidoEm: T })], LOCAIS)).toEqual([]);
  });
  it('escala técnica (só aeroporto ou base aérea na agenda) não é viagem', () => {
    expect(calcularViagens([
      ag('2023-05-17', 'Aeroporto Internacional Ted Stevens'), ag('2025-10-12', 'Aeroporto Internacional Amílcar Cabral'),
      ag('2023-07-08', 'Base Aérea de Letícia'),
    ], LOCAIS)).toEqual([]);
  });
  it('em cidade com compromisso fora do aeroporto, a chegada e a partida também contam', () => {
    const v = calcularViagens([ag('2023-02-09', 'Base Aérea de Andrews'), ag('2023-02-10', 'Casa Branca')], LOCAIS);
    expect(v[0]).toMatchObject({ id: 'washington-us', compromissos: 2, dias: 2 });
  });
  it('local genérico ou no Brasil não entra em nenhuma cidade', () => {
    expect(calcularViagens([
      ag('2025-10-23', 'Hotel St. Regis'), ag('2025-10-23', 'Local de hospedagem'), ag('2025-10-23', undefined),
      ag('2025-10-23', 'Palácio do Planalto'), ag('2025-10-23', 'Nova York - MA'),
    ], LOCAIS)).toEqual([]);
  });
  it('ordena por compromissos, do maior para o menor, com desempate pelo id', () => {
    const v = calcularViagens([
      ag('2023-05-06', 'Londres'), ag('2023-06-23', 'Paris'), ag('2023-06-23', 'Paris'), ag('2023-12-04', 'Berlim'),
    ], LOCAIS);
    expect(v.map((x) => x.id)).toEqual(['paris-fr', 'berlim-de', 'londres-gb']);
  });
});

describe('gravarDerivados', () => {
  it('grava data/viagens.json e não reescreve quando nada mudou', async () => {
    const d = await mkdtemp(join(tmpdir(), 'rp-'));
    const eventos = [ag('2023-06-23', 'Palácio do Eliseu'), ag('2023-06-23', 'Palácio do Planalto')];
    expect(await gravarDerivados(d, eventos)).toBe(2); // resumo.json e viagens.json
    const v = JSON.parse(await readFile(join(d, 'viagens.json'), 'utf8'));
    expect(v.map((x: { id: string }) => x.id)).toEqual(['paris-fr']);
    expect(await gravarDerivados(d, eventos)).toBe(0);
  });
  it('sem nenhuma viagem reconhecida, grava a lista vazia', async () => {
    const d = await mkdtemp(join(tmpdir(), 'rp-'));
    await gravarDerivados(d, [ag('2023-06-23', 'Palácio do Planalto')]);
    expect(JSON.parse(await readFile(join(d, 'viagens.json'), 'utf8'))).toEqual([]);
  });
});
