// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ICONES } from '../../site/src/icones';
import { ROTULO_TIPO_FALA } from '../../site/src/falas';
import { CIDADES_A_VISTA, faixaDeCidade } from '../../site/src/viagens';
import { carregarAgencias } from '../../src/pipeline/falas';

// jsdom não dá a import.meta.url um esquema file:, então resolve a partir da raiz do projeto.
const ler = (arq: string) => readFileSync(resolve(process.cwd(), arq), 'utf8');

beforeEach(() => {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.innerHTML = ler('site/sobre.html');
});

describe('site/sobre.html', () => {
  it('usa a mesma faixa de cabeçalho da página principal e a área de texto corrido', () => {
    const html = ler('site/sobre.html');
    expect(html).toContain('<div class="faixa">');
    expect(html).toContain('<main id="conteudo" class="prosa">');
  });

  it('tem landmarks, um único h1 e h2 logo depois (sem pular níveis)', () => {
    expect(document.querySelectorAll('header, [role=banner]')).toHaveLength(1);
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelectorAll('footer')).toHaveLength(1);
    expect(document.querySelectorAll('nav[aria-label]')).toHaveLength(2);
    const titulos = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => h.tagName);
    expect(titulos[0]).toBe('H1');
    expect(titulos.filter((t) => t === 'H1')).toHaveLength(1);
    expect(titulos[1]).toBe('H2');
    expect(titulos.every((t) => t === 'H1' || t === 'H2' || t === 'H3')).toBe(true);
    // h3 só aparece depois de um h2, nunca pula nível
    titulos.forEach((t, i) => { if (t === 'H3') expect(titulos[i - 1]).toMatch(/H2|H3/); });
  });

  it('o índice da página aponta, na ordem, para cada seção depois dos três passos', () => {
    const links = [...document.querySelectorAll('main > nav.indice a')] as HTMLAnchorElement[];
    const secoes = [...document.querySelectorAll('main h2')].filter((h) => !h.matches('.passos-titulo'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(secoes.map((h) => `#${h.id}`));
    for (const h of secoes) expect(h.id, h.textContent!).toMatch(/^[a-z-]+$/);
    expect(document.querySelector('main > nav.indice')!.getAttribute('aria-label')).toBe('Nesta página');
    expect(document.querySelector('main > nav.indice')!.previousElementSibling!.matches('ol.passos')).toBe(true);
  });

  it('os limites vêm em três grupos com título, sem mudar a ordem dos itens', () => {
    const grupos = [...document.querySelectorAll('.limites > h3')];
    expect(grupos.map((h) => h.textContent)).toEqual(['Agenda e comunicados', 'Atos do Diário Oficial', 'O que o site mostra']);
    expect(grupos.map((h) => (h.nextElementSibling as HTMLElement).querySelectorAll(':scope > li').length)).toEqual([7, 4, 6]);
  });

  it('tem link de pular para o conteúdo apontando para o main', () => {
    const pular = document.querySelector('a.pular') as HTMLAnchorElement;
    expect(pular.getAttribute('href')).toBe('#conteudo');
    expect(document.querySelector('main')!.id).toBe('conteudo');
  });

  it('marca a própria página na navegação e mantém rodapé, título e idioma', () => {
    // A igualdade da navegação entre as cinco páginas é verificada em paginas.test.ts.
    expect(document.querySelector('nav a[aria-current=page]')!.textContent).toBe('Sobre');
    expect(document.querySelector('nav a[aria-current=page]')!.getAttribute('href')).toBe('sobre.html');
    expect(document.querySelector('h1')!.textContent).toBe('Como este site funciona');
    expect(document.querySelector('footer.rodape')!.textContent).toContain('Projeto independente, sem vínculo com o governo.');
    expect(document.title).toContain('Sobre e metodologia');
    expect(document.documentElement.lang).toBe('pt-BR');
  });

  it('não tem scripts, estilos inline, handlers nem e-mail, e o único link externo de código é o repositório do projeto', () => {
    const html = ler('site/sobre.html');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/mailto:|@[a-z0-9-]+\.[a-z]|gitlab\.com/i);
    const repos = [...html.matchAll(/https:\/\/github\.com\/[^"<\s]*/g)].map((m) => m[0]);
    expect(repos.length).toBeGreaterThan(0);
    // além do repositório, só a tabela pública de locais da seção das viagens
    expect(new Set(repos)).toEqual(new Set([
      'https://github.com/EduardoMilani8/rastreador-presidente',
      'https://github.com/EduardoMilani8/rastreador-presidente/blob/main/config/locais.json',
      'https://github.com/EduardoMilani8/rastreador-presidente/blob/main/config/checagens.json',
    ]));
    expect(html).toContain('href="./style.css"');
  });

  it('não fala mais em aba separada nem em página inicial mostrando meses', () => {
    const texto = document.querySelector('main')!.textContent!.replace(/\s+/g, ' ');
    expect(texto).not.toContain('aba separada');
    expect(texto).not.toMatch(/página inicial mostra (os )?(meses|dois meses)/);
  });

  it('tem a linha de descrição abaixo do título', () => {
    const textos = [...document.querySelectorAll('main > p')].map((p) => p.textContent);
    expect(textos).toContain('Projeto independente, sem vínculo com o governo, feito só com fontes públicas.');
  });

  const PASSOS: [string, string][] = [
    ['Fontes', 'Os dados vêm somente de fontes oficiais públicas e da imprensa.'],
    ['Coleta', 'O site busca novidades a cada cerca de 10 minutos; fontes públicas podem demorar a publicar.'],
    ['Publicação', 'Todo item tem link para o dado de origem. Item sem fonte pública não é publicado.'],
  ];

  it('Em três passos: três passos numerados com frases exatas, sob um h2', () => {
    const h2 = [...document.querySelectorAll('main h2')].find((h) => h.textContent === 'Em três passos')!;
    expect(h2).toBeTruthy();
    const itens = [...document.querySelectorAll('ol.passos > li')];
    expect(itens).toHaveLength(3);
    PASSOS.forEach(([titulo, frase], i) => {
      expect(itens[i].querySelector('h3')!.textContent).toBe(titulo);
      expect(itens[i].querySelector('p')!.textContent).toBe(frase);
    });
    expect(h2.compareDocumentPosition(itens[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('cada frase dos passos continua existindo no restante da página', () => {
    const resto = [...document.querySelectorAll('main > *')]
      .filter((e) => !e.matches('ol.passos') && !e.closest('ol.passos'))
      .map((e) => e.textContent).join(' ').replace(/\s+/g, ' ');
    for (const [, frase] of PASSOS) expect(resto, frase).toContain(frase);
  });

  it('a lista de status tem um ícone por item, com o desenho de ICONES', () => {
    const h2 = [...document.querySelectorAll('main h2')].find((h) => h.textContent === 'O que cada status significa')!;
    const itens = [...(h2.nextElementSibling as HTMLElement).querySelectorAll(':scope > li')];
    const ordem = ['relogio', 'lista', 'visto', 'balao', 'documento', 'lapis', 'cortado'] as const;
    expect(itens).toHaveLength(7);
    itens.forEach((li, i) => {
      const svg = li.querySelector(':scope > svg.icone')!;
      expect(svg, li.textContent!).toBeTruthy();
      expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.querySelector('path')!.getAttribute('d')).toBe(ICONES[ordem[i]]);
      expect(svg.nextElementSibling!.tagName).toBe('STRONG');
    });
  });

  it('a seção de limites tem a classe limites', () => {
    expect(document.querySelector('.limites')!.textContent).toContain('Limites que você precisa saber');
  });

  it('é honesto sobre a metodologia', () => {
    const texto = document.querySelector('main')!.textContent!.replace(/\s+/g, ' ');
    // (a) o tempo sozinho não confirma
    expect(texto).toMatch(/nunca aparece como "?Realizado"? só porque o tempo passou/);
    // (b) comunicados do Planalto são avisos de pauta (antes do evento): não confirmam nada, e a ligação está desligada
    expect(texto).toMatch(/Hoje nenhum compromisso recebe este status automaticamente/);
    expect(texto).toMatch(/avisos de pauta .* antes do compromisso/);
    expect(texto).toMatch(/ligação automática com a agenda está desligada/);
    expect(texto).not.toMatch(/depois dos fatos|somente um comunicado oficial|só confirma um compromisso do mesmo dia/);
    // (c) fontes
    expect(texto).toMatch(/somente de fontes oficiais públicas e da imprensa/);
    expect(texto).toMatch(/Notícias \(página separada\)/);
    for (const termo of ['Agenda do Presidente', 'Diário Oficial da União', 'Comunicados do Planalto', 'Consta na agenda', 'Publicado no Diário Oficial']) {
      expect(texto).toContain(termo);
    }
  });

  it('explica a capa', () => {
    const texto = document.querySelector('.limites')!.textContent!.replace(/\s+/g, ' ');
    expect(texto).toContain('A capa mostra os 21 dias mais recentes.');
    expect(texto).toContain('O tamanho de cada marca indica quantos registros há no dia.');
    expect(texto).toContain('Compromissos removidos da agenda não aumentam a marca, mas são informados no texto do dia.');
    expect(texto).toContain('O detalhe do dia lista até três itens; a lista completa, com as fontes, está em Registros.');
    expect(texto).toContain('Os números do alto da capa só aparecem quando o total calculado pela coleta está disponível.');
    expect([...document.querySelectorAll('.limites li')].at(-3)!.textContent).toMatch(/^A capa/);
  });

  it('o h2 dos passos não repete o título da página', () => {
    expect([...document.querySelectorAll('main h2')].map((h) => h.textContent)).not.toContain('Como funciona');
  });

  it('diz o que os números do alto da capa contam', () => {
    const texto = document.querySelector('.limites')!.textContent!.replace(/\s+/g, ' ');
    expect(texto).toContain('Os números do alto da capa contam tudo o que está guardado no site: compromissos da agenda, atos do Diário Oficial e comunicados do Planalto, desde 01/01/2023. Compromisso que saiu da agenda oficial continua na contagem, porque continua guardado e aparece nos registros como "Removido da agenda".');
  });

  it('diz que o site não mostra gastos, e a palavra só aparece nesse item', () => {
    const texto = document.querySelector('.limites')!.textContent!.replace(/\s+/g, ' ');
    expect(texto).toContain('O site não mostra gastos. As fontes públicas oficiais (Portal da Transparência) publicam cartão de pagamento, diárias, passagens e despesas por órgão, e o órgão "Presidência da República" inclui centenas de servidores. Gasto do órgão não é gasto do presidente, e mostrar um como se fosse o outro seria enganoso.');
    const principal = document.querySelector('main')!.textContent!;
    expect(principal.match(/gastos/gi)).toHaveLength(1);
    const item = [...document.querySelectorAll('.limites li')].find((li) => /gastos/i.test(li.textContent!))!;
    expect(item.textContent).toMatch(/^O site não mostra gastos\./);
  });

  it('os dois itens novos vêm depois do item do painel, nessa ordem', () => {
    const itens = [...document.querySelectorAll('.limites li')].map((li) => li.textContent!);
    const painel = itens.findIndex((t) => t.startsWith('A capa'));
    expect(itens[painel + 1]).toMatch(/^Os números do alto da capa contam tudo/);
    expect(itens[painel + 2]).toMatch(/^O site não mostra gastos\./);
  });

  it('conta os limites reais dos dados (I8)', () => {
    const texto = document.querySelector('main')!.textContent!.replace(/\s+/g, ' ');
    // mudanças e remoções só a partir do início da coleta; o histórico é uma fotografia daquele dia
    expect(texto).toMatch(/só (são|é) detectad[ao]s? a partir de 11\/10\/2026/);
    expect(texto).toMatch(/de 2023 (até|a) (essa data|10\/2026|11\/10\/2026).*como (ela )?estava publicada em 11\/10\/2026/);
    // atos do vice no exercício da Presidência
    expect(texto).toMatch(/vice-presidente no exercício da Presidência/);
    // republicações, retificações e partes promulgadas pelo Congresso não são listadas
    // republicado com correção logo depois da assinatura: uma vez só; republicações posteriores e partes
    // promulgadas pelo Congresso: fora
    expect(texto).toMatch(/Cada ato é listado uma vez\./);
    expect(texto).toMatch(/republicado com correção logo depois da assinatura \(título com “\(\*\)”\) aparece uma vez só/);
    expect(texto).toMatch(/Republicações posteriores e partes vetadas promulgadas pelo Congresso meses depois não são listadas/);
    expect(texto).not.toMatch(/retificações e partes/);
    // link do texto no Planalto só quando encontrado e conferido
    expect(texto).toMatch(/“Texto do ato” .* só aparece quando .* encontrad[ao] e confere/);
    // dia sem agenda pública
    expect(texto).toMatch(/não está pública.* (não mostramos nada|nada é mostrado)/);
    // títulos como o DOU imprimiu, com erros; alguns decretos podem faltar
    expect(texto).toMatch(/como o Diário Oficial (os )?(imprimiu|publicou), inclusive com erros de digitação/);
    expect(texto).toMatch(/[Aa]lguns (poucos )?decretos podem (faltar|não aparecer)/);
    // leis do governo anterior publicadas em janeiro de 2023
    expect(texto).toMatch(/[Ll]eis (assinadas|sancionadas) pelo governo anterior e publicadas em janeiro de 2023 não (são listadas|entram)/);
    expect(texto).not.toMatch(/sem atualização|Sem atualização/);
    // visão padrão e cadência
    expect(texto).toMatch(/página Registros mostra (só )?os dois meses mais recentes/);
    expect(texto).toMatch(/a cada cerca de 10 minutos/);
    expect(texto).not.toMatch(/a cada poucos minutos/);
  });

  it('os nomes dos status são os mesmos da interface', async () => {
    const { ROTULO_STATUS, ROTULO_COMUNICADO } = await import('../../site/src/render');
    const termos = [...document.querySelectorAll('main li > strong')].map((e) => e.textContent);
    for (const rotulo of [...Object.values(ROTULO_STATUS).map((r) => r.texto), ROTULO_COMUNICADO.texto]) {
      expect(termos, rotulo).toContain(rotulo);
    }
    expect(document.querySelector('main')!.textContent).not.toContain('Alterado / Removido');
  });

  describe('seção das viagens', () => {
    const TABELA = 'config/locais.json';

    // Itens da seção "Viagens" de docs/regras-painel.md, sem o subtítulo "Situação em…": linhas quebradas juntas
    // com um espaço e sem crases.
    function frasesDoDocumento(): string[] {
      const md = ler('docs/regras-painel.md');
      const inicio = md.indexOf('## Viagens (`data/viagens.json`)');
      const fim = md.indexOf('### Situação em', inicio);
      expect(inicio).toBeGreaterThan(-1);
      expect(fim).toBeGreaterThan(inicio);
      const itens: string[] = [];
      for (const linha of md.slice(inicio, fim).split('\n')) {
        if (linha.startsWith('- ')) itens.push(linha.slice(2).trim());
        else if (linha.startsWith('  ') && itens.length > 0) itens[itens.length - 1] += ` ${linha.trim()}`;
      }
      return itens.map((i) => i.replaceAll('`', ''));
    }

    const lista = () => {
      const h2 = document.getElementById('viagens')!;
      expect(h2.tagName).toBe('H2');
      return h2.nextElementSibling as HTMLElement;
    };

    it('tem o título "Como as viagens são reconhecidas", antes da seção de limites', () => {
      const h2 = document.getElementById('viagens')!;
      expect(h2.textContent).toBe('Como as viagens são reconhecidas');
      expect(h2.compareDocumentPosition(document.querySelector('.limites')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(lista().tagName).toBe('UL');
    });

    const frases = frasesDoDocumento();

    it('lê onze frases do documento de regras', () => {
      expect(frases).toHaveLength(11);
    });

    it.each(frases.map((f, i) => [i + 1, f] as [number, string]))('o item %s está no Sobre, igual ao documento', (n, frase) => {
      const itens = [...lista().querySelectorAll(':scope > li')];
      expect(itens).toHaveLength(frases.length);
      const esperado = frase.replace(TABELA, '');
      const real = itens[n - 1].textContent!.replace(/\s+/g, ' ').trim().replace(TABELA, '');
      expect(real).toBe(esperado);
    });

    it('a tabela vira um link https para o arquivo no repositório, sem abrir sem proteção', () => {
      const a = lista().querySelector('a')!;
      expect(a.textContent).toBe(TABELA);
      expect(a.getAttribute('href')).toBe('https://github.com/EduardoMilani8/rastreador-presidente/blob/main/config/locais.json');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(lista().querySelectorAll('a')).toHaveLength(1);
    });

    it('a nota da página inicial aponta para esta seção', () => {
      const pagina = ler('site/index.html');
      expect(pagina).toContain('href="sobre.html#viagens"');
    });

    it('as faixas de tamanho e o limite da lista seguem o que o código faz', () => {
      expect(CIDADES_A_VISTA).toBe(9);
      const fronteiras = [1, 2, 3, 7, 8, 15, 16, 30, 31].map(faixaDeCidade);
      expect(fronteiras).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5]);
    });
  });

  describe('seção das falas checadas', () => {
    const secao = () => {
      const h2 = document.getElementById('falas')!;
      expect(h2.tagName).toBe('H2');
      return h2.nextElementSibling as HTMLElement;
    };
    const texto = () => secao().textContent!.replace(/\s+/g, ' ');

    it('vem depois das viagens e antes dos limites, e as fontes citam a página separada', () => {
      const h2 = document.getElementById('falas')!;
      expect(h2.textContent).toBe('Como as falas checadas são escolhidas');
      expect(document.getElementById('viagens')!.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(h2.compareDocumentPosition(document.querySelector('.limites')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const fontes = document.getElementById('fontes')!.nextElementSibling!.nextElementSibling!.textContent!.replace(/\s+/g, ' ');
      expect(fontes).toMatch(/Falas checadas \(página separada\): .*avaliação das agências, não registro oficial/);
    });

    it('cita, pelo nome, exatamente as agências de config/agencias.json e o critério da IFCN', () => {
      for (const a of carregarAgencias()) expect(texto()).toContain(a.nome);
      expect(texto()).toContain('verificadas pela IFCN');
      expect(texto()).not.toMatch(/Lupa|Comprova/);
    });

    it('diz como a lista é feita e o que fica de fora', () => {
      expect(texto()).toContain('A lista é feita e conferida à mão');
      expect(texto()).toContain('Checagem de boato ou de frase falsa atribuída ao presidente não entra.');
      expect(texto()).toContain('O site não faz checagem própria nem dá nota');
      expect(texto()).toContain('aparece no item como errata');
      expect(texto()).toContain('não entram nos números da capa nem na página Registros');
      const link = secao().querySelector('a')!;
      expect(link.textContent).toBe('config/checagens.json');
      expect(link.getAttribute('href')).toBe('https://github.com/EduardoMilani8/rastreador-presidente/blob/main/config/checagens.json');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('os tipos de fala citados são os do esquema', () => {
      for (const t of Object.values(ROTULO_TIPO_FALA)) expect(texto().toLowerCase()).toContain(t.varios.toLowerCase());
    });

    it('a página Falas checadas aponta para esta seção', () => {
      expect(ler('site/falas.html')).toContain('href="sobre.html#falas"');
    });
  });

  it('axe: sem violações de acessibilidade', async () => {
    const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
  });
});
