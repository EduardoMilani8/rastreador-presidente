# Linguagem visual "Diário"

Data: 12/10/2026. Branch: `redesenho`. Substitui a linguagem visual de `2026-10-12-painel-e-quatro-telas-design.md`
("grafite"). A estrutura das quatro páginas, o contrato com o pipeline, as regras de dados, de segurança e de
acessibilidade daquele documento continuam valendo.

Referências visuais aprovadas:

- Capa: https://claude.ai/artifact/5zRgAau386pWQgkatxXB7H (versão "Capa reequilibrada").
- Registros: https://claude.ai/artifact/2edrLrxGaqsCo3ywaYq7hX (direção "2 · Diário", versão "Diário com dia fixo").

## Objetivo

Dar ao site uma identidade própria e séria: ele se parece com o que é, um diário do que foi publicado. A página
inicial é a capa; Registros, Notícias e Sobre são as páginas de dentro. Nenhuma informação nova entra e nenhuma sai.

Critérios de sucesso:

- As quatro páginas usam as mesmas fontes, a mesma escala e as mesmas cores, nos temas claro e escuro.
- A capa não tem mais texto nem mais peso visual do que a página de Registros.
- Nenhuma biblioteca nova vai para o navegador.
- `npm run typecheck && npm test && npm run build` passam, com axe e contraste em todas as páginas.

## O que não muda

- As quatro páginas, seus endereços, o redirecionamento dos endereços antigos e os ids existentes.
- `data/`, o pipeline, `config/locais.json` e todas as regras de dados.
- A marcação gerada por `render.ts`, `painel.ts`, `viagens.ts`, `noticias.ts` e `registros.ts`, salvo os ajustes
  listados em "Código".
- A regra "nunca só por cor": cada tipo continua com forma própria (círculo, losango, quadrado) e rótulo de texto, e
  cada status continua com ícone SVG e texto.
- CSP, texto só por `textContent`, links só `https`, caminhos relativos.

## Linguagem

### Cores

| Variável | Claro | Escuro | Uso |
|---|---|---|---|
| `--fundo` | `#fcfcfa` | `#0f0f0f` | fundo da página |
| `--texto` | `#0e0e0e` | `#f0efec` | texto, fios fortes, links |
| `--suave` | `#57554f` | `#aaa79f` | rótulos e metadados |
| `--linha` | `#d6d4cd` | `#2e2d2a` | fios finos |
| `--terra` | `#e6e4dd` | `#222120` | terra do mapa, dia selecionado, hover |
| `--agenda` | `#0a6549` | `#6fd4b0` | marca de agenda |
| `--ato` | `#74298a` | `#d9a8ea` | marca de ato |
| `--aviso-bg`, `--aviso-tx` | como hoje | como hoje | avisos |

A página é preto sobre papel. Cor só aparece na marca do tipo do registro e no rótulo do tipo. Links são da cor do
texto, sublinhados. As variáveis `--cartao`, `--cartao-2`, `--selecionado`, `--borda-campo`, `--texto-2` e `--link`
deixam de existir ou passam a apontar para as da tabela; a implementação decide caso a caso e o teste de contraste
cobre o resultado.

### Tipografia

- **Newsreader** (serifada): título do site, títulos de seção em itálico, numerais grandes, títulos de compromisso,
  ementas e texto corrido. Pesos 400 e 500, mais 400 itálico.
- **Public Sans** (sem serifa): rótulos em maiúsculas com espaçamento, navegação, metadados, nome dos atos, campos
  de formulário. Pesos 400 e 600.
- Bricolage Grotesque, IBM Plex Sans e IBM Plex Mono saem do site, com seus arquivos e licenças.

Escala fechada, em `rem`, definida como variáveis:

| Variável | Tamanho | Uso |
|---|---|---|
| `--t-titulo` | `clamp(2rem, 8vw, 3.5rem)` | título do site |
| `--t-numeral` | `3.8rem` (2.4rem no celular) | numeral do dia |
| `--t-cifra` | `clamp(2.1rem, 5vw, 2.9rem)` | números da capa |
| `--t-secao` | `1.55rem` | título de seção, itálico |
| `--t-destaque` | `1.32rem` | título de compromisso |
| `--t-corpo` | `1.14rem` | ementa e texto corrido |
| `--t-apoio` | `.9rem` | navegação, links de fonte |
| `--t-rotulo` | `.72rem` | rótulos em maiúsculas |

