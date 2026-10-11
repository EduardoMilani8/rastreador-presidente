import { describe, expect, it } from 'vitest';
import {
  DouLayoutError, chaveDoAto, cortarPreambulo, parseDou, textoPlanaltoEhDoAto, urlDouEdicao, urlTextoPlanalto,
} from '../../src/collectors/dou';
import { PAGINA_PLANALTO_D11430, PAGINA_PLANALTO_L15090 } from '../helpers';
import { parseDataExtenso, somarDias } from '../../src/shared/text';

const COLETA = '2026-10-08T12:00:00.000Z';
const item = (o: Record<string, string>) => ({
  pubName: 'DO1', pubDate: '07/10/2026', content: '', artType: 'Decreto numerado',
  hierarchyStr: 'Atos do Poder Executivo', ...o,
});
const html = (itens: object[]) =>
  `<html><body><script id="params" type="application/json">${JSON.stringify({ jsonArray: itens })}</script></body></html>`;

const DECRETO = item({
  title: 'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026',
  urlTitle: 'decreto-n-13.132-de-6-de-outubro-de-2026-736937325',
  content: 'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026 Autoriza o ingresso e a permanência temporária de forças militares no território nacional. O PRESIDENTE DA REPÚBLICA, no uso da atribuição que lhe confere o art. 84',
});
const LEI = item({
  title: 'LEI Nº 15.999, DE 6 DE OUTUBRO DE 2026', urlTitle: 'lei-n-15.999-de-6-de-outubro-de-2026-700000001',
  artType: 'Lei', hierarchyStr: 'Atos do Poder Legislativo',
  content: 'LEI Nº 15.999, DE 6 DE OUTUBRO DE 2026 Dispõe sobre algo. O PRESIDENTE DA REPÚBLICA Faço saber que o Congresso Nacional decreta',
});
const RESOLUCAO = item({
  title: 'RESOLUÇÃO GECEX Nº 971, DE 6 DE OUTUBRO DE 2026', urlTitle: 'resolucao-gecex-n-971-736952867',
  artType: 'Resolução', hierarchyStr: 'Presidência da República/Câmara de Comércio Exterior',
});
const DECRETO_LEGISLATIVO = item({
  title: 'DECRETO LEGISLATIVO Nº 12, DE 5 DE OUTUBRO DE 2026', urlTitle: 'dl-12-700000002',
  hierarchyStr: 'Atos do Poder Legislativo',
});
const DECRETO_SEM_NUMERO = item({
  title: 'DECRETO DE 6 DE OUTUBRO DE 2026', urlTitle: 'decreto-de-6-700000003',
  artType: 'Decreto não numerado',
});

describe('urlDouEdicao', () => {
  it('formata a data como DD-MM-AAAA', () => {
    expect(urlDouEdicao('2026-10-07')).toBe('https://www.in.gov.br/leiturajornal?data=07-10-2026&secao=do1');
  });
  it('pede a edição extra com secao=do1e (onde saem MPs e decretos fora do expediente)', () => {
    expect(urlDouEdicao('2023-01-02', 'do1e')).toBe('https://www.in.gov.br/leiturajornal?data=02-01-2023&secao=do1e');
  });
});

