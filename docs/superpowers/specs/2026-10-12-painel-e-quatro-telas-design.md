# Painel e quatro telas

Data: 12/10/2026. Branch: `redesenho`. Substitui o visual de `2026-10-12-redesenho-site-design.md` (direção
"Registro"); as regras de segurança, de acessibilidade e os testes de contraste e de estrutura daquele documento
continuam valendo.

Referência visual aprovada: canvas "Rastreador do Presidente: esboços", versão "Grafite neutro e ajustes"
(https://claude.ai/artifact/2DPukNN2ugAPoHgbFG86Hb).

## Objetivo

O site passa a ter quatro telas com a mesma linguagem: um painel visual como página inicial, a lista séria de
registros, as notícias e o Sobre. Nada entra em `main` antes de aprovação visual.

## Decisões tomadas

| Assunto | Decisão |
|---|---|
| Gastos | O bloco só aparece quando existir `data/gastos.json` válido. A coleta é trabalho do pipeline, em outra sessão. |
| Viagens | Só internacionais. A lista de cidades vem pronta de `data/viagens.json`, gerado pelo pipeline. |
| Números do topo | Vêm de `data/resumo.json`, gerado pelo pipeline. |
| Tema | Claro e escuro, pelo tema do aparelho. O claro é derivado da mesma paleta e passa por aprovação. |
| Fontes tipográficas | Bricolage Grotesque, IBM Plex Sans e IBM Plex Mono, hospedadas no próprio site. |
| "Último registro" | Deixa de existir como bloco. |

## Mudanças em regras do projeto

Estas quatro alteram regras do pedido original e do CLAUDE.md. Precisam de aprovação explícita.

1. **CSP ganha `font-src 'self'`.** Sem isso o navegador bloqueia as fontes do próprio site. Muda `vite.config.ts` e
   a constante `CSP_ESPERADA` de `tests/site/build.test.ts`. Nenhuma outra diretiva muda.
2. **Dependências de desenvolvimento novas**: `@fontsource/bricolage-grotesque`, `@fontsource/ibm-plex-sans`,
   `@fontsource/ibm-plex-mono` (arquivos `.woff2`, licença OFL) e `world-atlas` (contornos do Natural Earth, domínio
   público). Nenhuma vai para o navegador como código: um script copia os `.woff2` usados e gera o desenho do mapa.
3. **"O Último registro precisa aparecer sem rolar a tela" deixa de valer.** No lugar: no celular, a primeira tela
   do painel mostra o dia mais recente com registros já selecionado, e a primeira tela de Registros mostra o
   registro mais recente.
4. **Ids removidos**: `bloco-ultimo` e `ultimo-registro`. Os demais ids continuam, distribuídos entre as páginas.

Os limites de peso também mudam: CSS até 12 kB; JS da página inicial até 110 kB; fontes até 160 kB no total; o
desenho do mapa até 60 kB, carregado só quando a seção de viagens entra na tela.

## Páginas e endereços

| Página | Arquivo | Conteúdo |
|---|---|---|
| Painel | `index.html` | Números do topo, linha do tempo com pontos, viagens, gastos |
| Registros | `registros.html` | Filtros, lista por dia, próximos compromissos |
| Notícias | `noticias.html` | Mais recente em destaque, lista, blocos por veículo |
| Sobre | `sobre.html` | Como funciona, status, limites |

Endereços antigos continuam funcionando. `index.html` redireciona, com `location.replace` e caminho relativo:

- `?aba=noticias` vai para `noticias.html`.
- Qualquer endereço com `aba=linha`, `de`, `ate`, `tipo` ou `status`, ou com âncora `#ev-...`, vai para
  `registros.html` com a mesma consulta e a mesma âncora.

O link permanente passa a ser `registros.html?de=AAAA-MM-DD&ate=AAAA-MM-DD#ev-...`.

## Linguagem visual

Tema escuro, igual aos esboços:

| Variável | Escuro | Uso |
|---|---|---|
| `--fundo` | `#151514` | fundo da página |
| `--cartao` | `#1d1d1b` | painéis e cartões |
| `--cartao-2` | `#252523` | faixa de fontes, etiqueta de data, detalhe do dia |
| `--linha` | `#383835` | fios e bordas |
| `--borda-campo` | `#8f8d86` | bordas de campos e botões |
| `--texto` | `#f3f2ee` | texto |
| `--texto-2` | `#dad8d1` | ementa e texto de apoio |
| `--suave` | `#b5b3ab` | metadados |
| `--link` | `#a9cdf0` | links |
| `--agenda` | `#8dbdea` | marcação de agenda |
| `--ato` | `#ffb866` | marcação de ato |

O tema claro usa as mesmas variáveis com valores derivados (fundo claro neutro, `--agenda` e `--ato` escurecidos
até passarem em 4,5:1). Os valores exatos são definidos na implementação, medidos pelo teste de contraste e
mostrados para aprovação.

Agenda e ato voltam a ter cor, ao contrário do que o documento anterior decidiu. A regra "nunca só por cor" é
cumprida pela forma (círculo para agenda, losango para ato) e pelo rótulo de texto. Nenhuma das duas cores sugere
julgamento.

Tipografia: Bricolage Grotesque 700 em títulos e números grandes; IBM Plex Sans 400 e 600 no texto; IBM Plex Mono
500 em horas, datas e contagens. Só os subconjuntos latinos, em `.woff2`, com `font-display: swap` e fontes do
sistema como alternativa.

## Painel (`index.html`)

- **Topo**: "Última alteração nos dados há X", o título e três números (total de registros, compromissos, atos).
  Sem `data/resumo.json`, os números não aparecem.
- **Linha do tempo**: os 21 dias mais recentes, um botão por dia. Círculo para compromissos e losango para atos,
  com tamanho pela quantidade; dia sem registro mostra um ponto pequeno. Passar o mouse, focar ou clicar
  seleciona o dia, e o painel abaixo mostra a data por extenso, as contagens, até três itens e o link para os
  registros daquele dia. O dia mais recente com registros começa selecionado.
- **Rolagem**: em tela estreita a linha rola na horizontal sem barra visível: arrastar com o mouse, deslizar com o
  dedo ou andar com Tab. Ela começa rolada até o dia mais recente.
- **Viagens**: mapa-múndi com um ponto por cidade (tamanho pela quantidade de compromissos) e linhas a partir de
  Brasília, mais a lista das cidades com período e contagem. Sem `data/viagens.json`, a seção não aparece.
- **Gastos**: uma caixa por item, com rótulo, período, valor e fontes. Sem `data/gastos.json`, a seção não aparece.
- Avisos de fonte com falha, dados incompletos e dados parados continuam no alto, como hoje.

Os dados dos 21 dias vêm dos dois meses mais recentes, que a página já carrega hoje.

Acessibilidade do painel: cada dia é um `<button>` com nome completo ("sexta-feira, 9 de outubro de 2026:
1 compromisso, 3 atos") e `aria-pressed`; o detalhe do dia fica numa região `aria-live="polite"`; o mapa é
decorativo para leitor de tela, porque a lista ao lado traz a mesma informação em texto.

## Registros (`registros.html`)

É a página atual da linha do tempo, com estas mudanças:

- Os filtros continuam no `<details id="caixa-filtros">` com formulário GET, com o `summary` desenhado como botão.
  Fechado por padrão; aberto quando há filtro em uso.
- O título de cada dia vai numa etiqueta com fundo `--cartao-2`, seguida de um fio até a borda.
- A lateral traz só "Próximos compromissos". Quando não há nenhum, a lateral some e a lista ocupa a largura toda.
- Sem o bloco "Último registro".
- O cartão mantém a marcação de hoje (hora em coluna, tipo, status com ícone e texto, faixa de fontes com selo,
  link permanente e lista de fontes), nas cores novas e com a forma do tipo antes do rótulo.

## Notícias (`noticias.html`)

- Aviso de que não são registros oficiais, no alto.
- A notícia mais recente em destaque; as cinco seguintes em lista ao lado; abaixo, blocos por veículo com as duas
  mais recentes de cada um, para os três veículos com mais itens.
- Título, veículo, data e link, como hoje. Nenhum texto além do que `data/noticias.json` já traz.

## Sobre (`sobre.html`)

- Título "Sobre" e uma linha de descrição.
- "Como funciona" em três passos, a lista de status com os ícones, e os limites.
- **Todo o texto atual é mantido.** Os blocos novos reorganizam as frases existentes; nenhuma informação sai.
- Entram duas explicações novas, com teste em `tests/site/sobre.test.ts`: como as viagens são reconhecidas (tabela
  de locais conferida, só cidades fora do Brasil, local não reconhecido fica fora) e de onde vêm os gastos (texto
  entra junto com o coletor).

## Contrato com o pipeline

Três arquivos novos em `data/`, gravados pelo robô. O site trata cada um como opcional: arquivo ausente ou
inválido esconde a seção correspondente, sem erro e sem aviso de dados incompletos.

```
data/resumo.json
{ "total": 8540, "porTipo": { "agenda": 5468, "ato": 3044, "comunicado": 28 }, "desde": "2023-01-01" }

data/viagens.json
[ { "id": "nova-york-us", "cidade": "Nova York", "pais": "Estados Unidos", "lat": 40.71, "lon": -74.01,
    "compromissos": 64, "dias": 18, "primeiroDia": "2023-09-16", "ultimoDia": "2026-09-22" } ]

data/gastos.json
{ "itens": [ { "id": "...", "rotulo": "...", "periodo": { "de": "2026-01-01", "ate": "2026-09-30" },
    "valorCentavos": 0, "fontes": [ { "nome": "...", "rotulo": "...", "url": "https://...", "coletadoEm": "..." } ] } ] }
```

Os esquemas zod ficam em `src/shared/schema.ts`, escritos pela sessão do pipeline em `main`. Este branch
desenvolve contra arquivos de exemplo nos testes e faz rebase quando os esquemas chegarem.

## Código

| Arquivo | Mudança |
|---|---|
| `site/index.html` | vira o painel |
| `site/registros.html`, `site/noticias.html` | novos |
| `site/sobre.html` | blocos novos, mesmo texto |
| `site/style.css` | reescrito nas variáveis novas, com `@font-face` |
| `site/fontes/*.woff2` | novos |
| `site/src/painel.ts` | novo: linha do tempo com pontos e detalhe do dia |
| `site/src/viagens.ts`, `site/src/mapa.ts` | novos: lista de cidades e desenho do mapa |
| `site/src/gastos.ts` | novo |
| `site/src/app.ts` | dividido em `registros.ts` e `noticias.ts`; parte comum (avisos, última alteração) em `comum.ts` |
| `site/src/render.ts` | link permanente aponta para `registros.html`; forma do tipo no cartão |
| `site/src/dados.ts` | leitura opcional de resumo, viagens e gastos |
| `site/src/main.ts` | uma entrada por página e o redirecionamento dos endereços antigos |
| `scripts/gerar-mapa.mjs`, `scripts/copiar-fontes.mjs` | novos, rodados à mão; o resultado é versionado |
| `vite.config.ts` | três páginas novas na entrada do build; `font-src 'self'` |
| `tests/site/*` | ajustes e testes novos por módulo |

## Testes

- Tudo o que entra no DOM vindo de `data/` continua por `textContent`; os testes de XSS se estendem a cidade, país,
  rótulo de gasto e título de notícia nos blocos novos.
- Painel: seleção por clique, foco e mouse; dia sem registro; nome acessível e `aria-pressed`; 21 dias mesmo
  quando o mês vira.
- Seções opcionais: ausentes quando o arquivo falta, quando é inválido e quando a lista vem vazia.
- Redirecionamento: cada formato de endereço antigo chega à página certa com consulta e âncora preservadas.
- Mapa: nenhum `style` inline, nenhum recurso externo, pontos nas coordenadas esperadas.
- Contraste: o teste atual passa a cobrir as variáveis novas, nos dois temas.
- axe em cada página; ids únicos; build com a CSP nova nas quatro páginas.
- Conferência manual em 320, 375 e 1280 px, nos dois temas, com teclado, e num iPhone antes de publicar.

## Fora do escopo

Coletores e regras de dados (inclusive a tabela de locais e os gastos), viagens dentro do Brasil, alternador
manual de tema e qualquer texto de opinião.
