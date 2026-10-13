# Redesenho do site (direção "Registro"): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a aparência de `site/` pela direção "Registro" (cinzas neutros, hora em coluna, faixa de fontes no pé do cartão, ícones SVG, duas colunas no desktop) sem mudar dados nem comportamento.

**Architecture:** `render.ts` passa a gerar o cartão com a marcação nova e ícones vindos de um módulo novo `icones.ts`. `index.html` e `sobre.html` ganham a faixa de cabeçalho e o agrupador `.destaques`. `style.css` é reescrito sobre as mesmas variáveis, e um teste novo calcula o contraste a partir delas.

**Tech Stack:** TypeScript strict, Vite, vitest com jsdom e axe-core. Sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-10-12-redesenho-site-design.md`

## Global Constraints

- Texto das fontes entra no DOM só por `textContent`/`append(string)`. Nunca `innerHTML`, `outerHTML`, `insertAdjacentHTML`.
- Nenhum atributo `style`, `<style>`, script inline ou manipulador inline. A CSP é `script-src 'self'; style-src 'self'`.
- Sem fontes, imagens ou scripts de terceiros. Só fontes do sistema.
- Caminhos relativos (`./style.css`, `data/...`).
- Links externos só `https`, por `urlHttpsSegura`.
- Nenhum id do HTML muda. Nenhuma classe existente de `render.ts` é renomeada.
- Contraste mínimo de 4,5:1 em texto e 3:1 em borda de campo, nos dois temas.
- Alvos de toque de 44 px. Foco visível. Ordem de títulos h1 → h2 → h3 → h4.
- Status sempre com ícone e texto. Nenhuma cor ou ícone que sugira julgamento.
- Nenhuma frase de `site/sobre.html` muda.
- Imports sem extensão. Comentários só quando explicam o porquê.
- Interface, nomes de teste e commits em português do Brasil, no estilo `tipo(escopo): resumo`.
- Não editar `data/`. Não rodar `npm run update` nem `npm run backfill`.
- Sem `git push` e sem junção em `main`.
- Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Título longo sem espaços em tela de 320 px** (URL colada, sigla enorme): o cartão quebra a linha e a página não ganha rolagem horizontal. Coberto por `overflow-wrap` no CSS (Task 4) e conferido no navegador (Task 5, passo 4).
2. **Elemento com `hidden` e `display` definido no CSS** (`#painel-linha` em grid, `.mais` em flex): continua oculto. Teste de CSS na Task 4.
3. **Navegador sem `:has()`**: fica em coluna única, sem coluna lateral vazia. Teste de CSS na Task 4 (o grid só existe dentro de `@supports`).
4. **Item sem hora** (todo ato e comunicado): sem coluna de hora vazia na linha do tempo e, no destaque, `datetime` só com a data. Testes na Task 2.
5. **Lista longa de próximos compromissos na coluna lateral**: o último item é alcançável por rolagem e por teclado. Conferido no navegador (Task 5, passo 5).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `site/src/icones.ts` (novo) | Desenhos dos ícones e a função que cria o `<svg>` |
| `site/src/render.ts` | Marcação do cartão, opções de `renderEvento` |
| `site/src/app.ts` | Só as três chamadas de `renderEvento` |
| `site/index.html`, `site/sobre.html` | Faixa do cabeçalho, `.destaques`, `.cronologia`, `.prosa` |
| `site/style.css` | Todo o estilo |
| `tests/site/icones.test.ts` (novo) | Ícones |
| `tests/site/contraste.test.ts` (novo) | Contraste e guardas do CSS |
| `tests/site/render.test.ts`, `app.test.ts`, `sobre.test.ts` | Ajustes e casos novos |

---

### Task 1: Ícones em SVG

**Files:**
- Create: `site/src/icones.ts`
- Test: `tests/site/icones.test.ts`

**Interfaces:**
- Produces: `type NomeIcone = 'relogio' | 'lista' | 'visto' | 'documento' | 'balao' | 'lapis' | 'cortado'`, `ICONES: Record<NomeIcone, string>`, `icone(doc: Document, nome: NomeIcone): SVGSVGElement`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/site/icones.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ICONES, icone, type NomeIcone } from '../../site/src/icones';