describe('parseDou', () => {
  it('mantém só decretos numerados, leis e MPs; descarta o resto', () => {
    const r = parseDou(html([DECRETO, LEI, RESOLUCAO, DECRETO_LEGISLATIVO, DECRETO_SEM_NUMERO]), '2026-10-07', COLETA);
    expect(r.map((e) => e.titulo)).toEqual([
      'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026',
      'LEI Nº 15.999, DE 6 DE OUTUBRO DE 2026',
    ]);
  });

  it('preenche id, datas, ementa, status e fonte do decreto', () => {
    const [d] = parseDou(html([DECRETO]), '2026-10-07', COLETA);
    expect(d).toMatchObject({
      id: 'dou:decreto-n-13.132-de-6-de-outubro-de-2026-736937325',
      tipo: 'ato', data: '2026-10-07', status: 'publicado',
      datasAto: { assinatura: '2026-10-06', publicacao: '2026-10-07' },
    });
    expect(d.ementa).toBe('Autoriza o ingresso e a permanência temporária de forças militares no território nacional.');
    expect(d.fontes[0]).toMatchObject({
      nome: 'dou', rotulo: 'Diário Oficial da União',
      url: 'https://www.in.gov.br/web/dou/-/decreto-n-13.132-de-6-de-outubro-de-2026-736937325',
    });
  });

  it('lança DouLayoutError quando o JSON embutido não existe ou não é lista', () => {
    expect(() => parseDou('<html></html>', '2026-10-07', COLETA)).toThrow(DouLayoutError);
    expect(() => parseDou('<script id="params">{"jsonArray": 5}</script>', '2026-10-07', COLETA)).toThrow(DouLayoutError);
  });

  it('edição sem atos devolve lista vazia', () => {
    expect(parseDou(html([]), '2026-10-07', COLETA)).toEqual([]);
  });

  it('dia sem edição (domingo, feriado, futuro) responde 200 com jsonArray vazio — formato real verificado em out/2026', () => {
    const real = `<html><head><title>Leitura do Jornal - Imprensa Nacional</title></head><body>
      <script id="params" type="application/json">
        {"typeNormDay":{"DO2ESP":false,"DO1ESP":false,"DO1A":false,"DO3E":false,"DO2E":false,"DO1E":false},"idPortletInstance":"Kujrw0TZC2Mb","dateUrl":"04-10-2026","section":"DO1","jsonArray":[]}
      </script></body></html>`;
    expect(parseDou(real, '2026-10-04', COLETA)).toEqual([]);
  });

  it('não corta a ementa em "o Presidente da República" minúsculo', () => {
    const d = item({
      title: 'DECRETO Nº 1, DE 6 DE OUTUBRO DE 2026', urlTitle: 'decreto-n-1-700000010',
      content: 'DECRETO Nº 1, DE 6 DE OUTUBRO DE 2026 Autoriza o Presidente da República a conceder indulto. O PRESIDENTE DA REPÚBLICA, no uso',
    });
    const [e] = parseDou(html([d]), '2026-10-07', COLETA);
    expect(e.ementa).toBe('Autoriza o Presidente da República a conceder indulto.');
  });

  it('corta a ementa nos preâmbulos reais do DOU: letras espaçadas, "OPRESIDENTE", vice no exercício, "Faço saber"', () => {
    const casos: [string, string, string][] = [
      ['LEI Nº 15.519, DE 22 DE SETEMBRO DE 2026',
        'Dispõe sobre o exercício da atividade de psicopedagogia. O V I C E - P R E S I D E N T E D A R E P Ú B L I C A, no exercício do cargo deP R E S I D E N T E D A R E P Ú B L I C A Faço saber que o Congresso Nacional decreta',
        'Dispõe sobre o exercício da atividade de psicopedagogia.'],
      ['DECRETO Nº 13.115, DE 8 DE SETEMBRO DE 2026',
        'Amplia o Parque Nacional de Sete Cidades, localizado nos Municípios de Brasileira e Piracuruca, Estado do Piauí. OPRESIDENTE DA REPÚBLICA, no uso da atribuição que lhe confere o art. 84',
        'Amplia o Parque Nacional de Sete Cidades, localizado nos Municípios de Brasileira e Piracuruca, Estado do Piauí.'],
      ['DECRETO Nº 13.122, DE 21 DE SETEMBRO DE 2026',
        'Promulga o Acordo Constituinte, firmado pela República Federativa do Brasil, em Roma, em 28 de outubro de 1994. O VICE-PRESIDENTE DA REPÚBLICA, no exercício do cargo dePRESIDENTE DA REPÚBLICA, no uso da atribuição',
        'Promulga o Acordo Constituinte, firmado pela República Federativa do Brasil, em Roma, em 28 de outubro de 1994.'],
      ['LEI Nº 15.521, DE 24 DE SETEMBRO DE 2026',
        'Altera a Lei nº 11.892, de 29 de dezembro de 2008. O P R E S I D E N T E D AR E P Ú B L I C A Faço saber que o Congresso',
        'Altera a Lei nº 11.892, de 29 de dezembro de 2008.'],
      ['LEI Nº 15.497, DE 4 DE SETEMBRO DE 2026',
        'Altera a Lei nº 15.201, de 9 de setembro de 2025, para reduzir o prazo de análise dos processos. Faço saber que o Presidente da República adotou a Medida Provisória nº 1.369, de 2026, que o Congresso Nacional aprovou',
        'Altera a Lei nº 15.201, de 9 de setembro de 2025, para reduzir o prazo de análise dos processos.'],
    ];
    // cada ato é lido na edição do dia seguinte à assinatura (publicação muito posterior seria republicação)
    const r = casos.map(([title, resto], i) => parseDou(
      html([item({ title, urlTitle: `caso-${i}-700000${i}`, content: `${title} ${resto}` })]),
      somarDias(parseDataExtenso(title)!, 1), COLETA,
    )[0]);
    expect(r.map((e) => e?.ementa)).toEqual(casos.map((c) => c[2]));
  });

  it('normaliza espaços do content antes de remover o título', () => {
    const d = item({
      title: 'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026', urlTitle: 'decreto-n-13.132-700000011',
      content: 'DECRETO Nº 13.132, DE 6 DE  OUTUBRO DE 2026  Autoriza algo. O PRESIDENTE DA REPÚBLICA, no uso',
    });
    const [e] = parseDou(html([d]), '2026-10-07', COLETA);
    expect(e.ementa).toBe('Autoriza algo.');
  });

  it('ementa fica indefinida quando o content não começa com o título (o ato é mantido)', () => {
    const outro = item({
      title: 'DECRETO Nº 2, DE 6 DE OUTUBRO DE 2026', urlTitle: 'decreto-n-2-700000012',
      content: 'Texto qualquer sem o título. O PRESIDENTE DA REPÚBLICA, no uso',
    });
    const curto = item({
      title: 'DECRETO Nº 3, DE 6 DE OUTUBRO DE 2026', urlTitle: 'decreto-n-3-700000013',
      content: 'DECRETO Nº 3',
    });
    const r = parseDou(html([outro, curto]), '2026-10-07', COLETA);
    expect(r).toHaveLength(2);
    expect(r[0].ementa).toBeUndefined();
    expect(r[1].ementa).toBeUndefined();
  });

  it('lança DouLayoutError quando há itens mas nenhum com title e hierarchyStr', () => {
    expect(() => parseDou(html([{ foo: 1 }]), '2026-10-07', COLETA)).toThrow(DouLayoutError);
  });
});

