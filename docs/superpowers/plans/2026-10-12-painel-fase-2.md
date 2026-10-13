# Painel, fase 2: ajustes pedidos e mapa de viagens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar os ajustes pedidos pelo Eduardo depois de ver a fase 1 (título do painel, Sobre centralizado e com outro título, Notícias mais legível) e entregar a seção de viagens com o mapa-múndi, usando `data/viagens.json`.

**Architecture:** A Task 1 mexe só em marcação, estilo e na montagem de Notícias. A Task 2 acrescenta a leitura opcional de `data/viagens.json`, um módulo que monta a lista e o mapa em SVG por DOM, e um arquivo gerado com o contorno dos continentes, carregado em separado.

**Tech Stack:** TypeScript strict, Vite, vitest com jsdom e axe-core, zod. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-12-painel-e-quatro-telas-design.md` (seções "Painel", "Notícias", "Sobre" e "Contrato com o pipeline"). Regras de dados e frases prontas para o Sobre: `docs/regras-painel.md`.

## Global Constraints

- Texto vindo de `data/` entra no DOM só por `textContent`/`append(string)`. Nunca `innerHTML`, `outerHTML`, `insertAdjacentHTML`.
- Nenhum atributo `style`, `<style>`, script inline ou manipulador inline, nem criado por JavaScript. Tamanho e cor variáveis saem de classes. Atributos de geometria de SVG (`cx`, `cy`, `r`, `d`, `x`, `y`, `viewBox`) são permitidos.
- CSP do build, exata: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'`.
- Sem recurso de terceiros em tempo de execução. Sem dependência nova em `package.json`.
- Caminhos relativos. Links externos só `https`, por `urlHttpsSegura`.
- Nenhum id ou classe existente é renomeado ou removido, salvo onde esta tarefa disser.
- Cores só pelas variáveis de `:root` (claro) e do bloco `prefers-color-scheme: dark`; nenhuma cor literal fora deles. Sem `order`, direções invertidas, `transition`, `animation`, `@import`, nem `url()` além das quatro fontes.
- Contraste 4,5:1 em texto e 3:1 em marcador, nos dois temas. Alvos de toque de 44 px (compactos só em `@media (hover: hover) and (pointer: fine)`). Foco visível. Títulos em ordem.
- `site/sobre.html` diz a verdade sobre o que o código faz; frases existentes só mudam onde esta tarefa disser.
- Não tocar em `src/`, `config/`, `data/` (são do pipeline). Importar de `src/shared/` é permitido.
- Sem rolagem horizontal da página em 320 px.
- Interface, testes e commits em português do Brasil, `tipo(escopo): resumo`. Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Sem `git push` e sem junção em `main`.
- Antes de cada commit: `npm run typecheck && npm test && npm run build`. Limites: CSS até 15.000 bytes; JS que a página inicial carrega sem o mapa até 110.000 bytes; o pedaço do mapa até 60.000 bytes.

## Review Focus

1. **`data/viagens.json` ausente, inválido, vazio ou com um item inválido no meio**: a seção de viagens fica oculta (ausente, inválido, vazio) ou mostra só os itens válidos (um inválido), sem aviso de dados incompletos. Teste na Task 2.
2. **Cidade com nome hostil** (`<img src=x onerror=alert(1)>`): aparece como texto na lista e no rótulo do mapa. Teste na Task 2.
3. **Falha ao carregar o pedaço do contorno do mapa**: a lista de cidades continua visível e a área do mapa some, sem erro na tela. Teste na Task 2.
4. **Uma só notícia, e veículo com uma só notícia**: Notícias mostra o destaque sem grade vazia; o cartão do veículo não mostra o "ver mais". Teste na Task 1.
5. **Coordenadas nos limites** (lon −180 e 180, lat perto de 80 e de −58): o ponto cai dentro do `viewBox`. Teste na Task 2.

---

### Task 1: Ajustes do painel, do Sobre e de Notícias

**Files:**
- Modify: `site/index.html`, `site/sobre.html`, `site/noticias.html`, `site/src/noticias.ts`, `site/style.css`, `tests/site/noticias.test.ts`, `tests/site/sobre.test.ts`, `tests/site/paginas.test.ts`, `tests/site/painel.test.ts` (só se algum teste citar o título antigo), `tests/site/contraste.test.ts` (só se uma guarda depender de seletor alterado), `docs/superpowers/specs/2026-10-12-painel-e-quatro-telas-design.md`

