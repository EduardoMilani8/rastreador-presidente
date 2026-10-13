# Redesenho do site: direção "Registro"

Data: 12/10/2026. Branch: `redesenho`. Nada entra em `main` antes de aprovação visual.

## Objetivo

Redesenhar a aparência de `site/` para que o site passe seriedade, clareza e neutralidade, sem parecer portal do
governo nem portal de notícia. O público chega principalmente pelo celular, e o "Último registro" precisa aparecer sem
rolar a tela.

Pronto significa: aprovado olhando o site rodando em 375 px e em desktop, nos temas claro e escuro, com
`npm run typecheck && npm test && npm run build` limpos.

## Fora do escopo

- Coletores, pipeline, `data/`, esquemas e regras de dados.
- Comportamento novo no navegador (alternador de tema, filtros rápidos, cabeçalho de dia fixo).
- O texto da página "Sobre e metodologia". Só a aparência dela muda.
- Fontes, imagens ou scripts de terceiros.

## Contratos que permanecem

- Todos os ids do HTML listados no pedido (`ultima-novidade`, `aviso-*`, `aba-*`, `conteudo`, `painel-*`, `bloco-*`,
  `ultimo-registro`, `proximos`, `caixa-filtros`, `filtros`, `periodo`, `linha-do-tempo`, `mais-dias`, `mais-antigos`,
  `lista-noticias`).
- As classes criadas em `render.ts`: `evento`, `tipo-*`, `status-*`, `evento-meta`, `tipo`, `status`, `evento-titulo`,
  `local`, `ementa`, `datas-ato`, `bloco-fontes`, `selo`, `fontes`, `permalink`, `noticia`.
- Texto das fontes só por `textContent`/`append(string)`. Nenhum `style`, script ou manipulador inline.
- Caminhos relativos. Links só `https`, por `urlHttpsSegura`.
- Ordem de títulos h1 → h2 → h3 → h4, link de pular para o conteúdo, foco visível, alvos de toque de 44 px,
  `prefers-reduced-motion`, status sempre com ícone e texto.

## 1. Cores e tipografia

Fontes só do sistema. Texto em `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`. Horas e datas em
`ui-monospace, 'SF Mono', Menlo, Consolas, monospace` com `font-variant-numeric: tabular-nums`.

Os nomes das variáveis atuais ficam. Entram `--borda-campo`, `--topo-fundo`, `--topo-texto` e `--topo-suave`. Saem
`--agenda`, `--ato` e `--comunicado`: o tipo do item deixa de ter cor e a borda colorida à esquerda some.

| Variável | Claro | Escuro |
|---|---|---|
| `--fundo` | `#f4f5f6` | `#0f1114` |
| `--cartao` | `#ffffff` | `#181b20` |
| `--texto` | `#16191d` | `#eceef1` |
| `--suave` | `#545b65` | `#a7aeb8` |
| `--linha` | `#d5d9de` | `#2e333b` |
| `--link` | `#0e4a94` | `#8fbfff` |
| `--borda-campo` | `#6b727c` | `#7d8590` |
| `--aviso-bg` | `#fff3cd` | `#3a2f08` |
| `--aviso-tx` | `#5c4400` | `#ffe9a8` |
| `--topo-fundo` | `#16191d` | `#181b20` |
| `--topo-texto` | `#ffffff` | `#eceef1` |
| `--topo-suave` | `#b4bac2` | `#a7aeb8` |

Razões de contraste calculadas (mínimo 4,5 para texto e 3 para borda de campo):

| Par | Claro | Escuro |
|---|---|---|
| texto / fundo | 16,15 | 16,27 |
| suave / fundo | 6,28 | 8,45 |
| suave / cartão | 6,86 | 7,72 |
| link / cartão | 8,66 | 9,10 |
| link / fundo | 7,93 | (maior que no cartão) |
| borda de campo / cartão | 4,86 | 4,63 |
| borda de campo / fundo | 4,45 | 5,07 |
| aviso texto / aviso fundo | 8,31 | 10,99 |
| topo suave / topo fundo | 9,02 | 7,72 |