describe('parseDou: republicações não são atos novos (C1)', () => {
  const lei = (title: string, urlTitle: string) => item({
    title, urlTitle, artType: 'Lei', hierarchyStr: 'Atos do Poder Legislativo',
    content: `${title} Regulamenta o art. 231 da Constituição Federal. O PRESIDENTE DA REPÚBLICA Faço saber`,
  });
  const LEI_14701 = lei('LEI Nº 14.701, DE 20 DE OUTUBRO DE 2023', 'lei-n-14.701-de-20-de-outubro-de-2023-517807334');
  const LEI_14701_PARTES_VETADAS = lei('LEI Nº 14.701, DE 20 DE OUTUBRO DE 2023', 'lei-n-14.701-de-20-de-outubro-de-2023-533926998');
  const LEI_14701_ASTERISCO = lei('LEI Nº 14.701, DE 20 DE OUTUBRO DE 2023 (*)', 'lei-n-14.701-de-20-de-outubro-de-2023-*-535292810');

  it('Lei 14.701 (marco temporal): fica a 1ª publicação, de 20/10/2023', () => {
    const r = parseDou(html([LEI_14701]), '2023-10-20', COLETA);
    expect(r.map((e) => e.id)).toEqual(['dou:lei-n-14.701-de-20-de-outubro-de-2023-517807334']);
  });
  it('Lei 14.701: a promulgação das partes vetadas (28/12/2023, 69 dias depois da assinatura) não entra', () => {
    expect(parseDou(html([LEI_14701_PARTES_VETADAS]), '2023-12-28', COLETA)).toEqual([]);
  });
  it('Lei 14.701: a republicação "(*)" de 02/01/2024 não entra', () => {
    expect(parseDou(html([LEI_14701_ASTERISCO]), '2024-01-02', COLETA)).toEqual([]);
  });
  it('Lei 14.382, assinada em 27/06/2022 e republicada em 05/01/2023, não entra', () => {
    const l = lei('LEI Nº 14.382, DE 27 DE JUNHO DE 2022', 'lei-n-14.382-de-27-de-junho-de-2022-456336095');
    expect(parseDou(html([l]), '2023-01-05', COLETA)).toEqual([]);
  });
  it('Decreto 12.432 republicado 19 dias depois não entra; a publicação de 3 dias depois entra', () => {
    const d = (urlTitle: string) => item({ title: 'DECRETO Nº 12.432, DE 11 DE ABRIL DE 2025', urlTitle });
    expect(parseDou(html([d('decreto-n-12.432-de-11-de-abril-de-2025-626968909')]), '2025-04-30', COLETA)).toEqual([]);
    expect(parseDou(html([d('decreto-n-12.432-de-11-de-abril-de-2025-623745236')]), '2025-04-14', COLETA)).toHaveLength(1);
  });
  it('no limite: 10 dias entre assinatura e publicação ainda é o ato; 11 dias já é republicação', () => {
    const d = item({ title: 'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026', urlTitle: 'decreto-n-13.132-700000020' });
    expect(parseDou(html([d]), '2026-10-16', COLETA)).toHaveLength(1);
    expect(parseDou(html([d]), '2026-10-17', COLETA)).toEqual([]);
  });
  it('título terminado em "ANEXO" (formas reais) nunca entra, mesmo publicado no dia seguinte à assinatura', () => {
    const titulos = ['LEI Nº 14.802, DE 10 DE JANEIRO DE 2024 - ANEXO', 'LEI Nº 14.802, DE 10 DE JANEIRO DE 2024-ANEXO'];
    const itens = titulos.map((title, i) => item({ title, urlTitle: `rep-${i}-70000003${i}` }));
    expect(parseDou(html(itens), '2024-01-11', COLETA)).toEqual([]);
  });
  it('retificação "(*)" até 10 dias depois da assinatura sai do coletor (o pipeline decide se o ato já está listado)', () => {
    const l = lei('LEI Nº 14.642, DE 1º DE AGOSTO DE 2023 (*)', 'lei-n-14.642-de-1-de-agosto-de-2023-*-500470021');
    const r = parseDou(html([l]), '2023-08-03', COLETA);
    expect(r.map((e) => e.titulo)).toEqual(['LEI Nº 14.642, DE 1º DE AGOSTO DE 2023 (*)']);
    expect(r[0].datasAto).toEqual({ assinatura: '2023-08-01', publicacao: '2023-08-03' });
  });
  it('retificação "(*)" sem data de assinatura legível não entra (não dá para saber se é recente)', () => {
    const d = item({ title: 'DECRETO Nº 11.539, DE 31 DE MAIO 2023 (*)', urlTitle: 'decreto-n-11.539-*-1' });
    expect(parseDou(html([d]), '2023-06-02', COLETA)).toEqual([]);
  });
  it('chaveDoAto: tipo + número, sem depender de "Nº", pontos, data ou "(*)"', () => {
    expect(chaveDoAto('LEI Nº 15.321, DE 31 DE DEZEMBRO DE 2025 (*)')).toBe(chaveDoAto('LEI Nº 15.321, DE 31 DE DEZEMBRO DE 2025'));
    expect(chaveDoAto('DECRETO 12.568, DE 30 DE JULHO DE 2025')).toBe(chaveDoAto('decreto nº 12568, de 30 de julho de 2025'));
    expect(chaveDoAto('LEI COMPLEMENTAR Nº 200, DE 30 DE AGOSTO DE 2023')).not.toBe(chaveDoAto('LEI Nº 200, DE 30 DE AGOSTO DE 2023'));
    expect(chaveDoAto('MEDIDA PROVISÓRIA Nº 1.182, DE 24 DE JULHO DE 2023 (*)')).toBe(chaveDoAto('MEDIDA PROVISÓRIA Nº 1.182, DE 24 DE JULHO DE 2023'));
  });
});