describe('icone', () => {
  it('cria um svg decorativo, sem estilo inline, com o desenho pedido', () => {
    const svg = icone(document, 'relogio');
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('class')).toBe('icone');
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.hasAttribute('style')).toBe(false);
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(ICONES.relogio);
  });

  it('todo ícone tem desenho próprio', () => {
    const nomes = Object.keys(ICONES) as NomeIcone[];
    expect(nomes).toHaveLength(7);
    expect(new Set(nomes.map((n) => ICONES[n])).size).toBe(7);
    for (const n of nomes) expect(ICONES[n]).toMatch(/^M/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/site/icones.test.ts`
Expected: FAIL, não encontra `../../site/src/icones`.

- [ ] **Step 3: Implementar**

Criar `site/src/icones.ts`:

```ts
const SVG = 'http://www.w3.org/2000/svg';
const CIRCULO = 'M8 2a6 6 0 1 0 0 12a6 6 0 0 0 0-12z';

export const ICONES = {
  relogio: `${CIRCULO}M8 4.5V8l2.5 1.5`,
  lista: 'M5.5 4.5h7M5.5 8h7M5.5 11.5h7M3 4.5h.01M3 8h.01M3 11.5h.01',
  visto: `${CIRCULO}M5.2 8.2l2 2l3.6-4`,
  documento: 'M4 1.5h5.5L12 4v10.5H4zM9.5 1.5V4H12M6 8h4M6 11h4',
  balao: 'M2.5 3h11v7.5H7l-3 2.5v-2.5H2.5z',
  lapis: 'M3 13l.6-2.8l7-7l2.2 2.2l-7 7zM9.4 4.4l2.2 2.2',
  cortado: `${CIRCULO}M3.8 3.8l8.4 8.4`,
} as const;

export type NomeIcone = keyof typeof ICONES;

// Traço e cor vêm do CSS (.icone): a CSP proíbe o atributo style.
export function icone(doc: Document, nome: NomeIcone): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'icone');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONES[nome]);
  svg.append(path);
  return svg;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/site/icones.test.ts && npm run typecheck`
Expected: 2 testes passam; typecheck sem saída de erro.

- [ ] **Step 5: Commit**

```bash
git add site/src/icones.ts tests/site/icones.test.ts
git commit -m "feat(site): ícones de status em SVG de traço

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Marcação nova do cartão

**Files:**
- Modify: `site/src/render.ts` (rótulos nas linhas 13-22, `renderEvento` nas linhas 78-112)
- Modify: `site/src/app.ts:103`, `site/src/app.ts:107`, `site/src/app.ts:145`
- Test: `tests/site/render.test.ts`, `tests/site/app.test.ts`

**Interfaces:**
- Consumes: `icone(doc, nome)` e `NomeIcone` de `site/src/icones`.
- Produces: `interface OpcoesEvento { nivelTitulo?: number; comId?: boolean; comData?: boolean }` e `renderEvento(doc: Document, ev: Evento, opcoes?: OpcoesEvento): HTMLElement`. `ROTULO_STATUS[status].icone` e `ROTULO_COMUNICADO.icone` passam a ser `NomeIcone`. Classes novas: `evento-hora`, `evento-corpo`, `com-hora`.

- [ ] **Step 1: Ajustar os testes existentes à assinatura nova**

Em `tests/site/render.test.ts`, trocar:

```ts
    expect(renderEvento(document, base, 3).querySelector('h3')).not.toBeNull();
```
por
```ts
    expect(renderEvento(document, base, { nivelTitulo: 3 }).querySelector('h3')).not.toBeNull();
```

e trocar:

```ts
    const li = renderEvento(document, base, 3, false);
```
por
```ts
    const li = renderEvento(document, base, { nivelTitulo: 3, comId: false });
```

- [ ] **Step 2: Escrever os testes novos que falham**

Em `tests/site/render.test.ts`, mudar o import da primeira linha de imports para incluir `ROTULO_COMUNICADO` e `ROTULO_STATUS`, e importar `ICONES`:

```ts
import { ROTULO_COMUNICADO, ROTULO_STATUS, formatarDataCurta, formatarDataLonga, renderEvento, renderFontes, renderNoticia } from '../../site/src/render';
import { ICONES } from '../../site/src/icones';
```

Dentro de `describe('renderEvento', ...)`, depois do teste `'id do elemento é seguro para âncora'`, acrescentar:

```ts
  it('a hora fica em coluna própria, fora da caixa do cartão', () => {
    const li = renderEvento(document, base);
    const hora = li.querySelector(':scope > time.evento-hora')!;
    expect(hora.textContent).toBe('10:00');
    expect(hora.getAttribute('datetime')).toBe('2026-10-08T10:00');
    expect(li.classList.contains('com-hora')).toBe(true);
    expect(li.querySelector('.evento-corpo time')).toBeNull();
    expect(li.querySelector('.evento-meta time')).toBeNull();
  });

  it('item sem hora não tem coluna de hora', () => {
    const ato: Evento = { ...base, tipo: 'ato', hora: undefined, status: 'publicado' };
    const li = renderEvento(document, ato);
    expect(li.querySelector('time')).toBeNull();
    expect(li.classList.contains('com-hora')).toBe(false);
    expect(li.querySelector(':scope > .evento-corpo')).not.toBeNull();
  });

  it('no destaque (comData) a data e a hora ficam dentro da caixa', () => {
    const li = renderEvento(document, base, { comData: true });
    const quando = li.querySelector('.evento-corpo > time.evento-hora')!;
    expect(quando.textContent).toBe('08/10/2026 · 10:00');
    expect(quando.getAttribute('datetime')).toBe('2026-10-08T10:00');
    expect(li.classList.contains('com-hora')).toBe(false);
    expect(li.querySelectorAll('time')).toHaveLength(1);
  });

  it('no destaque, item sem hora mostra só a data', () => {
    const ato: Evento = { ...base, tipo: 'ato', hora: undefined, status: 'publicado' };
    const quando = renderEvento(document, ato, { comData: true }).querySelector('time.evento-hora')!;
    expect(quando.textContent).toBe('08/10/2026');
    expect(quando.getAttribute('datetime')).toBe('2026-10-08');
  });

  it('o status leva ícone svg decorativo e texto, sem emoji', () => {
    const li = renderEvento(document, base);
    const status = li.querySelector('.evento-meta .status')!;
    expect(status.querySelector('svg.icone[aria-hidden="true"] path')!.getAttribute('d')).toBe(ICONES.lista);
    expect(status.textContent!.trim()).toBe('Consta na agenda');
    expect(li.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('todo status e o comunicado apontam para um ícone que existe', () => {
    for (const r of [...Object.values(ROTULO_STATUS), ROTULO_COMUNICADO]) expect(ICONES[r.icone]).toMatch(/^M/);
  });

  it('nenhum status usa desenho de alerta: alterado e removido têm ícones próprios', () => {
    expect(ROTULO_STATUS.alterado.icone).toBe('lapis');
    expect(ROTULO_STATUS.removido.icone).toBe('cortado');
  });

  it('o link permanente fica na faixa de fontes, fora da lista de fontes', () => {
    const li = renderEvento(document, base);
    expect(li.querySelector('.bloco-fontes > a.permalink')).not.toBeNull();
    expect(li.querySelector('.fontes a.permalink')).toBeNull();
    expect(li.querySelector('.evento-meta a')).toBeNull();
    expect(li.querySelectorAll('.fontes a')).toHaveLength(1);
  });

  it('tipo e título continuam dentro da caixa, com as classes do contrato', () => {
    const li = renderEvento(document, base);
    expect(li.className).toBe('evento tipo-agenda status-consta_na_agenda com-hora');
    expect(li.querySelector('.evento-corpo .evento-meta .tipo')!.textContent).toBe('Agenda');
    expect(li.querySelector('.evento-corpo h4.evento-titulo')!.textContent).toBe('Reunião');
    expect(li.querySelector('.evento-corpo .local')!.textContent).toBe('Palácio do Planalto');
    expect(li.querySelector('.evento-corpo .bloco-fontes .selo')!.textContent).toBe('Fonte única');
  });
```

Em `tests/site/app.test.ts`, dentro de `describe('montar', ...)`, depois do primeiro teste, acrescentar:

```ts
  it('os destaques mostram a data do item; a linha do tempo, só a hora', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    const proximo = document.querySelector('#proximos time.evento-hora')!;
    expect(proximo.textContent).toBe('09/10/2026 · 10:00');
    expect(proximo.getAttribute('datetime')).toBe('2026-10-09T10:00');
    expect(document.querySelector('#ultimo-registro time.evento-hora')!.textContent).toBe('07/10/2026 · 10:00');
    expect(document.querySelector('#ev-b time.evento-hora')!.textContent).toBe('10:00');
    expect(document.querySelector('#ultimo-registro h3.evento-titulo')).not.toBeNull();
    expect(document.querySelector('#ev-b h4.evento-titulo')).not.toBeNull();
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/site/render.test.ts tests/site/app.test.ts`
Expected: FAIL nos testes novos (por exemplo `time.evento-hora` é `null`). `npm run typecheck` também acusa as chamadas com objeto de opções.

- [ ] **Step 4: Implementar em `render.ts`**

No topo, acrescentar o import:

```ts
import { icone, type NomeIcone } from './icones';
```

Substituir `ROTULO_STATUS` e `ROTULO_COMUNICADO` por:

```ts
export const ROTULO_STATUS: Record<Status, { icone: NomeIcone; texto: string }> = {
  agendado: { icone: 'relogio', texto: 'Agendado' },
  consta_na_agenda: { icone: 'lista', texto: 'Consta na agenda' },
  realizado: { icone: 'visto', texto: 'Realizado' },
  publicado: { icone: 'documento', texto: 'Publicado no Diário Oficial' },
  alterado: { icone: 'lapis', texto: 'Alterado na agenda' },
  removido: { icone: 'cortado', texto: 'Removido da agenda' },
};

export const ROTULO_COMUNICADO: { icone: NomeIcone; texto: string } = { icone: 'balao', texto: 'Publicado no site do Planalto' };
```

Substituir o comentário e a função `renderEvento` inteiros por:

```ts
export interface OpcoesEvento {
  nivelTitulo?: number;
  /** `false` para cópias do mesmo item (destaques): só a linha do tempo leva o id âncora. */
  comId?: boolean;
  /** Nos destaques não há título de dia acima do cartão: a data vai junto da hora. */
  comData?: boolean;
}

export function renderEvento(
  doc: Document, ev: Evento, { nivelTitulo = 4, comId = true, comData = false }: OpcoesEvento = {},
): HTMLElement {
  // Comunicado do Planalto é, em geral, um aviso de pauta publicado ANTES do evento: nunca mostra "Realizado".
  const st = ev.tipo === 'comunicado' ? ROTULO_COMUNICADO : ROTULO_STATUS[ev.status];
  const li = el(doc, 'li', { class: `evento tipo-${ev.tipo} status-${ev.status}` });
  if (comId) li.id = idAncora(ev);
  const corpo = el(doc, 'div', { class: 'evento-corpo' });

  const quando = comData ? [formatarDataCurta(ev.data), ev.hora].filter(Boolean).join(' · ') : ev.hora;
  if (quando) {
    const hora = el(doc, 'time', { class: 'evento-hora', datetime: ev.hora ? `${ev.data}T${ev.hora}` : ev.data }, quando);
    if (comData) {
      corpo.append(hora);
    } else {
      li.classList.add('com-hora');
      li.append(hora);
    }
  }

  corpo.append(el(doc, 'p', { class: 'evento-meta' },
    el(doc, 'span', { class: 'tipo' }, ROTULO_TIPO[ev.tipo]),
    el(doc, 'span', { class: 'status' }, icone(doc, st.icone), ` ${st.texto}`)));
  corpo.append(el(doc, `h${nivelTitulo}`, { class: 'evento-titulo' }, ev.titulo));
  if (ev.local) corpo.append(el(doc, 'p', { class: 'local' }, ev.local));
  if (ev.ementa) corpo.append(el(doc, 'p', { class: 'ementa' }, ev.ementa));
  if (ev.tipo === 'comunicado') {
    corpo.append(el(doc, 'p', { class: 'datas-ato' },
      `Data de publicação do texto: ${formatarDataCurta(ev.data)}. O compromisso descrito pode ser em outra data.`));
  }
  if (ev.datasAto) {
    corpo.append(el(doc, 'p', { class: 'datas-ato' },
      ev.datasAto.assinatura ? `Assinado em ${formatarDataCurta(ev.datasAto.assinatura)} · ` : '',
      `Publicado em ${formatarDataCurta(ev.datasAto.publicacao)}`));
  }
  if (ev.historico.length > 0) {
    const versoes = el(doc, 'ul');
    for (const v of ev.historico) {
      versoes.append(el(doc, 'li', {}, [v.hora, v.titulo, v.local].filter(Boolean).join(' · ')));
    }
    corpo.append(el(doc, 'details', {}, el(doc, 'summary', {}, `Versões anteriores (${ev.historico.length})`), versoes));
  }
  // O link permanente fica na faixa das fontes, mas fora da lista: não é fonte e não entra na contagem do selo.
  const fontes = renderFontes(doc, ev.fontes);
  fontes.append(linkPermanente(doc, ev));
  corpo.append(fontes);
  li.append(corpo);
  return li;
}
```

- [ ] **Step 5: Ajustar as chamadas em `app.ts`**

Linha 103, trocar `renderEvento(doc, ultimo, 3, false)` por:

```ts
renderEvento(doc, ultimo, { nivelTitulo: 3, comId: false, comData: true })
```

Linha 107, trocar `renderEvento(doc, e, 3, false)` por:

```ts
renderEvento(doc, e, { nivelTitulo: 3, comId: false, comData: true })
```

Linha 145, trocar `renderEvento(doc, e, 4)` por:

```ts
renderEvento(doc, e)
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm run typecheck && npx vitest run tests/site`
Expected: typecheck limpo; todos os testes de `tests/site` passam, inclusive os de axe e o de `'mostra hora, tipo, status com ícone aria-hidden, título e local'`.

- [ ] **Step 7: Commit**

```bash
git add site/src/render.ts site/src/app.ts tests/site/render.test.ts tests/site/app.test.ts
git commit -m "feat(site): cartão com hora em coluna, faixa de fontes e ícones SVG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Estrutura das páginas

**Files:**
- Modify: `site/index.html:13-24` (cabeçalho), `site/index.html:27-36` (destaques e seção da linha do tempo)
- Modify: `site/sobre.html:12-21`
- Test: `tests/site/app.test.ts`, `tests/site/sobre.test.ts`

**Interfaces:**
- Produces: classes `faixa`, `faixa-dentro`, `avisos`, `destaques`, `cronologia`, `prosa`, que a Task 4 estiliza. Nenhum id muda.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/site/app.test.ts`, antes de `describe('ids únicos', ...)`, acrescentar:

```ts
describe('estrutura da página', () => {
  it('título, última alteração e abas ficam na faixa; os avisos, no cabeçalho e fora dela', () => {
    const faixa = document.querySelector('header.topo > .faixa')!;
    expect(faixa.querySelector('h1')!.textContent).toBe('Rastreador do Presidente');
    expect(faixa.querySelector('#ultima-novidade')).not.toBeNull();
    expect(faixa.querySelectorAll('nav.abas a')).toHaveLength(3);
    for (const id of ['aviso-desatualizado', 'aviso-fontes', 'aviso-incompleto']) {
      expect(document.querySelector(`header.topo > .avisos > #${id}`), id).not.toBeNull();
    }
  });

  it('os dois destaques ficam agrupados e vêm antes da linha do tempo na ordem de leitura', () => {
    const destaques = document.querySelector('#painel-linha > .destaques')!;
    expect([...destaques.children].map((e) => e.id)).toEqual(['bloco-ultimo', 'bloco-proximos']);
    const cronologia = document.querySelector('#painel-linha > section.cronologia')!;
    expect(cronologia.querySelector('#linha-do-tempo')).not.toBeNull();
    expect(cronologia.querySelector('#caixa-filtros')).not.toBeNull();
    expect(destaques.compareDocumentPosition(cronologia) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
```

Em `tests/site/sobre.test.ts`, dentro do primeiro `describe`, acrescentar (o arquivo já define `ler`):

```ts
  it('usa a mesma faixa de cabeçalho da página principal e a área de texto corrido', () => {
    const html = ler('site/sobre.html');
    expect(html).toContain('<div class="faixa">');
    expect(html).toContain('<main id="conteudo" class="prosa">');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/site/app.test.ts tests/site/sobre.test.ts`
Expected: FAIL, `header.topo > .faixa` é `null` e `sobre.html` não contém `class="faixa"`.

- [ ] **Step 3: Editar `site/index.html`**

Substituir o `<header class="topo">...</header>` inteiro por:

```html
  <header class="topo">
    <div class="faixa">
      <div class="faixa-dentro">
        <h1>Rastreador do Presidente</h1>
        <p id="ultima-novidade" class="discreto"></p>
        <nav aria-label="Seções do site" class="abas">
          <a id="aba-linha" href="?aba=linha">Linha do tempo</a>
          <a id="aba-noticias" href="?aba=noticias">Notícias</a>
          <a href="sobre.html">Sobre e metodologia</a>
        </nav>
      </div>
    </div>
    <div class="avisos">
      <p id="aviso-desatualizado" class="aviso" role="status" hidden></p>
      <p id="aviso-fontes" class="aviso" role="status" hidden></p>
      <p id="aviso-incompleto" class="aviso" role="status" hidden></p>
    </div>
  </header>
```

Dentro de `<div id="painel-linha">`, envolver as duas primeiras seções e dar classe à terceira. O trecho passa a ser:

```html
    <div id="painel-linha">
      <div class="destaques">
        <section id="bloco-ultimo" aria-labelledby="t-ultimo">
          <h2 id="t-ultimo">Último registro</h2>
          <div id="ultimo-registro"></div>
        </section>
        <section id="bloco-proximos" aria-labelledby="t-proximos">
          <h2 id="t-proximos">Próximos compromissos</h2>
          <ol id="proximos" class="lista"></ol>
        </section>
      </div>
      <section class="cronologia" aria-labelledby="t-linha">
```

O conteúdo da seção da linha do tempo (título, filtros, `#periodo`, `#linha-do-tempo`, `#mais-dias`, `#mais-antigos`) e tudo o que vem depois ficam como estão.

- [ ] **Step 4: Editar `site/sobre.html`**

Substituir o `<header class="topo">...</header>` inteiro por:

```html
  <header class="topo">
    <div class="faixa">
      <div class="faixa-dentro">
        <h1>Sobre e metodologia</h1>
        <nav aria-label="Seções do site" class="abas">
          <a href="./?aba=linha">Linha do tempo</a>
          <a href="./?aba=noticias">Notícias</a>
          <a href="sobre.html" aria-current="page">Sobre e metodologia</a>
        </nav>
      </div>
    </div>
  </header>
```

Trocar `<main id="conteudo">` por `<main id="conteudo" class="prosa">`. Nenhum texto muda.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/site`
Expected: todos passam, inclusive os de axe e `sobre.test.ts` (que confere as frases da página).

Run: `git diff --stat site/sobre.html`
Expected: só as linhas do cabeçalho e a tag `<main>` mudaram.

- [ ] **Step 6: Commit**

```bash
git add site/index.html site/sobre.html tests/site/app.test.ts tests/site/sobre.test.ts
git commit -m "feat(site): faixa de cabeçalho e agrupador dos destaques

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Folha de estilo e teste de contraste

**Files:**
- Modify: `site/style.css` (reescrito por inteiro)
- Test: `tests/site/contraste.test.ts` (novo)

**Interfaces:**
- Consumes: classes das Tasks 2 e 3 (`evento-hora`, `evento-corpo`, `com-hora`, `icone`, `faixa`, `faixa-dentro`, `avisos`, `destaques`, `cronologia`, `prosa`).
- Produces: variáveis `--fundo`, `--cartao`, `--texto`, `--suave`, `--linha`, `--link`, `--borda-campo`, `--aviso-bg`, `--aviso-tx`, `--topo-fundo`, `--topo-texto`, `--topo-suave`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/site/contraste.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'site/style.css'), 'utf8');

const BLOCO_CLARO = /:root\s*\{([^}]*)\}/;
const BLOCO_ESCURO = /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}\s*\}/;
const cores = (bloco: string): Record<string, string> =>
  Object.fromEntries([...bloco.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\b/g)].map((m) => [m[1], m[2]]));