No tema escuro a faixa do cabeçalho usa a cor do cartão e ganha um fio inferior em `--linha`, para se separar do fundo.

Os avisos continuam em âmbar. Eles falam do estado dos dados do site, não de um ato.

## 2. Cartão de evento

Marcação gerada por `renderEvento`:

```
li.evento.tipo-{tipo}.status-{status}[.com-hora]
  time.evento-hora                (só quando o item tem hora; fora da caixa)
  div.evento-corpo                (a caixa do cartão)
    p.evento-meta
      span.tipo                   etiqueta com o rótulo do tipo
      span.status                 svg[aria-hidden] + texto do status
    h{n}.evento-titulo
    p.local
    p.ementa
    p.datas-ato
    details                       "Versões anteriores (N)"
    div.bloco-fontes              faixa no pé do cartão
      p.selo
      a.permalink
      ul.fontes
```

- A hora sai de `evento-meta` e vira coluna própria à esquerda (`li.com-hora` é um grid de `3rem 1fr`). Itens sem
  hora ocupam a largura toda. O `<time>` mantém o atributo `datetime` atual.
- O "Link permanente" sai da linha de cima e vai para a faixa de fontes. Ele fica fora de `ul.fontes`: não é fonte
  e não entra na contagem do selo. O `aria-label` com o título do item continua.
- Na faixa de fontes a ordem do DOM é a da tela (selo, link permanente, lista de fontes), para o foco do teclado
  seguir a ordem visual. Links de fonte, link permanente e título de notícia têm 44 px de altura mínima; quando o
  ponteiro principal é fino (`@media (hover: hover) and (pointer: fine)`), ficam compactos, com pelo menos 24 px.
- Títulos são exibidos como a fonte publica. Atos do Diário Oficial vêm em maiúsculas e ficam assim: conversão
  automática erraria siglas e nomes próprios.
- Item removido da agenda continua com o título riscado, além do ícone e do texto de status.

### Data nos destaques

Única adição de conteúdo. `renderEvento` ganha a opção de mostrar a data: nos cartões de "Último registro" e
"Próximos compromissos" o `time.evento-hora` passa a trazer data e hora (`13/10/2026 · 10:00`, com o ano, para o cartão nunca ficar ambíguo), ou só a data quando o
item não tem hora (`datetime` com a data). Na linha do tempo nada muda, porque o título do dia já diz a data.
Nos destaques a data fica dentro da caixa, acima da linha de tipo e status, e não em coluna lateral.

Para acomodar isso sem acumular parâmetros posicionais, a assinatura passa a ser
`renderEvento(doc, ev, { nivelTitulo = 4, comId = true, comData = false })`.

### Ícones

Arquivo novo `site/src/icones.ts`, com `icone(doc, nome)` que cria um `<svg>` por `createElementNS`, com
`viewBox="0 0 16 16"`, `aria-hidden="true"`, `focusable="false"` e classe `icone`. O traço usa `currentColor` e é
definido no CSS. Nenhum atributo `style`.

| Status | Ícone |
|---|---|
| Agendado | relógio |
| Consta na agenda | lista |
| Realizado | círculo com visto |
| Publicado no Diário Oficial | documento |
| Publicado no site do Planalto | balão de fala |
| Alterado na agenda | lápis |
| Removido da agenda | círculo cortado |

Nenhum triângulo de alerta e nenhuma cor própria. `ROTULO_STATUS` e `ROTULO_COMUNICADO` trocam o campo `icone` de
emoji para o nome do ícone.

## 3. Layout

- **Cabeçalho**: faixa escura de largura total com título, "Última alteração nos dados há X" e abas. A aba atual
  (`aria-current="page"`) leva um traço inferior. Os três avisos ficam logo abaixo da faixa, dentro da largura do
  conteúdo.
- **Até 60rem**: coluna única com no máximo 46rem. O cabeçalho é compacto para o "Último registro" começar na
  primeira tela de um celular de 375 × 667.