describe('cortarPreambulo: o DOU corta o resumo no meio do preâmbulo (finais reais da carga 2023–2026)', () => {
  const casos: [string, string][] = [
    ['proposta de participação no fomento da política de pesquisa e desenvolvimento de semicondutores. O PRESIDENTE DA REPÚ...',
      'proposta de participação no fomento da política de pesquisa e desenvolvimento de semicondutores.'],
    ['Sistema de Administração dos Recursos de Informação e Informática - GSISP. O VICE-PRESIDENTE DA REP...',
      'Sistema de Administração dos Recursos de Informação e Informática - GSISP.'],
    ['que cria o Fundo Nacional sobre Mudança do Clima. O PRESIDENTE DA...', 'que cria o Fundo Nacional sobre Mudança do Clima.'],
    ['para o cumprimento das metas de universalização. O PRES...', 'para o cumprimento das metas de universalização.'],
    ['da administração pública federal direta, autárquica e fundacional. O ...',
      'da administração pública federal direta, autárquica e fundacional.'],
    ['Política Nacional de Pagamento por Serviços Ambientais. OPRESI...', 'Política Nacional de Pagamento por Serviços Ambientais.'],
    ['Atenção da Saúde da Pessoa com Deficiência (Pronas/PCD). O V I C E - P R E S I D E N T E...',
      'Atenção da Saúde da Pessoa com Deficiência (Pronas/PCD).'],
    ['da Lei nº 12.845, de 1º de agosto de 2013. O V I C E - P...', 'da Lei nº 12.845, de 1º de agosto de 2013.'],
    ['das Usinas Hidrelétricas de Furnas. O VI...', 'das Usinas Hidrelétricas de Furnas.'],
    // Decreto 11.777, de 9/11/2023: o DOU escreveu "DE REPÚBLICA" e colou o "no uso"
    ['com vistas à Abolição da Pena de Morte, de 15 de dezembro de 1989. O PRESIDENTE DE REPÚBLICA,no uso da atribuição que lhe confere o art. 84,caput, inciso IV, da Constituição, e ...',
      'com vistas à Abolição da Pena de Morte, de 15 de dezembro de 1989.'],
  ];
  it.each(casos)('%s', (entrada, esperado) => {
    expect(cortarPreambulo(entrada)).toBe(esperado);
  });
  it('não corta resumo truncado no meio da frase nem "o Presidente da República" minúsculo', () => {
    for (const texto of [
      'que ofertem ou tenham por objeto a exploração da l...',
      'Autoriza o Presidente da República a conceder indulto.',
      'Dispõe sobre a carreira de Oficial de Chancelaria e sobre O...',
      'Institui o Programa OPERA...',
    ]) expect(cortarPreambulo(texto)).toBe(texto);
  });
  it('é idempotente', () => {
    for (const [, limpo] of casos) expect(cortarPreambulo(limpo)).toBe(limpo);
  });
});

