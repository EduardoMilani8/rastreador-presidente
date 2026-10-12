// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';

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
    expect(titulos.every((t) => t === 'H1' || t === 'H2')).toBe(true);
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
    expect(document.querySelector('h1')!.textContent).toBe('Sobre e metodologia');
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
    expect(texto).toMatch(/Notícias \(aba separada\)/);
    for (const termo of ['Agenda do Presidente', 'Diário Oficial da União', 'Comunicados do Planalto', 'Consta na agenda', 'Publicado no Diário Oficial']) {
      expect(texto).toContain(termo);
    }
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
    expect(texto).toMatch(/página inicial mostra (só )?os dois meses mais recentes/);
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