- **A partir de 60rem**: `#painel-linha` vira um grid de `minmax(0, 1fr) 20rem`, com no máximo 72rem. A linha do tempo
  fica à esquerda. À direita, um `<div class="destaques">` novo envolve `#bloco-ultimo` e `#bloco-proximos`, com
  `position: sticky`, altura máxima da janela e rolagem própria.
- **Ordem do HTML**: `.destaques` continua antes da linha do tempo. A ordem de leitura e de tabulação não muda.
- **Com filtro ativo** `app.ts` já esconde os dois blocos. O grid de duas colunas só vale quando há destaque visível:
  `@supports selector(:has(*))` e `#painel-linha:has(.destaques > section:not([hidden]))`. Navegadores sem `:has()`
  ficam em coluna única.
- **Dia**: o `h3` mostra a data por extenso como hoje. Os cartões do dia ficam numa lista com espaço de 8 px.

## 4. Filtros, Notícias, Sobre e rodapé

- **Filtros**: continuam em `details#caixa-filtros` com `form#filtros` por GET. O `summary` ganha aparência de botão
  com 44 px de altura. No celular os campos ficam em grade de duas colunas (De/Até, Tipo/Status), com "Filtrar" e
  "Limpar filtros" abaixo. Bordas dos campos em `--borda-campo`.
- **Notícias**: cartões na mesma linguagem, sem faixa de fontes. O aviso de que não são registros oficiais vira uma
  caixa no topo da lista, em tom neutro (não âmbar).
- **Sobre**: mesma faixa de cabeçalho e mesmas abas. Texto corrido com largura de leitura de 46rem. Nenhuma frase muda.
- **Rodapé**: mesmo texto e mesmos links, com fio separador acima.

## 5. Arquivos

| Arquivo | Mudança |
|---|---|
| `site/style.css` | reescrito |
| `site/index.html` | cabeçalho, `.destaques`, classes do formulário; ids intactos |
| `site/sobre.html` | cabeçalho e classes; texto intacto |
| `site/src/icones.ts` | novo |
| `site/src/render.ts` | marcação do cartão, opções de `renderEvento`, ícones |
| `site/src/app.ts` | chamadas de `renderEvento` com `comData` nos destaques |
| `tests/site/render.test.ts` | marcação nova, ícones, data nos destaques |
| `tests/site/app.test.ts` | chamadas e seletores afetados |
| `tests/site/contraste.test.ts` | novo |
| `.gitignore` | `.superpowers/` |

## 6. Testes

Teste primeiro, como pede o CLAUDE.md.

- `render.test.ts`: hora em `time.evento-hora` com o `datetime` atual; item sem hora não tem `com-hora`; status com
  `svg[aria-hidden="true"]` e texto; nenhum emoji no cartão; `a.permalink` dentro de `.bloco-fontes` e fora de
  `ul.fontes`; com `comData`, a data aparece e o `datetime` está certo; os testes de XSS e de `https` continuam.
- `app.test.ts`: os destaques mostram a data e a linha do tempo não; `.destaques` contém os dois blocos; ids únicos;
  nenhum `[style]` nem `[onclick]`; axe sem violações.
- `contraste.test.ts`: lê as variáveis de `style.css` nos dois temas e calcula a razão dos pares da tabela acima.
  Falha se algum texto ficar abaixo de 4,5 ou alguma borda de campo abaixo de 3.
- `build.test.ts` e `sobre.test.ts` continuam passando sem alteração de expectativa.

Verificação manual no navegador: 375 px e desktop, claro e escuro, com e sem filtro, aba Notícias e página Sobre,
navegação por teclado e foco visível.

## 7. Limites de peso

CSS até cerca de 8 kB (hoje 4 kB). JS com no máximo 2 kB a mais. A lista continua desenhada em blocos de 60 dias.

## 8. Git

Branch `redesenho`. Commits em português, no estilo `tipo(escopo): resumo`. Sem push e sem junção em `main` antes de
aprovação.