**Interfaces:**
- Produces: `montarNoticias(doc, dados, agora)` com a mesma assinatura; novas constantes exportadas de `noticias.ts`: `NOTICIAS_NA_GRADE = 6`, `VEICULOS_A_VISTA = 8`.

**Painel.** O `<h1>` de `site/index.html` passa a ser exatamente `A agenda e os atos do presidente`.

**Sobre.**
- O `<h1>` passa a ser `Como este site funciona`. O `<title>` não muda. A linha de descrição logo abaixo fica como está.
- O `<h2>Como funciona</h2>` que antecede os três passos passa a ser `<h2>Em três passos</h2>` (para não repetir o título da página).
- Layout: os três passos continuam ocupando a largura toda do conteúdo. Todo o resto do texto (o `h1`, a descrição e as seções "O que é", "De onde vêm os dados", status, limites, código aberto) fica numa coluna de leitura de no máximo 720 px **centralizada** na página (`margin-inline: auto`), com o texto alinhado à esquerda dentro dela. Os títulos dos passos e o `h2` "Em três passos" alinham com a borda esquerda da grade de passos.
- Acrescentar à lista de limites, depois do item que fala do painel, dois itens com estas frases exatas (vêm de `docs/regras-painel.md`):
  - `Os números do alto do painel contam tudo o que está guardado no site: compromissos da agenda, atos do Diário Oficial e comunicados do Planalto, desde 01/01/2023. Compromisso que saiu da agenda oficial continua na contagem, porque continua guardado e aparece nos registros como "Removido da agenda".`
  - `O site não mostra gastos. As fontes públicas oficiais (Portal da Transparência) publicam cartão de pagamento, diárias, passagens e despesas por órgão, e o órgão "Presidência da República" inclui centenas de servidores. Gasto do órgão não é gasto do presidente, e mostrar um como se fosse o outro seria enganoso.`
- Nenhuma outra frase muda.

**Notícias.** A página passa a ter três blocos, um abaixo do outro, todos na largura do conteúdo:
1. **Destaque** (`article#noticia-destaque`): a mais recente, como hoje, em largura total.
2. **Grade** (`ol#lista-noticias.lista.noticias-grade`): as `NOTICIAS_NA_GRADE` (6) seguintes, em cartões; 3 colunas a partir de 60rem, 2 a partir de 40rem, 1 abaixo disso. O agrupador `div.noticias-topo` deixa de existir (a grade sai de dentro dele e fica logo abaixo do destaque); remover também as regras de CSS dele.
3. **Por veículo** (`div#noticias-veiculos`, com o `h2` "Mais notícias, por veículo"): as restantes, agrupadas por veículo, do veículo com mais itens para o com menos (desempate alfabético em `pt-BR`). Cada cartão (`section.veiculo`) mostra o nome do veículo em `h3` e **só a notícia mais recente dele** (título com link e data). Se o veículo tiver mais itens, abaixo vem `<details class="veiculo-mais">` com `<summary>` `Mais 1 notícia` ou `Mais N notícias` e, dentro, a lista das outras, da mais recente para a mais antiga. Veículo com um item só não tem `<details>`.
   Só os `VEICULOS_A_VISTA` (8) primeiros cartões ficam à vista. Os demais veículos vão dentro de um `<details class="veiculos-outros">` que ocupa a linha inteira da grade, com `<summary>` `Outros 1 veículo` ou `Outros N veículos`, contendo os cartões restantes na mesma marcação. Com 8 veículos ou menos, esse `<details>` não existe.
- Nenhuma notícia some e nenhuma aparece duas vezes: destaque + grade + todos os cartões (visíveis ou dentro de `<details>`) = total.
- `summary` com 44 px de altura mínima e `cursor: pointer`; os cartões de veículo com menos espaçamento que hoje, para a seção ficar compacta.
- No documento de desenho, seção "Notícias (`noticias.html`)", trocar a descrição do layout por estas regras (destaque, grade de seis, veículos com a mais recente à vista e o resto em "Mais N notícias", só oito veículos à vista). Na mesma revisão do documento: remover a "Fase 3, gastos" da lista de fases e a linha de gastos do painel, dizendo em uma frase que o site não mostra gastos e por quê (referência: `docs/regras-painel.md`); e trocar o título do painel citado, se houver.

