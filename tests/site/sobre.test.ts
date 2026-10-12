// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ICONES } from '../../site/src/icones';

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
    expect(document.querySelectorAll('nav[aria-label]')).toHaveLength(1);
    const titulos = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => h.tagName);
    expect(titulos[0]).toBe('H1');
    expect(titulos.filter((t) => t === 'H1')).toHaveLength(1);
    expect(titulos[1]).toBe('H2');
    expect(titulos.every((t) => t === 'H1' || t === 'H2' || t === 'H3')).toBe(true);
    // h3 só aparece depois de um h2, nunca pula nível
    titulos.forEach((t, i) => { if (t === 'H3') expect(titulos[i - 1]).toMatch(/H2|H3/); });
  });

  it('tem link de pular para o conteúdo apontando para o main', () => {
    const pular = document.querySelector('a.pular') as HTMLAnchorElement;
    expect(pular.getAttribute('href')).toBe('#conteudo');
    expect(document.querySelector('main')!.id).toBe('conteudo');
  });

  it('marca a própria página na navegação e mantém rodapé, título e idioma', () => {
    // A igualdade da navegação entre as quatro páginas é verificada em paginas.test.ts.
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
    expect(new Set(repos)).toEqual(new Set(['https://github.com/EduardoMilani8/rastreador-presidente']));
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

  it('explica o painel da página inicial', () => {
    const texto = document.querySelector('.limites')!.textContent!.replace(/\s+/g, ' ');
    expect(texto).toContain('O painel da página inicial mostra os 21 dias mais recentes.');
    expect(texto).toContain('O tamanho de cada marca indica quantos registros há no dia.');
    expect(texto).toContain('Compromissos removidos da agenda não aumentam a marca, mas são informados no texto do dia.');
    expect(texto).toContain('O detalhe do dia lista até três itens; a lista completa, com as fontes, está em Registros.');
    expect(texto).toContain('Os números do alto do painel só aparecem quando o total calculado pela coleta está disponível.');
    expect([...document.querySelectorAll('.limites li')].at(-3)!.textContent).toMatch(/^O painel da página inicial/);
  });

  it('o h2 dos passos não repete o título da página', () => {
    expect([...document.querySelectorAll('main h2')].map((h) => h.textContent)).not.toContain('Como funciona');
  });

  it('diz o que os números do alto do painel contam', () => {
    const texto = document.querySelector('.limites')!.textContent!.replace(/\s+/g, ' ');
    expect(texto).toContain('Os números do alto do painel contam tudo o que está guardado no site: compromissos da agenda, atos do Diário Oficial e comunicados do Planalto, desde 01/01/2023. Compromisso que saiu da agenda oficial continua na contagem, porque continua guardado e aparece nos registros como "Removido da agenda".');
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
    const painel = itens.findIndex((t) => t.startsWith('O painel da página inicial'));
    expect(itens[painel + 1]).toMatch(/^Os números do alto do painel contam tudo/);
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

  it('axe: sem violações de acessibilidade', async () => {
    const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
  });
});