describe('parseDou: detalhes dos títulos reais', () => {
  it('data de assinatura posterior à publicação é erro de digitação do DOU: o ato fica, sem data de assinatura', () => {
    const d = item({
      title: 'DECRETO Nº 12.420, DE 25 DE DEZEMBRO DE 2025', urlTitle: 'decreto-n-12.420-de-25-de-dezembro-de-2025-619903503',
    });
    const [e] = parseDou(html([d]), '2025-03-26', COLETA);
    expect(e.titulo).toBe('DECRETO Nº 12.420, DE 25 DE DEZEMBRO DE 2025');
    expect(e.datasAto).toEqual({ assinatura: undefined, publicacao: '2025-03-26' });
  });
  it('ato publicado no próprio dia da assinatura mantém a data', () => {
    const d = item({ title: 'DECRETO Nº 12.953, DE 28 DE ABRIL DE 2026', urlTitle: 'decreto-n-12.953-700000040' });
    expect(parseDou(html([d]), '2026-04-28', COLETA)[0].datasAto).toEqual({ assinatura: '2026-04-28', publicacao: '2026-04-28' });
  });
  it('decreto numerado que o DOU intitulou sem "Nº" entra (I9: "DECRETO 12.568, DE 30 DE JULHO DE 2025")', () => {
    const d = item({
      title: 'DECRETO 12.568, DE 30 DE JULHO DE 2025', urlTitle: 'decreto-12.568-de-30-de-julho-de-2025-645258918',
      content: 'DECRETO 12.568, DE 30 DE JULHO DE 2025 Renova a concessão outorgada à Prefeitura Municipal de São Carlos, para executar,',
    });
    const plural = item({ title: 'DECRETOS DE 12 DE MAIO DE 2026', urlTitle: 'decretos-de-12-de-maio-de-2026-1', artType: 'Decreto não numerado' });
    const r = parseDou(html([d, plural, DECRETO_SEM_NUMERO]), '2025-07-31', COLETA);
    expect(r.map((e) => e.id)).toEqual(['dou:decreto-12.568-de-30-de-julho-de-2025-645258918']);
    expect(r[0].datasAto).toEqual({ assinatura: '2025-07-30', publicacao: '2025-07-31' });
    expect(urlTextoPlanalto(r[0].titulo, r[0].datasAto?.assinatura))
      .toBe('https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/D12568.htm');
  });
});