- [ ] **Step 1: testes que falham.** `noticias.test.ts`: com 1, 2, 7, 8 e 40 notícias em 12 veículos, a soma dos links (`#painel-noticias a[href]`) é o total e não há `href` repetido; com 7, a grade tem 6 e `#noticias-veiculos` está oculto; com 8, há um cartão de veículo sem `<details>`; veículo com 3 restantes mostra 1 link fora do `<details>` e `summary` "Mais 2 notícias"; com 2 restantes, "Mais 1 notícia"; com 12 veículos nas restantes, 8 cartões são filhos diretos de `#noticias-veiculos` e `details.veiculos-outros` tem `summary` "Outros 4 veículos" e 4 cartões; com 9, "Outros 1 veículo"; não existe `.noticias-topo`; ordem de títulos válida; axe sem violações com os `<details>` fechados e abertos. `paginas.test.ts`/`sobre.test.ts`: `h1` do painel e do Sobre com os textos novos; `h2` "Em três passos"; as duas frases novas do Sobre (uma asserção `toContain` por frase); o Sobre continua sem dizer que mostra gastos em outro lugar (a palavra "gastos" só aparece nesse item).
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** implementar HTML, `noticias.ts` e CSS.
- [ ] **Step 4:** `npm run typecheck && npm test && npm run build` limpos; informar bytes do CSS.
- [ ] **Step 5: Commit** `feat(site): notícias em grade e por veículo compacto, Sobre centralizado e título do painel`.

---

### Task 2: Viagens com mapa-múndi

**Files:**
- Create: `scripts/gerar-mapa.mjs`, `site/src/mapa-contorno.ts` (gerado), `site/src/viagens.ts`, `tests/site/viagens.test.ts`
- Modify: `site/index.html`, `site/src/dados.ts`, `site/src/painel-inicio.ts`, `site/sobre.html`, `site/style.css`, `tests/site/dados.test.ts`, `tests/site/sobre.test.ts`, `tests/site/contraste.test.ts`, `tests/site/build.test.ts`

**Interfaces:**
- Consumes: `ViagemSchema`, `ResumoSchema`, `type Viagem`, `type Resumo` de `src/shared/schema` (o `ResumoSchema` local de `dados.ts` é apagado e passa a ser o compartilhado).
- Produces:
  - `dados.ts`: `Dados.viagens: Viagem[]` (lista vazia quando o arquivo falta ou é inválido), lido só com `carregarDados(f, { viagens: true })`; item inválido é descartado sem derrubar os outros; nunca marca `incompleto`.
  - `mapa-contorno.ts`: `export const LARGURA = 720; export const ALTURA = 276; export const TERRA: string` (o atributo `d` de um único `<path>`).
  - `viagens.ts`: `projetar(lat: number, lon: number): { x: number; y: number }`, `faixaDeCidade(compromissos: number): 1 | 2 | 3 | 4 | 5`, `CIDADES_A_VISTA = 10`, `montarViagens(doc: Document, viagens: Viagem[], carregarContorno?: () => Promise<{ LARGURA: number; ALTURA: number; TERRA: string }>): Promise<void>`.

**Contorno.** `scripts/gerar-mapa.mjs <caminho para land-110m.json>` lê o TopoJSON do pacote `world-atlas@2.0.2` (obtido com `npm pack` numa pasta temporária fora do repositório, sem alterar `package.json`), decodifica os arcos (delta + `transform`), monta os anéis dos polígonos de `objects.land`, projeta e escreve `site/src/mapa-contorno.ts`. Projeção equirretangular recortada: `x = (lon + 180) * 2`, `y = (80 - lat) * 2`, para latitudes de 80 a −58, o que dá um `viewBox` de `0 0 720 276`. Pontos fora da faixa de latitude são presos ao limite. Coordenadas arredondadas para inteiros; pontos consecutivos iguais são descartados; anéis com menos de 4 pontos distintos são descartados. O arquivo gerado começa com um comentário dizendo que é gerado, por qual script, de qual pacote e versão, e que os dados são do Natural Earth (domínio público). O decodificador fica dentro do script, sem dependência.