const claro = cores(css.match(BLOCO_CLARO)![1]);
const escuro = cores(css.match(BLOCO_ESCURO)![1]);

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function razao(a: string, b: string): number {
  const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (maior + 0.05) / (menor + 0.05);
}

// [frente, fundo, mínimo]. 4,5 para texto; 3 para borda de campo e traço de foco.
const PARES: [string, string, number][] = [
  ['texto', 'fundo', 4.5],
  ['texto', 'cartao', 4.5],
  ['suave', 'fundo', 4.5],
  ['suave', 'cartao', 4.5],
  ['link', 'fundo', 4.5],
  ['link', 'cartao', 4.5],
  ['aviso-tx', 'aviso-bg', 4.5],
  ['topo-texto', 'topo-fundo', 4.5],
  ['topo-suave', 'topo-fundo', 4.5],
  ['borda-campo', 'cartao', 3],
  ['borda-campo', 'fundo', 3],
];

describe('contraste das cores', () => {
  it('os dois temas definem as mesmas cores', () => {
    expect(Object.keys(escuro).sort()).toEqual(Object.keys(claro).sort());
    expect(Object.keys(claro)).toHaveLength(12);
  });

  for (const [tema, paleta] of [['claro', claro], ['escuro', escuro]] as const) {
    for (const [frente, fundo, minimo] of PARES) {
      it(`${tema}: ${frente} sobre ${fundo} tem pelo menos ${minimo}:1`, () => {
        expect(paleta[frente], frente).toBeDefined();
        expect(paleta[fundo], fundo).toBeDefined();
        expect(razao(paleta[frente], paleta[fundo])).toBeGreaterThanOrEqual(minimo);
      });
    }
  }

  it('nenhuma cor é escrita fora das variáveis (senão escaparia deste teste)', () => {
    const resto = css.replace(BLOCO_ESCURO, '').replace(BLOCO_CLARO, '');
    expect(resto).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(resto).not.toMatch(/\brgba?\(|\bhsla?\(/i);
  });
});

describe('guardas da folha de estilo', () => {
  it('o tipo do item não tem cor própria', () => {
    expect(css).not.toMatch(/--(agenda|ato|comunicado)\b/);
  });

  it('elemento com hidden continua oculto mesmo com display definido', () => {
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  });

  it('as duas colunas só existem em tela larga e em navegador com :has()', () => {
    const inicio = css.indexOf('@media (min-width: 60rem)');
    expect(inicio).toBeGreaterThan(-1);
    const largo = css.slice(inicio);
    expect(largo).toMatch(/@supports selector\(:has\(\*\)\)/);
    expect(css.slice(0, inicio)).not.toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) 20rem/);
    expect(largo).toMatch(/#painel-linha:has\(\.destaques > section:not\(\[hidden\]\)\)/);
  });

  it('respeita prefers-reduced-motion: rolagem suave só para quem não pediu menos movimento', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*html\s*\{\s*scroll-behavior: smooth;/);
    expect(css).not.toMatch(/\b(transition|animation)\b/);
  });

  it('não carrega nada de fora do site', () => {
    expect(css).not.toMatch(/@import|url\(|@font-face/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/site/contraste.test.ts`
Expected: FAIL. O CSS atual tem 11 cores, ainda define `--agenda`, não tem `--borda-campo` nem a regra `[hidden]`.

- [ ] **Step 3: Reescrever `site/style.css`**

Substituir o arquivo inteiro por:

```css
:root {
  --fundo: #f4f5f6; --cartao: #ffffff; --texto: #16191d; --suave: #545b65; --linha: #d5d9de;
  --link: #0e4a94; --borda-campo: #6b727c; --aviso-bg: #fff3cd; --aviso-tx: #5c4400;
  --topo-fundo: #16191d; --topo-texto: #ffffff; --topo-suave: #b4bac2;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fundo: #0f1114; --cartao: #181b20; --texto: #eceef1; --suave: #a7aeb8; --linha: #2e333b;
    --link: #8fbfff; --borda-campo: #7d8590; --aviso-bg: #3a2f08; --aviso-tx: #ffe9a8;
    --topo-fundo: #181b20; --topo-texto: #eceef1; --topo-suave: #a7aeb8;
  }
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { font-size: 106.25%; }
body { margin: 0; background: var(--fundo); color: var(--texto); font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; }
a { color: var(--link); text-underline-offset: 2px; }
a:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible, summary:focus-visible, .dia h3:focus-visible {
  outline: 3px solid var(--link); outline-offset: 2px;
}
.faixa a:focus-visible { outline-color: var(--topo-texto); }
.pular { position: absolute; left: -999px; }
.pular:focus { left: 8px; top: 8px; background: var(--cartao); padding: 12px; z-index: 10; }

.faixa-dentro, .avisos, main, .rodape { max-width: 72rem; margin: 0 auto; padding-left: 16px; padding-right: 16px; }
#painel-linha, #painel-noticias, .prosa > *, .rodape p { max-width: 46rem; }

.faixa { background: var(--topo-fundo); color: var(--topo-texto); border-bottom: 1px solid var(--linha); }
.faixa h1 { margin: 0; padding-top: 12px; font-size: 1.15rem; line-height: 1.3; }
.discreto { margin: 0; color: var(--suave); font-size: 0.8rem; }
.faixa .discreto { color: var(--topo-suave); font-size: 0.75rem; }
.abas { display: flex; flex-wrap: wrap; gap: 0 16px; margin-top: 4px; }
.abas a { display: inline-flex; align-items: center; min-height: 44px; color: var(--topo-suave); text-decoration: none; font-weight: 600; font-size: 0.8rem; border-bottom: 3px solid transparent; }
.abas a[aria-current='page'] { color: var(--topo-texto); border-bottom-color: var(--topo-texto); }
.aviso { background: var(--aviso-bg); color: var(--aviso-tx); padding: 8px 12px; border-radius: 4px; margin: 8px 0 0; font-size: 0.85rem; }

h2 { margin: 20px 0 8px; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--suave); }
.prosa h2 { margin: 28px 0 8px; font-size: 1.15rem; letter-spacing: 0; text-transform: none; color: var(--texto); }
.prosa li { margin-bottom: 6px; }

.lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.dia h3 { margin: 20px 0 8px; font-size: 0.85rem; }
.dia h3::first-letter { text-transform: uppercase; }

.evento.com-hora { display: grid; grid-template-columns: 3rem minmax(0, 1fr); gap: 0 8px; }
.evento-hora { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; font-size: 0.8rem; font-weight: 700; }
.com-hora > .evento-hora { text-align: right; padding-top: 11px; }
.evento-corpo > .evento-hora { display: block; margin-bottom: 4px; }
.evento-corpo, .noticia { min-width: 0; overflow-wrap: anywhere; background: var(--cartao); border: 1px solid var(--linha); border-radius: 4px; padding: 10px 12px; }
.evento-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: 0 0 4px; font-size: 0.75rem; color: var(--suave); }
.tipo { border: 1px solid currentColor; border-radius: 2px; padding: 0 5px; color: var(--texto); font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
.icone { width: 1em; height: 1em; vertical-align: -0.125em; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.evento-titulo { margin: 0; font-size: 0.95rem; font-weight: 600; line-height: 1.3; }
.local, .ementa, .datas-ato { margin: 4px 0 0; font-size: 0.85rem; }
.datas-ato { color: var(--suave); font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.status-removido .evento-titulo { text-decoration: line-through; }
.em-destaque { outline: 3px solid var(--link); outline-offset: 2px; }
.evento details { margin-top: 4px; font-size: 0.8rem; }
.evento summary { min-height: 44px; padding: 11px 0; cursor: pointer; color: var(--link); }

.bloco-fontes { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0 12px; margin: 10px -12px -10px; padding: 0 12px; background: var(--fundo); border-top: 1px solid var(--linha); border-radius: 0 0 3px 3px; font-size: 0.8rem; }
.selo { margin: 0; font-size: 0.7rem; font-weight: 700; }
.fontes { order: 3; flex: 1 0 100%; list-style: none; margin: 0; padding: 0; }
.fontes a, .permalink { display: inline-flex; align-items: center; min-height: 44px; }
.permalink { color: var(--suave); font-size: 0.72rem; }

.caixa-filtros { margin: 0 0 8px; }
.caixa-filtros > summary { width: fit-content; min-height: 44px; padding: 9px 14px; border: 1px solid var(--borda-campo); border-radius: 4px; background: var(--cartao); color: var(--link); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.filtros { display: grid; grid-template-columns: 1fr 1fr; align-items: end; gap: 10px 12px; margin: 10px 0 16px; font-size: 0.8rem; }
.filtros label { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-weight: 600; }
.filtros input, .filtros select, .filtros button, .mais button { width: 100%; min-height: 44px; padding: 6px 8px; border: 1px solid var(--borda-campo); border-radius: 4px; background: var(--cartao); color: var(--texto); font: inherit; font-size: 1rem; }
.filtros button, .mais button { font-weight: 700; cursor: pointer; }
.filtros > a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; }
.mais { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin: 20px 0 0; font-size: 0.8rem; color: var(--suave); }
.mais button { width: auto; padding: 6px 16px; }
.mais a { display: inline-flex; align-items: center; min-height: 44px; }

.aviso-imprensa { margin: 0 0 12px; padding: 8px 12px; background: var(--cartao); border: 1px solid var(--linha); border-left: 4px solid var(--suave); border-radius: 4px; font-size: 0.85rem; }
.noticia .evento-titulo a { display: inline-block; padding: 4px 0; }
.noticia .local { color: var(--suave); font-size: 0.75rem; }
.vazio { color: var(--suave); }

.rodape { margin-top: 40px; padding-top: 16px; padding-bottom: 32px; border-top: 1px solid var(--linha); color: var(--suave); font-size: 0.8rem; }
.rodape p { margin: 0; }

@media (min-width: 40rem) {
  .filtros { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .filtros button { grid-column: 1; }
  .filtros > a { justify-content: flex-start; }
}

@media (min-width: 60rem) {
  @supports selector(:has(*)) {
    #painel-linha:has(.destaques > section:not([hidden])) { max-width: none; display: grid; grid-template-columns: minmax(0, 1fr) 20rem; align-items: start; gap: 0 32px; }
    #painel-linha:has(.destaques > section:not([hidden])) > .cronologia { grid-column: 1; grid-row: 1; }
    #painel-linha:has(.destaques > section:not([hidden])) > .destaques { grid-column: 2; grid-row: 1; position: sticky; top: 0; max-height: 100vh; overflow-y: auto; margin: 0 -6px; padding: 0 6px 16px; }
  }
}

@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/site/contraste.test.ts`
Expected: todos passam (1 teste de paridade, 22 de contraste, 1 de cores soltas e 5 guardas).

- [ ] **Step 5: Commit**

```bash
git add site/style.css tests/site/contraste.test.ts
git commit -m "feat(site): folha de estilo da direção Registro, com teste de contraste

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verificação completa

**Files:**
- Modify: só o que a verificação apontar em `site/style.css`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 4.

- [ ] **Step 1: Verificação automática**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck limpo, todos os testes passam, build gera `dist/`.

- [ ] **Step 2: Peso**

Run: `ls -l dist/assets/ && wc -c site/style.css`
Expected: CSS do build abaixo de 8 kB. JS no máximo 2 kB acima do build de `main` (cerca de 95 kB). Se passar do limite, parar e relatar o número.

- [ ] **Step 3: Subir o site de desenvolvimento**

Criar `.claude/launch.json` se não existir, com uma configuração `site` (`npm run dev`, porta 5173), e abrir pela ferramenta de preview. Não usar o Bash para o servidor.

- [ ] **Step 4: Conferir no celular (375 × 667 e 320 de largura)**

Em `http://localhost:5173`:
- O cartão do "Último registro" começa dentro da primeira tela em 375 × 667.
- As três abas cabem em uma linha em 375 px.
- Em 320 px, `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (sem rolagem horizontal), inclusive com os títulos longos em maiúsculas do Diário Oficial.
- Abrir os filtros: campos em duas colunas, todos com 44 px de altura.
- Console sem erros e sem avisos de CSP.

- [ ] **Step 5: Conferir no desktop (1280 de largura)**

- Duas colunas: linha do tempo à esquerda, destaques à direita, fixos ao rolar.
- Com `?aba=linha&tipo=ato`: uma coluna só, filtros abertos.
- A lista de próximos compromissos rola por inteiro dentro da coluna e o último link recebe foco por teclado.
- `?aba=noticias` e `sobre.html`: alinhados com o cabeçalho, texto com largura de leitura.
- Percorrer com Tab: foco visível em abas, filtros, links de fonte e "Link permanente".

- [ ] **Step 6: Conferir o tema escuro**

Repetir os passos 4 e 5 com o esquema de cores escuro. A faixa do cabeçalho se separa do fundo pelo fio inferior.

- [ ] **Step 7: Corrigir o que aparecer**

Para cada problema: ajustar `site/style.css`, rodar `npx vitest run tests/site` e conferir de novo no navegador.

- [ ] **Step 8: Verificação final e commit dos ajustes**

Run: `npm run typecheck && npm test && npm run build`
Expected: tudo limpo.

```bash
git add site/style.css .claude/launch.json
git commit -m "fix(site): ajustes do redesenho após conferência no navegador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Se não houver ajuste e o `launch.json` já existir, não fazer commit vazio.

- [ ] **Step 9: Entregar para aprovação**

Enviar capturas de celular e desktop, nos temas claro e escuro, com o resultado dos comandos e os números de peso. Não fazer push nem juntar em `main`.