Horas e contagens usam `font-variant-numeric: tabular-nums lining-nums`.

### Fios e espaço

- Fio de 4px abre o cabeçalho; fio de 3px abre cada seção e cada dia; fio de 1px separa itens.
- Sem cartões, sem cantos arredondados em blocos de conteúdo, sem sombra. Campos de formulário e botões podem ter
  raio de 6px.
- Largura máxima: 62rem na capa e em Notícias; 52rem em Registros e Sobre.

### Movimento

Vocabulário fechado, todo em CSS, todo dentro de `@media (prefers-reduced-motion: no-preference)`:

| Nome | O que faz | Onde |
|---|---|---|
| `entra` | opacidade 0 e 8px abaixo até o lugar, 0,55s | números da capa; os 12 primeiros registros da lista |
| `traco` | a rota se desenha, 1,1s | rotas do mapa |
| hover | cor ou fundo em 0,12s | links, navegação, dias da faixa |
| dia fixo | `position: sticky` | numeral do dia em Registros |

Uma curva de saída só: `cubic-bezier(.16, 1, .3, 1)`. Nada pisca nem se repete: o site grava o instante da última
alteração nos dados, não o da última coleta, e um indicador "ao vivo" afirmaria o que não sabemos. Só animam
`opacity`, `transform` e `stroke-dashoffset`. O estado de repouso é sempre o conteúdo visível.

## Páginas

### Cabeçalho comum

Fio grosso, título "Rastreador do Presidente", uma faixa entre dois fios com a data de hoje por extenso à esquerda e
"Última alteração nos dados" à direita, e a navegação: Capa, Registros, Notícias, Sobre. Os avisos de fonte com
falha, dados incompletos e dados parados continuam logo abaixo, como hoje. O rótulo "Painel" passa a "Capa" na
navegação; o arquivo continua `index.html`.

### Capa (`index.html`)

1. **Três números** em colunas separadas por fio: total de registros, compromissos, atos. Numerais na cor do texto;
   o rótulo dos dois últimos leva a marca do tipo. No celular, um por linha, com o rótulo ao lado.
2. **Os últimos 21 dias**: título à esquerda e legenda curta à direita (Agenda, Ato, Comunicado). A faixa de dias
   mantém a interação atual (um botão por dia, tabindex itinerante, setas, `aria-pressed`). O dia selecionado ganha
   fio no alto e fundo `--terra`. O detalhe mostra o numeral do dia na coluna da esquerda, como em Registros, a
   contagem, até três itens e o link para os registros do dia.