**Projeção no site.** `projetar` usa a mesma fórmula, prendendo `y` ao intervalo `[0, 276]` e `x` a `[0, 720]`. Brasília: lat −15,79, lon −47,88.

**Faixas.** `faixaDeCidade`: 1 a 2 → 1; 3 a 7 → 2; 8 a 15 → 3; 16 a 30 → 4; 31 ou mais → 5.

**Marcação em `index.html`**, depois da seção da linha do tempo:
```html
<section id="secao-viagens" class="bloco-viagens" aria-labelledby="t-viagens" hidden>
  <h2 id="t-viagens">Viagens internacionais</h2>
  <p class="viagens-nota">Cidades fora do Brasil em que a agenda oficial registra compromissos desde 2023. O número é o de compromissos reconhecidos em cada cidade; o número real costuma ser maior. <a href="sobre.html#viagens">Como reconhecemos as cidades</a>.</p>
  <div class="viagens-corpo">
    <div id="mapa-viagens" class="mapa" hidden></div>
    <div id="lista-viagens"></div>
  </div>
</section>
```

**`montarViagens`.**
- Lista vazia: a seção continua `hidden` e nada é criado.
- Lista: as viagens já vêm ordenadas do pipeline; não reordenar. `ol.cidades` com as `CIDADES_A_VISTA` (10) primeiras; as demais em `<details class="cidades-mais">` com `<summary>` `Outras N cidades` e outro `ol.cidades`. Cada `li[data-cidade=id]` tem `strong.cidade` (nome), `span.pais`, `span.periodo` e `span.contagem`. Período: se `primeiroDia === ultimoDia`, a data em `DD/MM/AAAA`; se `dias` for igual ao número de dias corridos do intervalo, `DD/MM a DD/MM/AAAA` (mesmo ano) ou as duas datas completas; senão `N dias entre AAAA e AAAA` (ou `N dias em AAAA` no mesmo ano). Contagem: `1 compromisso` / `N compromissos`.
- Mapa: só depois de `await carregarContorno()` (padrão: `() => import('./mapa-contorno')`). Se a promessa rejeitar, `#mapa-viagens` continua `hidden` e a lista fica. Com sucesso, cria por `createElementNS` um `<svg class="mapa-svg" viewBox="0 0 720 276" aria-hidden="true" focusable="false">` com: `path.mapa-terra` (`d = TERRA`); um `path.mapa-rota` por cidade (curva quadrática de Brasília até a cidade, com o ponto de controle no meio do caminho, deslocado para cima em 20% da distância); um `circle.mapa-cidade.tam-N[data-cidade=id]` por cidade, com `<title>` `Cidade: N compromissos` (texto por `textContent`); um `rect.mapa-brasilia`; e rótulos `text.mapa-rotulo` para Brasília e para as 5 primeiras cidades. Os círculos são desenhados da cidade com menos compromissos para a com mais, para as maiores ficarem por cima.
- Realce: `mouseenter`/`focusin` num `li[data-cidade]` acrescenta a classe `ativa` ao círculo e à rota daquela cidade e `mouseleave`/`focusout` tira; o mesmo ao passar o mouse num círculo, que realça o `li`. Só classes, nenhum estilo inline.
- `painel-inicio.ts`: `carregarDados({}, { resumo: true, viagens: true })` e, depois de `montarPainel`, `void montarViagens(document, dados.viagens)` (não bloqueia o resto; erro vai para o console).

**Sobre.** Nova seção `<h2 id="viagens">Como as viagens são reconhecidas</h2>`, antes da seção de limites, com uma lista cujos itens são estas frases exatas de `docs/regras-painel.md` (copiar de lá, na ordem): a do mapa ("O mapa mostra cidades fora do Brasil…"), a da tabela (as três frases do item "A agenda escreve o local em texto livre…", trocando `` `config/locais.json` `` por um link `https` para esse arquivo no repositório do GitHub, branch `main`), "Texto que a tabela não reconhece fica de fora…", o item do local genérico, o da sigla de estado, "Compromisso removido da agenda não entra na contagem das viagens.", o da escala técnica, o de "Compromissos"/"Dias", "A posição no mapa é a da cidade…", o dos dias inteiros sem local, e "Só aparecem viagens que constam na agenda oficial publicada…". Teste: uma asserção por item, comparando com o texto lido de `docs/regras-painel.md` (o teste lê o arquivo e exige que cada frase da seção "Viagens", fora o subtítulo "Situação em…", esteja no Sobre, tirando as crases). Um segundo teste amarra as faixas e o limite: `CIDADES_A_VISTA` e as fronteiras de `faixaDeCidade`.