describe('urlTextoPlanalto', () => {
  it('monta a URL do decreto (padrão verificado em 2023)', () => {
    expect(urlTextoPlanalto('DECRETO Nº 11.369, DE 1º DE JANEIRO DE 2023', '2023-01-01'))
      .toBe('https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/decreto/D11369.htm');
  });
  it('monta a URL da lei', () => {
    expect(urlTextoPlanalto('LEI Nº 14.663, DE 28 DE AGOSTO DE 2023', '2023-08-28'))
      .toBe('https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/L14663.htm');
  });
  it('usa a legislatura certa a partir de 2027', () => {
    expect(urlTextoPlanalto('DECRETO Nº 20.000, DE 2 DE JANEIRO DE 2027', '2027-01-02'))
      .toBe('https://www.planalto.gov.br/ccivil_03/_ato2027-2030/2027/decreto/D20000.htm');
  });
  it('devolve null para lei complementar, MP e sem data', () => {
    expect(urlTextoPlanalto('LEI COMPLEMENTAR Nº 200, DE 1 DE JANEIRO DE 2023', '2023-01-01')).toBeNull();
    expect(urlTextoPlanalto('MEDIDA PROVISÓRIA Nº 1.333, DE 7 DE JANEIRO DE 2026', '2026-01-07')).toBeNull();
    expect(urlTextoPlanalto('DECRETO Nº 1, DE 1 DE JANEIRO', undefined)).toBeNull();
  });
});

describe('textoPlanaltoEhDoAto (C2): a página só serve se trouxer a data do ato por extenso', () => {
  it('Decreto 11.430: a página é do decreto de 8 de março; o "11.430, de 3 de março" do DOU (número errado) não casa', () => {
    expect(textoPlanaltoEhDoAto(PAGINA_PLANALTO_D11430, 'DECRETO Nº 11.430, DE 8 DE MARÇO DE 2023')).toBe(true);
    expect(textoPlanaltoEhDoAto(PAGINA_PLANALTO_D11430, 'DECRETO Nº 11.430, DE 3 DE MARÇO DE 2023')).toBe(false);
  });
  it('Lei 15.090: a página é a lei de 7 de janeiro; a "15.090, de 8 de agosto" do DOU (na verdade 15.190) não casa', () => {
    expect(textoPlanaltoEhDoAto(PAGINA_PLANALTO_L15090, 'LEI Nº 15.090, DE 7 DE JANEIRO DE 2025')).toBe(true);
    expect(textoPlanaltoEhDoAto(PAGINA_PLANALTO_L15090, 'LEI Nº 15.090, DE 8 DE AGOSTO DE 2025')).toBe(false);
  });
  it('tolera "1º", "1o", "1°", o ordinal perdido na decodificação, maiúsculas, acentos, tags e quebras de linha', () => {
    const titulo = 'DECRETO Nº 11.329, DE 1º DE JANEIRO DE 2023';
    for (const data of ['1º DE JANEIRO DE 2023', '1o de janeiro de 2023', '1° de Janeiro de 2023', '1\uFFFD de janeiro de 2023',
      '1 de janeiro de 2023', '1º de\r\n\tjaneiro&nbsp;de <b>2023</b>']) {
      expect(textoPlanaltoEhDoAto(`<html><body><p>DECRETO Nº 11.329, DE ${data}</p></body></html>`, titulo), data).toBe(true);
    }
    expect(textoPlanaltoEhDoAto('<p>Brasília, 9 de MARÇO de 2023</p>', 'DECRETO Nº 1, DE 9 DE MARCO DE 2023')).toBe(true);
  });
  it('não confunde dia 8 com 18 ou 28, nem aceita só o número do ato', () => {
    const titulo = 'DECRETO Nº 11.430, DE 8 DE MARÇO DE 2023';
    expect(textoPlanaltoEhDoAto('<p>DECRETO Nº 11.430, DE 18 DE MARÇO DE 2023</p>', titulo)).toBe(false);
    expect(textoPlanaltoEhDoAto('<p>DECRETO Nº 11.430, DE 28 de março de 2023</p>', titulo)).toBe(false);
    expect(textoPlanaltoEhDoAto('<p>DECRETO Nº 11.430</p><p>8 de março de 2024</p>', titulo)).toBe(false);
    expect(textoPlanaltoEhDoAto('', titulo)).toBe(false);
  });
  it('título sem data por extenso nunca é confirmado', () => {
    expect(textoPlanaltoEhDoAto(PAGINA_PLANALTO_D11430, 'DECRETO Nº 11.539, DE 31 DE MAIO 2023')).toBe(false);
  });
});