3. **Viagens internacionais**: uma linha de resumo ("55 cidades em 40 países com compromissos na agenda oficial
   desde 2023. Cada número é o mínimo confirmado."), com link para a explicação no Sobre. Mapa em largura total:
   terra em `--terra`, rotas e cidades na cor do texto, rótulos em itálico. Abaixo, as nove cidades com mais
   compromissos em três colunas, com pontilhado até o número; as demais ficam em "Outras N cidades" (`<details>`).
   Cada cidade mostra país e anos; a contagem de dias sai da lista.

A interação entre lista e mapa (cidade ativa) continua, com a cidade ativa em `--agenda`.

### Registros (`registros.html`)

- Cada dia é uma grade de duas colunas: à esquerda, numeral grande, "de outubro de 2026" em itálico, dia da semana e
  contagem; à direita, os registros. A coluna da esquerda é `sticky`.
- No celular, o cabeçalho do dia vira uma faixa de uma linha, `sticky` no topo, com fundo `--fundo`.
- `scroll-margin-top` nos registros e nos títulos de dia, para que a âncora de um link permanente não fique atrás da
  faixa fixa.
- Cada registro: hora em serifada na coluna estreita; rótulo do tipo com a marca; status; título; local ou ementa;
  datas do ato; fontes numa linha ("Confirmado por 2 fontes:" em itálico, seguido dos links).
- Nos atos, o nome do ato fica pequeno, em sem serifa, e a ementa é o texto principal.
- Filtros e "Próximos compromissos" mantêm a marcação; ganham só as fontes, os fios e as cores novas.

### Notícias (`noticias.html`) e Sobre (`sobre.html`)

Sem esboço próprio. Recebem o cabeçalho comum, a escala e os fios. Em Notícias, os cartões viram itens separados por
fio, com o título em serifada e veículo e data como rótulo; a grade de colunas continua. No Sobre, o texto corrido
fica em Newsreader com no máximo 65 caracteres por linha. As duas páginas são mostradas no navegador para aprovação
antes de qualquer merge.

## Mudanças em regras e testes

Precisam de aprovação explícita:

1. **Fontes**: saem quatro arquivos e entram os de Newsreader e Public Sans, só o subconjunto latino, em `.woff2`,
   com `font-display: swap` e fonte do sistema como alternativa. O limite de 90 kB em `tests/site/build.test.ts`
   continua. Se os arquivos necessários passarem disso, a ordem de corte é: (a) versão variável de cada família no
   lugar dos pesos separados; (b) Public Sans dá lugar à fonte sem serifa do sistema. O limite só sobe com
   aprovação.
2. **Dependências de desenvolvimento**: `@fontsource/newsreader` e `@fontsource/public-sans` no lugar das três
   `@fontsource` atuais. Nenhuma vai para o navegador como código.
3. **Cores dos tipos** mudam de azul e laranja para verde e roxo. O teste de contraste passa a medir os pares novos.
4. **"Painel" vira "Capa"** na navegação e nos textos que citam o nome da página, inclusive no Sobre e em
   `tests/site/sobre.test.ts` se o teste citar o nome.

## Correção do mapa

`scripts/gerar-mapa.mjs` projeta cada anel sem tratar o que cruza o meridiano de 180°. A ponta leste da Rússia fica
em x perto de 0 enquanto o resto da Eurásia vai até x = 720, e o anel risca o mapa de lado a lado em duas alturas.

Correção: ao gerar, um anel com dois saltos horizontais maiores que metade da largura é dividido em dois anéis.
Teste novo em `tests/site/viagens.test.ts` (ou arquivo próprio): em `mapa-contorno.ts`, nenhum segmento de nenhum
anel tem salto horizontal maior que metade de `LARGURA`. O teste falha hoje. `mapa-contorno.ts` é gerado de novo,
não editado à mão.

## Código

| Arquivo | Mudança |
|---|---|
| `site/style.css` | reescrito: variáveis novas, `@font-face`, escala, fios, movimento |
| `site/fontes/` | saem os quatro `.woff2` e as licenças atuais; entram os novos, com licença OFL e `LEIA-ME.md` |
| `site/index.html`, `registros.html`, `noticias.html`, `sobre.html` | cabeçalho comum novo; "Capa" na navegação |
| `site/src/comum.ts` | data de hoje por extenso na faixa do cabeçalho |
| `site/src/painel.ts` | detalhe do dia com numeral na coluna; legenda curta |
| `site/src/viagens.ts` | linha de resumo; nove cidades à vista e as demais em `<details>`; país e anos |
| `site/src/registros.ts`, `site/src/render.ts` | título do dia em partes (numeral, mês e ano, dia da semana, contagem); fontes em linha |
| `scripts/gerar-mapa.mjs`, `site/src/mapa-contorno.ts` | divisão do anel que cruza a borda; arquivo gerado de novo |
| `tests/site/*` | contraste com os pares novos; estrutura do título do dia; resumo e `<details>` das viagens; teste do contorno; nomes de fonte no teste de build |
| `package.json` | troca das dependências de fonte |

O título do dia continua um único `<h3>` com o texto completo acessível ("sexta-feira, 9 de outubro de 2026"); as
partes visuais são `<span>` dentro dele, na ordem de leitura.

## Testes

- Teste primeiro em tudo que muda comportamento: contorno do mapa, estrutura do título do dia, lista de viagens.
- axe nas quatro páginas; contraste de todos os pares novos nos dois temas, mínimo 4,5:1 para texto e 3:1 para
  marcas e fios que carregam informação.
- Build: CSP inalterada, limites de peso atuais, nomes dos arquivos de fonte.
- Conferência no navegador em 375 e 1280 px, nos dois temas, com teclado e com movimento reduzido, antes de pedir
  aprovação.

## Entrega

Tudo em `redesenho`. Nada entra em `main` antes de aprovação visual das quatro páginas no navegador. A `main` local
está atrás de `origin/main` (commits do robô) e precisa de `git pull --rebase` antes do merge.

## Fora do escopo

Pipeline e regras de dados, seções novas, alternador manual de tema, gastos, viagens dentro do Brasil e qualquer
biblioteca de interface ou de animação.