**CSS.** `.mapa-terra` em `--linha` sem contorno (no claro e no escuro); `.mapa-rota` com traço de 1 px em `--agenda` e opacidade 0,5 (`stroke-opacity`, não cor nova), sem preenchimento; `.mapa-cidade` em `--agenda` com contorno de 1,5 px em `--fundo`, raios por `tam-1` a `tam-5` de 3, 4, 5,5, 7 e 9; `.mapa-brasilia` em `--texto`; `.mapa-rotulo` em `--texto`, 11 px; `.ativa` no círculo troca o preenchimento para `--ato` e na rota tira a opacidade; `li.ativa` usa fundo `--selecionado`. O mapa fica à esquerda e a lista à direita a partir de 60rem; empilhados abaixo disso, mapa primeiro. A área do mapa tem `aspect-ratio: 720 / 276` para não haver salto quando o contorno chega. Guardas em `contraste.test.ts`: par `agenda` sobre `fundo` (3) já existe; acrescentar asserção de que `.mapa-cidade.tam-1` a `.tam-5` existem e de que `.mapa-rota` não define cor literal.

- [ ] **Step 1: testes que falham.**
  - `dados.test.ts`: viagens válidas lidas; 404, JSON inválido e corpo que não é lista dão `[]` sem `incompleto`; um item inválido no meio é descartado e os outros ficam; sem a opção, o arquivo não é pedido.
  - `viagens.test.ts`: `projetar` para Brasília, para (80, −180), (−58, 180), (90, 0) e (−90, 0) dentro de `[0,720] × [0,276]`; `faixaDeCidade` em 1, 2, 3, 7, 8, 15, 16, 30, 31, 500; lista vazia mantém a seção oculta; 3 cidades: seção visível, 3 `li`, sem `<details>`; 14 cidades: 10 à vista e `summary` "Outras 4 cidades"; textos de período nos quatro formatos; nome hostil vira texto na lista, no `<title>` e no rótulo, sem `img` nem `script`; com contorno falso (`carregarContorno` resolvendo `{ LARGURA: 720, ALTURA: 276, TERRA: 'M0 0L10 10Z' }`): `svg[aria-hidden="true"]`, um círculo por cidade com `cx`/`cy` iguais a `projetar`, classe `tam-N` certa, ordem de desenho do menor para o maior, 6 rótulos; com `carregarContorno` rejeitando: `#mapa-viagens.hidden` e a lista presente, sem exceção; realce por `mouseenter` e `focusin` e sua retirada; nenhum atributo `style` no documento; axe sem violações.
  - `build.test.ts`: depois do build existe um arquivo `mapa-contorno-*.js` em `dist/assets/` com no máximo 60.000 bytes, e o HTML de `index.html` não o referencia diretamente (ele é carregado sob demanda).
  - Teste do arquivo gerado (em `viagens.test.ts`): `TERRA` começa com `M`, só contém os caracteres `MLZ`, dígitos, espaço e sinal de menos, e todos os números estão em `[0, 720]` (x) e `[0, 276]` (y).
- [ ] **Step 2:** ver falhar.
- [ ] **Step 3:** escrever `scripts/gerar-mapa.mjs`, rodá-lo e versionar `site/src/mapa-contorno.ts`.
- [ ] **Step 4:** implementar `dados.ts`, `viagens.ts`, HTML, Sobre e CSS.
- [ ] **Step 5:** `npm run typecheck && npm test && npm run build` limpos; informar os bytes do CSS, do pedaço do mapa e dos JS da página inicial.
- [ ] **Step 6: Commit** `feat(site): viagens internacionais com mapa-múndi`.
