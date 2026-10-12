# Painel e quatro telas, fase 1: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o site em quatro páginas (painel, registros, notícias, sobre) na linguagem grafite aprovada, com fontes próprias, tema claro e escuro, linha do tempo com pontos e redirecionamento dos endereços antigos, usando só os dados que o site já carrega.

**Architecture:** `app.ts` é dividido por página (`comum.ts`, `registros.ts`, `noticias.ts`, `painel.ts`), cada página HTML tem a própria entrada (`main-*.ts`) e `index.html` decide, antes de desenhar, se o endereço é antigo e deve ir para outra página. O estilo é reescrito sobre variáveis novas e o teste de contraste passa a medi-las nos dois temas.

**Tech Stack:** TypeScript strict, Vite (várias páginas), vitest com jsdom e axe-core, zod. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-12-painel-e-quatro-telas-design.md`. Referência visual: o código dos esboços aprovados em `.superpowers/esbocos/*.dc.html` (estilos inline com os valores exatos de espaçamento, tamanho e cor do tema escuro).

## Global Constraints

- Texto vindo de `data/` entra no DOM só por `textContent`/`append(string)`. Nunca `innerHTML`, `outerHTML`, `insertAdjacentHTML`.
- Nenhum atributo `style`, `<style>`, script inline ou manipulador inline, nem criado por JavaScript. Tamanho e cor variáveis saem de classes.
- CSP do build, exata: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'`.
- Sem recurso de terceiros em tempo de execução. Sem dependência nova em `package.json`.
- Caminhos relativos em tudo. Links externos só `https`, por `urlHttpsSegura`.
- Ids que continuam: `ultima-novidade`, `aviso-desatualizado`, `aviso-fontes`, `aviso-incompleto`, `aba-linha`, `aba-noticias`, `conteudo`, `painel-linha`, `bloco-proximos`, `proximos`, `caixa-filtros`, `filtros`, `periodo`, `linha-do-tempo`, `mais-dias`, `mais-antigos`, `painel-noticias`, `lista-noticias`. Removidos: `bloco-ultimo`, `ultimo-registro`.
- Classes de `render.ts` não são renomeadas.
- Contraste 4,5:1 em texto e 3:1 em borda de campo e em marcador, nos dois temas. Alvos de toque de 44 px (compactos só em `@media (hover: hover) and (pointer: fine)`). Foco visível. Títulos em ordem.
- Tipo e status nunca só por cor: agenda é círculo, ato é losango, sempre com rótulo de texto.
- Nenhuma frase existente de `site/sobre.html` é alterada ou removida.
- Não tocar em `src/`, `config/`, `data/`, `scripts/` (outra sessão trabalha neles na branch `redesenho-dados`). Exceção: nenhuma.
- Interface, testes e commits em português do Brasil, `tipo(escopo): resumo`. Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Sem `git push` e sem junção em `main`.
- Antes de cada commit: `npm run typecheck && npm test`.

## Review Focus

1. **Endereço antigo com âncora e sem consulta** (`/#ev-abc`): vai para `registros.html#ev-abc`. Teste na Task 2.
2. **Laço de redirecionamento**: `registros.html` e `noticias.html` nunca redirecionam; `index.html` sem consulta nem âncora de registro não redireciona. Teste na Task 2.
3. **`data/resumo.json` ausente, inválido ou com campo faltando**: o bloco de números fica oculto, sem aviso de dados incompletos. Teste na Task 3.
4. **Virada de mês e de ano na linha do tempo** (hoje = 03/01): os 21 dias cruzam o mês anterior, que já está carregado, e nenhum dia some nem repete. Teste na Task 3.
5. **Período sem nenhum registro** (21 dias vazios): a linha do tempo mostra os 21 pontos pequenos, o dia de hoje selecionado e a frase de vazio, sem erro. Teste na Task 3.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `site/fontes/*.woff2`, `site/fontes/LEIA-ME.md`, `site/fontes/OFL-*.txt` | Fontes e licenças |
| `site/index.html` | Painel |
| `site/registros.html`, `site/noticias.html` | Páginas novas |
| `site/src/comum.ts` | Última alteração e os três avisos |
| `site/src/registros.ts` | Lista de registros (o `montar` atual, sem notícias e sem último registro) |
| `site/src/noticias.ts` | Página de notícias |
| `site/src/painel.ts` | Números do topo, linha do tempo com pontos, detalhe do dia |
| `site/src/redirecionar.ts` | Função pura que decide o destino de um endereço antigo |
| `site/src/main-painel.ts`, `main-registros.ts`, `main-noticias.ts` | Uma entrada por página |
| `site/src/app.ts`, `site/src/main.ts` | Apagados |

---

### Task 1: Fontes hospedadas e CSP

**Files:**
- Create: `site/fontes/bricolage-grotesque-700.woff2`, `site/fontes/ibm-plex-sans-400.woff2`, `site/fontes/ibm-plex-sans-600.woff2`, `site/fontes/ibm-plex-mono-500.woff2`, `site/fontes/OFL-bricolage-grotesque.txt`, `site/fontes/OFL-ibm-plex.txt`, `site/fontes/LEIA-ME.md`
- Modify: `site/style.css` (acrescentar `@font-face` no topo), `vite.config.ts` (constante `CSP`), `tests/site/build.test.ts`, `tests/site/contraste.test.ts`

**Interfaces:**
- Produces: famílias CSS `'Bricolage Grotesque'` (700), `'IBM Plex Sans'` (400, 600), `'IBM Plex Mono'` (500), usadas pela Task 6.

- [ ] **Step 1: Testes que falham.** Em `build.test.ts`: trocar `CSP_ESPERADA` pela CSP das Global Constraints; a lista de páginas conferidas continua `index` e `sobre` por enquanto; acrescentar um teste que, depois do build, encontra em `dist/assets/` exatamente quatro arquivos `.woff2` somando no máximo 90.000 bytes, e que o CSS gerado só referencia `url(` para caminhos relativos terminados em `.woff2`. Em `contraste.test.ts`, no teste `'não carrega nada de fora do site'`: continuar proibindo `@import`; exigir que todo `url(...)` case com `url('./fontes/<nome>.woff2')`; exigir quatro blocos `@font-face`, todos com `font-display: swap`.
- [ ] **Step 2:** `npx vitest run tests/site/build.test.ts tests/site/contraste.test.ts` e ver falhar.
- [ ] **Step 3: Obter os arquivos.** Numa pasta temporária fora do repositório: `npm pack @fontsource/bricolage-grotesque@5.3.0 @fontsource/ibm-plex-sans@5.3.0 @fontsource/ibm-plex-mono@5.3.0`, extrair os `.tgz` e copiar `files/bricolage-grotesque-latin-700-normal.woff2`, `files/ibm-plex-sans-latin-400-normal.woff2`, `files/ibm-plex-sans-latin-600-normal.woff2` e `files/ibm-plex-mono-latin-500-normal.woff2` para `site/fontes/` com os nomes da lista acima. Copiar o arquivo de licença de cada pacote para `OFL-bricolage-grotesque.txt` e `OFL-ibm-plex.txt`. Não alterar `package.json` nem `package-lock.json`. `LEIA-ME.md` diz, para cada arquivo: pacote, versão 5.3.0, subconjunto latino, peso, licença OFL-1.1.
- [ ] **Step 4: `@font-face`.** No topo de `style.css`, quatro blocos no formato `@font-face { font-family: 'IBM Plex Sans'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fontes/ibm-plex-sans-400.woff2') format('woff2'); }`. Não aplicar as famílias a nenhum seletor ainda.
- [ ] **Step 5: CSP.** Em `vite.config.ts`, acrescentar `font-src 'self';` entre `img-src` e `connect-src`.
- [ ] **Step 6:** `npm run typecheck && npm test && npm run build` limpos.
- [ ] **Step 7: Commit** `feat(site): fontes hospedadas no próprio site e font-src na CSP`.

---

### Task 2: Quatro páginas, módulos por página e redirecionamento

**Files:**
- Create: `site/registros.html`, `site/noticias.html`, `site/src/comum.ts`, `site/src/registros.ts`, `site/src/noticias.ts`, `site/src/redirecionar.ts`, `site/src/main-painel.ts`, `site/src/main-registros.ts`, `site/src/main-noticias.ts`, `tests/site/redirecionar.test.ts`, `tests/site/noticias.test.ts`, `tests/site/paginas.test.ts`
- Rename: `tests/site/app.test.ts` → `tests/site/registros.test.ts` (com `git mv`)
- Modify: `site/index.html`, `site/sobre.html` (só a navegação), `site/src/render.ts` (link permanente), `site/src/params.ts`, `site/src/dados.ts`, `vite.config.ts`, `tests/site/params.test.ts`, `tests/site/dados.test.ts`, `tests/site/dados-dev.test.ts` se usar `aba`, `tests/site/render.test.ts`, `tests/site/sobre.test.ts`, `tests/site/build.test.ts`
- Delete: `site/src/app.ts`, `site/src/main.ts`

**Interfaces:**
- Produces:
  - `comum.ts`: `montarComum(doc: Document, dados: Pick<Dados, 'estado' | 'incompleto'>, agora: Date): void` (preenche `#ultima-novidade` e os três avisos; código movido de `app.ts` sem mudar textos).
  - `registros.ts`: `montarRegistros(doc: Document, dados: Dados, f: Filtros, hoje: string, agora: Date): void` e `irParaAncora(doc: Document, hash: string): void`.
  - `noticias.ts`: `montarNoticias(doc: Document, dados: Dados, agora: Date): void` (nesta task só preenche `#lista-noticias` como hoje; o layout novo é da Task 4).
  - `redirecionar.ts`: `destinoAntigo(search: string, hash: string): string | null`.
  - `params.ts`: `Filtros` sem o campo `aba`.
  - `dados.ts`: `carregarDados(f: Filtros, opcoes?: { noticias?: boolean }): Promise<Dados>`.
  - Navegação igual nas quatro páginas: `<a href="./">Painel</a>`, `<a id="aba-linha" href="registros.html">Registros</a>`, `<a id="aba-noticias" href="noticias.html">Notícias</a>`, `<a href="sobre.html">Sobre</a>`, com `aria-current="page"` fixo no HTML da página correspondente. A marca do site, à esquerda, é `<a class="marca" href="./">Rastreador do Presidente</a>`.

- [ ] **Step 1: `redirecionar.test.ts` (falha).** Casos, todos com caminho relativo no resultado:
  - `('', '')` → `null`; `('?utm=x', '')` → `null`; `('', '#conteudo')` → `null`.
  - `('?aba=noticias', '')` → `'noticias.html'`; `('?aba=noticias&tipo=ato', '#x')` → `'noticias.html'`.
  - `('?aba=linha', '')` → `'registros.html'`.
  - `('?de=2026-10-08&ate=2026-10-08', '#ev-agenda-2026-10-08-10-00-1')` → `'registros.html?de=2026-10-08&ate=2026-10-08#ev-agenda-2026-10-08-10-00-1'`.
  - `('?aba=linha&tipo=ato&status=publicado', '')` → `'registros.html?tipo=ato&status=publicado'` (o parâmetro `aba` não é repassado; os demais são repassados como vieram, sem validar: quem valida é `lerFiltros` na página de destino).
  - `('', '#ev-abc')` → `'registros.html#ev-abc'`.
  - O resultado nunca começa com `/`, `//` nem contém `:` antes do primeiro `?`, mesmo com `search = '?de=//evil.example'` ou `hash = '#ev-//evil.example'`.
- [ ] **Step 2: Implementar `destinoAntigo`** com `URLSearchParams`: `aba === 'noticias'` vence; senão, se existir qualquer um de `aba`, `de`, `ate`, `tipo`, `status` ou `hash.startsWith('#ev-')`, devolve `'registros.html'` + consulta sem `aba` (omitida se vazia) + hash; senão `null`.
- [ ] **Step 3: `paginas.test.ts` (falha).** Para `index.html`, `registros.html`, `noticias.html`, `sobre.html`: um só `<h1>`; link de pular para `#conteudo` e `main#conteudo`; a navegação tem os quatro links na ordem e com os `href` das Interfaces; exatamente um `aria-current="page"`, no link da própria página; rodapé com "Projeto independente, sem vínculo com o governo."; `<link rel="stylesheet" href="./style.css">`; nenhum `style=` nem `on*=`; ids únicos; axe sem violações. `registros.html` contém todos os ids de registros da lista das Global Constraints e não contém `bloco-ultimo` nem `ultimo-registro`; `noticias.html` contém `painel-noticias` e `lista-noticias`.
- [ ] **Step 4: HTML.** `registros.html` nasce do `index.html` atual: `<title>Registros — Rastreador do Presidente</title>`, `<h1>Registros</h1>` dentro de `main` (o nome do site no cabeçalho deixa de ser `h1` e vira `a.marca`), `#ultima-novidade` logo abaixo do `h1`, sem `#painel-noticias`, sem `#bloco-ultimo`; o agrupador `.destaques` vira `<aside class="lateral">` com `#bloco-proximos`; o `input hidden name="aba"` sai; "Limpar filtros" e "Ver meses anteriores" apontam para `registros.html`; script `./src/main-registros.ts`. `noticias.html`: `<h1>O que a imprensa publica</h1>`, `#ultima-novidade`, `div#painel-noticias` com o aviso de imprensa e `ul#lista-noticias`; script `./src/main-noticias.ts`. `index.html`: por enquanto só cabeçalho, avisos, `main#conteudo` com `<h1>A agenda e os atos do presidente, com a fonte de cada registro.</h1>`, `#ultima-novidade` e rodapé; script `./src/main-painel.ts`. `sobre.html`: só a navegação e a marca mudam. Os três avisos ficam em `header.topo > .avisos` nas três páginas com dados.
- [ ] **Step 5: Código.** Mover para `comum.ts` o que trata de última alteração e avisos. `registros.ts` recebe o resto de `montar` (sem o ramo de notícias, sem `ultimoRegistro`, sem mexer em `aria-current`); a função `mais-antigos` gera a consulta sem `aba`. `noticias.ts` recebe o ramo de notícias. `main-registros.ts` e `main-noticias.ts` repetem o padrão do `main.ts` atual (carregar, montar, tratar erro em `#aviso-fontes`); `main-noticias` chama `carregarDados({}, { noticias: true })`. `main-painel.ts`: primeiro `const destino = destinoAntigo(location.search, location.hash); if (destino) { location.replace(destino); return; }`, depois `montarComum`. `render.ts`: o link permanente passa a `registros.html?de=...&ate=...#ev-...`. `filtrar.ts`: remover `ultimoRegistro` se ninguém mais usar. `vite.config.ts`: as quatro páginas em `rollupOptions.input`.
- [ ] **Step 6: Ajustar os testes existentes.** `registros.test.ts`: `PAGINA` lê `site/registros.html`, `montar` vira `montarRegistros`, os filtros perdem `aba`; os testes que tratam de notícias vão para `noticias.test.ts` (com `site/noticias.html`); os que tratam de "Último registro" e do agrupador `.destaques` são reescritos para o que vale agora (lateral só com próximos; lateral oculta quando não há próximos nem filtro... ver abaixo); os `href` esperados de "meses anteriores" e do link permanente perdem `aba=linha` e ganham `registros.html`. `params.test.ts`, `dados.test.ts`, `render.test.ts`, `sobre.test.ts` (o teste de navegação igual passa a comparar com `paginas.test.ts` ou é removido por duplicar), `build.test.ts` (as quatro páginas no laço da CSP).
  Regra da lateral: `#bloco-proximos` fica `hidden` quando não há próximos ou quando há filtro, como hoje.
- [ ] **Step 7:** `npm run typecheck && npm test && npm run build` limpos. Nenhum teste é apagado sem equivalente: o relatório lista cada teste removido ou reescrito e o motivo.
- [ ] **Step 8: Commit** `feat(site): quatro páginas com entrada própria e redirecionamento dos endereços antigos`.

---

### Task 3: Painel (números do topo e linha do tempo com pontos)

**Files:**
- Create: `site/src/painel.ts`, `tests/site/painel.test.ts`
- Modify: `site/index.html`, `site/src/dados.ts`, `site/src/main-painel.ts`, `tests/site/dados.test.ts`

**Interfaces:**
- Consumes: `montarComum`, `carregarDados`, `el`, `formatarDataLonga`, `formatarDataCurta`.
- Produces:
  - `dados.ts`: `Dados.resumo?: Resumo`, com `ResumoSchema = z.object({ total: z.number().int().nonnegative(), porTipo: z.object({ agenda: z.number().int().nonnegative(), ato: z.number().int().nonnegative(), comunicado: z.number().int().nonnegative() }), desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })`; `carregarDados(f, { resumo: true })` lê `data/resumo.json` e, em qualquer falha, deixa `resumo` indefinido **sem** marcar `incompleto`.
  - `painel.ts`: `interface DiaPainel { data: string; agenda: number; atos: number; comunicados: number; itens: Evento[] }`, `diasDoPainel(eventos: Evento[], hoje: string, n?: number): DiaPainel[]`, `faixaDeTamanho(n: number): 0 | 1 | 2 | 3 | 4 | 5`, `montarPainel(doc: Document, dados: Dados, hoje: string, agora: Date): void`.

Regras:
- `diasDoPainel`: os `n` (padrão 21) dias de calendário que terminam em `hoje`, do mais antigo ao mais recente, sem pular dia. `agenda` conta eventos de tipo `agenda` com status diferente de `removido`; `atos` conta tipo `ato`; `comunicados` conta tipo `comunicado`. `itens`: até três, os atos primeiro (ordem de `id`), depois a agenda por hora.
- `faixaDeTamanho`: 0 → 0; 1 → 1; 2 a 3 → 2; 4 a 6 → 3; 7 a 10 → 4; 11 ou mais → 5.
- Marcação: `ol#linha-dias` dentro de `div#linha-rolagem`; cada dia é `li > button.dia[type=button][data-dia=AAAA-MM-DD][aria-pressed]` com `aria-label` = data por extenso + `: ` + contagens por extenso (`1 compromisso, 3 atos`; comunicados só quando houver); dentro, `span.marca.marca-ato.tam-N` e `span.marca.marca-agenda.tam-N` (só quando a contagem é maior que zero), `span.marca.marca-vazio` quando o dia não tem nada, `span.dia-num` (dia com dois dígitos) e `span.dia-mes` (abreviação do mês, só no primeiro botão e no dia 1). Todos os `span` com `aria-hidden="true"`.
- Detalhe: `div#detalhe-dia[aria-live=polite]` com `h3` (data por extenso, primeira letra maiúscula), `p.detalhe-resumo` (contagens), `ul.detalhe-itens` (cada `li` com `span.quando` = hora ou `Ato` ou `Comunicado`, e o título por `textContent`) e `a` "Ver os registros do dia, com as fontes" para `registros.html?de=D&ate=D`. Dia vazio: `p.vazio` "Nenhum registro publicado pelas fontes neste dia.", sem lista e sem link.
- Seleção inicial: o dia mais recente com algum registro; se nenhum tiver, `hoje`. Clique, foco e `mouseenter` selecionam.
- Rolagem: ao montar, `#linha-rolagem.scrollLeft = scrollWidth`. Arrastar com o mouse (`mousedown`, `mousemove`, `mouseup`, `mouseleave` em `#linha-rolagem`) altera `scrollLeft`.
- Números: `dl#resumo[hidden]` com três pares (`total` e "registros desde DD/MM/AAAA"; `porTipo.agenda` e "compromissos na agenda"; `porTipo.ato` e "atos no Diário Oficial"), formatados em `pt-BR`. Sem `dados.resumo`, continua `hidden` e vazio.
- `index.html` ganha, dentro de `main`: `dl#resumo`, `section[aria-labelledby=t-linha]` com `h2#t-linha` "Linha do tempo", a legenda (círculo "Compromisso da agenda", losango "Ato oficial", "O tamanho indica a quantidade no dia. Arraste para ver outros dias."), `#linha-rolagem > ol#linha-dias` e `#detalhe-dia`.

- [ ] **Step 1: `painel.test.ts` (falha).** Casos:
  - `diasDoPainel`: 21 itens consecutivos terminando em `hoje`; com `hoje = '2026-01-03'` começa em `2025-12-14` sem repetir nem pular; contagens por tipo; `removido` fora da agenda; `itens` com no máximo três, atos antes.
  - `faixaDeTamanho` nos limites 0, 1, 2, 3, 4, 6, 7, 10, 11, 500.
  - `montarPainel`: 21 botões; `aria-label` exato de um dia com 1 compromisso e 3 atos e de um dia vazio; classes `tam-N` corretas; nenhum atributo `style` em todo o documento; o dia mais recente com registro começa com `aria-pressed="true"` e os demais `"false"`.
  - Seleção por `click`, por `focus` e por `mouseenter` troca `aria-pressed` e o conteúdo de `#detalhe-dia`; o link do detalhe aponta para `registros.html?de=D&ate=D`.
  - 21 dias sem registro: 21 `marca-vazio`, `hoje` selecionado, frase de vazio.
  - Título hostil (`<img src=x onerror=alert(1)>`) aparece como texto no detalhe; nenhum `img` nem `script` criado.
  - Resumo presente: `#resumo` visível com `8.540`, `5.468`, `3.044` e "registros desde 01/01/2023". Resumo ausente: `#resumo.hidden`.
  - axe sem violações com e sem resumo.
- [ ] **Step 2:** em `dados.test.ts` (falha): `resumo.json` válido é lido; 404, JSON inválido e campo faltando deixam `resumo` indefinido e `incompleto` em `false`; sem a opção `resumo`, o arquivo nem é pedido.
- [ ] **Step 3:** implementar `dados.ts`, `painel.ts`, o HTML e `main-painel.ts` (`carregarDados({}, { resumo: true })`, depois `montarComum` e `montarPainel`).
- [ ] **Step 4:** `npm run typecheck && npm test && npm run build` limpos.
- [ ] **Step 5: Commit** `feat(site): painel com números do topo e linha do tempo com pontos`.

---

### Task 4: Notícias no layout novo

**Files:**
- Modify: `site/noticias.html`, `site/src/noticias.ts`, `site/src/render.ts` (se `renderNoticia` precisar de nível de título), `tests/site/noticias.test.ts`

**Interfaces:**
- Produces: `montarNoticias` preenche três áreas: `article#noticia-destaque`, `ol#lista-noticias` e `div#noticias-veiculos`.

Regras:
- As notícias são ordenadas por `data`, da mais recente para a mais antiga.
- Destaque: a primeira. Mostra "Mais recente", veículo, data e hora, e o título em `h2` como link (`linkOuTexto`, que já recusa URL que não seja `https`).
- Lista: as cinco seguintes, cada uma com veículo, data e título em `h2`.
- Por veículo: **todas as restantes**, agrupadas por `veiculo`; os grupos em ordem de quantidade (desempate alfabético); cada grupo com `h3` do veículo e a lista dos títulos com data. Nenhuma notícia aparece duas vezes e nenhuma some: destaque + lista + grupos = total.
- Sem notícias: `#noticia-destaque` e `#noticias-veiculos` ficam `hidden` e a lista mostra "Nenhuma notícia disponível no momento.".
- A seção "por veículo" tem `h2` "Mais notícias, por veículo" e fica `hidden` quando não sobra nenhuma.

- [ ] **Step 1: testes (falha):** 1, 3, 6 e 40 notícias (contagem de links = total; nenhum `href` repetido); ordem por data mesmo com entrada embaralhada; grupos ordenados por quantidade; lista vazia; URL `javascript:` vira texto; título hostil vira texto; ordem de títulos `h1 → h2 → h3`; axe.
- [ ] **Step 2:** implementar.
- [ ] **Step 3:** `npm run typecheck && npm test` limpos.
- [ ] **Step 4: Commit** `feat(site): notícias com destaque, lista e grupos por veículo`.

---

### Task 5: Sobre

**Files:**
- Modify: `site/sobre.html`, `tests/site/sobre.test.ts`

Regras:
- O `h1` passa a ser `Sobre`; o `<title>` continua "Sobre e metodologia — Rastreador do Presidente". Abaixo do `h1`, uma linha: "Projeto independente, sem vínculo com o governo, feito só com fontes públicas."
- Entra uma seção nova "Como funciona", logo depois do cabeçalho da página, com três itens numerados (`ol.passos`), cujo texto é feito **só de frases que já existem na página**, copiadas sem alteração:
  1. Fontes: "Os dados vêm somente de fontes oficiais públicas e da imprensa."
  2. Coleta: "O site busca novidades a cada cerca de 10 minutos; fontes públicas podem demorar a publicar."
  3. Publicação: "Todo item tem link para o dado de origem. Item sem fonte pública não é publicado."
- Todas as seções e frases atuais continuam no lugar e na ordem em que estão. Nenhuma é removida, mesmo as que os três itens repetem.
- Na lista "O que cada status significa", cada item ganha o ícone correspondente como `<svg class="icone" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="..."></path></svg>`, com os mesmos desenhos de `site/src/icones.ts` (relógio para Agendado, lista para Consta na agenda, visto para Realizado, balão para Publicado no site do Planalto, documento para Publicado no Diário Oficial, lápis para Alterado, cortado para Removido). O texto dos itens não muda.
- A seção de limites ganha a classe `limites` no elemento que a envolve.

- [ ] **Step 1: testes (falha):** `h1` é "Sobre"; a linha de descrição existe; `ol.passos` tem três itens com as frases exatas; cada frase dos passos também continua existindo no restante da página; sete ícones na lista de status, cada `d` igual ao de `ICONES` correspondente; todos os testes de frases já existentes continuam passando sem alteração de expectativa.
- [ ] **Step 2:** editar o HTML. `git diff site/sobre.html` não pode mostrar nenhuma linha de texto removida além do `h1` antigo.
- [ ] **Step 3:** `npm run typecheck && npm test` limpos.
- [ ] **Step 4: Commit** `feat(site): página Sobre com passos e ícones de status`.

---

### Task 6: Folha de estilo, dois temas e teste de contraste

**Files:**
- Modify: `site/style.css` (reescrito, mantendo os quatro `@font-face` da Task 1), `tests/site/contraste.test.ts`, `site/src/render.ts` e `tests/site/render.test.ts` (só a forma do tipo, abaixo)

**Interfaces:**
- Consumes: toda a marcação das Tasks 2 a 5 e a de `render.ts`.

Variáveis (as 14 nos dois temas; escuro é o padrão em `prefers-color-scheme: dark`, claro em `:root`):

| Variável | Claro | Escuro |
|---|---|---|
| `--fundo` | `#f4f3ef` | `#151514` |
| `--cartao` | `#ffffff` | `#1d1d1b` |
| `--cartao-2` | `#eceae4` | `#252523` |
| `--selecionado` | `#e0ddd4` | `#30302d` |
| `--linha` | `#d6d3cb` | `#383835` |
| `--borda-campo` | `#6f6d66` | `#8f8d86` |
| `--texto` | `#1a1a18` | `#f3f2ee` |
| `--texto-2` | `#33322f` | `#dad8d1` |
| `--suave` | `#55534d` | `#b5b3ab` |
| `--link` | `#1d5a96` | `#a9cdf0` |
| `--agenda` | `#1f5f9e` | `#8dbdea` |
| `--ato` | `#8a5200` | `#ffb866` |
| `--aviso-bg` | `#fff3cd` | `#3a2f08` |
| `--aviso-tx` | `#5c4400` | `#ffe9a8` |

Pares do teste de contraste (mínimo): `texto` sobre `fundo`, `cartao`, `cartao-2`, `selecionado` (4,5); `texto-2` sobre `cartao`, `cartao-2` (4,5); `suave` sobre `fundo`, `cartao`, `cartao-2`, `selecionado` (4,5); `link` sobre `fundo`, `cartao`, `cartao-2` (4,5); `agenda` e `ato` sobre `fundo`, `cartao`, `cartao-2` (4,5) e sobre `selecionado` (3); `aviso-tx` sobre `aviso-bg` (4,5); `borda-campo` sobre `cartao` e `fundo` (3). Todos já passam com os valores acima (menor razão: 4,66 no claro e 5,08 no escuro).

Regras do estilo:
- Transcrever os esboços de `.superpowers/esbocos/` para classes: mesmos tamanhos de fonte, pesos, espaçamentos, raios (16 px nos painéis, 12 px nos cartões, 8 px em campos e etiquetas) e larguras (`max-width: 1160px`, laterais de 24 px). As cores dos esboços correspondem às variáveis da coluna "Escuro".
- Famílias: `'Bricolage Grotesque'` em `h1`, títulos de seção e números grandes; `'IBM Plex Sans'` no corpo; `'IBM Plex Mono'` em horas, datas e contagens. Cada uma com alternativa do sistema.
- Cabeçalho na cor do fundo, com fio inferior; a página atual na navegação leva um traço inferior em `--ato`.
- Marcadores: `.marca-agenda` é círculo em `--agenda`; `.marca-ato` é quadrado girado 45° em `--ato`; `.tam-1` a `.tam-5` definem o lado (agenda: 13, 16, 19, 22, 26 px; ato: 11, 13, 15, 18, 21 px); `.marca-vazio` é um ponto de 6 px em `--linha`. Botão do dia com 150 px de altura, `min-width` de 40 px; o selecionado (`[aria-pressed='true']`) tem fundo `--selecionado` e borda `--agenda`.
- `#linha-rolagem`: `overflow-x: auto`, sem barra visível (`scrollbar-width: none` e `::-webkit-scrollbar { display: none }`), `cursor: grab`.
- Registros: título do dia (`.dia h3`) como etiqueta com fundo `--cartao-2`, borda `--linha` e raio 8 px, seguida de um fio até a borda (pseudo-elemento); filtros com o `summary` em forma de botão; duas colunas só quando `#bloco-proximos` está visível, a partir de 60rem, dentro de `@supports selector(:has(*))`; a lateral é `position: sticky`.
- Cartão de evento: `--cartao` com borda `--linha` e raio 12 px; faixa de fontes em `--cartao-2`; hora em `--agenda`; antes do rótulo do tipo entra a forma (ver abaixo).
- Continuam valendo e continuam testados: `[hidden] { display: none !important; }`; nenhuma cor fora das variáveis; nenhuma reordenação por CSS (`order`, `reverse`); rolagem suave só em `prefers-reduced-motion: no-preference`; nenhum `transition` nem `animation`; alvos de 44 px com a exceção de ponteiro fino.
- Sem rolagem horizontal da página em 320 px.

Forma do tipo no cartão: em `render.ts`, dentro de `span.tipo`, antes do texto, um `span` com `aria-hidden="true"` e classe `marca marca-agenda`, `marca marca-ato` ou `marca marca-comunicado` (comunicado: quadrado sem giro em `--suave`). O texto do rótulo não muda.

- [ ] **Step 1: testes (falha):** atualizar `contraste.test.ts` para as 14 variáveis e os pares acima; manter as guardas existentes (ajustando a guarda das duas colunas para o seletor novo `#painel-linha:has(#bloco-proximos:not([hidden]))`); acrescentar: as cinco classes `tam-N` existem para os dois marcadores; `#linha-rolagem` esconde a barra. Em `render.test.ts`: `span.tipo` contém a forma decorativa certa para cada tipo e o `textContent` continua sendo só o rótulo.
- [ ] **Step 2:** escrever o CSS e a forma do tipo.
- [ ] **Step 3:** `npm run typecheck && npm test && npm run build` limpos. Informar no relatório os bytes do CSS e de cada JS em `dist/assets/` (limites: CSS 12.000; JS da página inicial 110.000).
- [ ] **Step 4: Commit** `feat(site): linguagem grafite nos dois temas`.

---

### Task 7: Verificação no navegador

Feita por quem coordena, com o servidor de desenvolvimento (`site`, porta 5173).

- [ ] Em 320, 375 e 1280 px, nos temas claro e escuro: `./`, `registros.html`, `registros.html?tipo=ato`, `noticias.html`, `sobre.html`. Sem rolagem horizontal da página, console sem erros, fontes carregadas (`document.fonts.check`).
- [ ] Endereços antigos: `/?aba=noticias`, `/?de=2026-10-09&ate=2026-10-09#ev-...` (com um id real) e `/?aba=linha&tipo=ato` chegam à página certa, e o item da âncora fica destacado.
- [ ] Painel: seleção por mouse, clique e Tab; a linha do tempo abre rolada até o dia mais recente; arrastar funciona em 375 px.
- [ ] Teclado: ordem de foco igual à ordem visual em cada página; foco visível nos dois temas.
- [ ] Cada problema vira um despacho de correção com teste. No fim: `npm run typecheck && npm test && npm run build`, revisão final do branch inteiro e capturas das quatro páginas, nos dois temas, para aprovação.
