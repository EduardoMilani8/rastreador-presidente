# Comunicados do Planalto pela página de notícias — Plano (proposta)

> **Situação:** aprovado em 27/10/2026, em implementação. Decisões: implementar; recuperar o período sem coleta;
> a fonte continua só avisando, sem e-mail.

**Objetivo:** voltar a coletar os comunicados do Planalto lendo a página de notícias
(`https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias`), já que o feed parou.

**Resultado esperado:** a fonte "Comunicados do Planalto" volta a `ok`, os comunicados de 27/09/2026 em diante
entram no site, e qualquer mudança no visual da página é acusada como erro da fonte. Ela nunca vira lista vazia em
silêncio.

## Contexto (verificado em 27/10/2026)

- `.../noticias/RSS` responde 200, mas o item mais novo é de 27/09/2026 (33 itens). Desde o PR #9 isso conta como
  "Feed parado" e, desde o PR #11, a fonte só avisa (site, log e rotina), sem derrubar o workflow.
- Testados pelo workflow "Testar endereço de feed" (PRs #11 e #12):
  - `.../noticias/rss.xml` e `.../noticias/atom.xml` trazem a mesma listagem de 33 itens.
  - O `updated` recente do `atom.xml` é das **pastas** (ex.: "2023"), não de notícias.
  - `.../noticias/2026/10/RSS`, `.../noticias/2026/RSS`, `.../noticias/2026/10/rss.xml` e `.../pt-br/RSS` dão 404.
  - `.../ultimas-noticias/RSS` devolve uma página HTML.
- O site do Planalto continua publicando notícias em `.../noticias/2026/10/<slug>`.
- O coletor atual (`src/collectors/planalto.ts`) gera `Comunicado { id: 'planalto:<slug>', data, titulo, resumo, url }`.
  O pipeline filtra por `citaPresidente` em `link.ts`; a ligação com a agenda está desligada.

## Decisões para o dono (antes de começar)

1. **Implementar ou não.** O custo é um coletor de HTML a mais, que quebra quando o Planalto mudar o visual da
   página (como já acontece com a agenda). Sem ele, os comunicados ficam parados em 27/09 e o aviso fica no site.
2. **Recuperar o período sem coleta (27/09 → hoje).** Exige ler páginas antigas da listagem uma única vez, a uma
   requisição por segundo. Recomendado: sim, limitado a 60 dias.
3. **A fonte volta a derrubar o workflow (com e-mail) quando falhar?** Recomendado: sim, tirando `planalto` de
   `FONTES_QUE_SO_AVISAM` depois de uma semana estável.

## Desconhecidos que a Tarefa 1 resolve

- O HTML da listagem: onde ficam título, link, data e resumo de cada notícia.
- O formato da data: o portal costuma mostrar "publicado DD/MM/AAAA HHhMM". Falta confirmar.
- Como a listagem pagina (no Plone costuma ser `?b_start:int=N`) e quantos itens vêm por página.
- Se a página responde normalmente ao robô (sem bloqueio nem desafio anti-robô) a partir do GitHub Actions.

## Tarefas

### Tarefa 1 — Capturar páginas reais (fixtures)

- [ ] Criar o workflow manual `capturar-pagina.yml`, só leitura da fonte. Ele recebe endereços
  `https://www.gov.br/...` (mesma validação do `testar-feed.yml`), baixa cada um a uma requisição por segundo e grava
  o HTML numa branch `captura/AAAA-MM-DD`, com `contents: write` só nesse job. Motivo: daqui não é possível baixar
  artefatos nem acessar o gov.br, mas a branch chega pelo git.
  - Alternativa sem workflow: o dono abre a página no navegador, usa "Salvar como → somente HTML" e manda o arquivo.
- [ ] Capturar: a primeira página da listagem, a segunda página (paginação) e uma notícia de outubro.
- [ ] Guardar em `tests/fixtures/planalto/` (`noticias-p1.html`, `noticias-p2.html`), cortando o que não for
  necessário para manter o arquivo pequeno.

### Tarefa 2 — Coletor da página (`src/collectors/planalto.ts`)

- [ ] `parsePlanaltoPagina(html, urlFinal, coletadoEm): Comunicado[]` com cheerio:
  - Para cada item da listagem: título, link absoluto `https` dentro de `/planalto/pt-br/acompanhe-o-planalto/noticias/`,
    data de publicação (convertida para `AAAA-MM-DD` no fuso de São Paulo) e resumo (texto puro).
  - `id = 'planalto:<último trecho da URL>'`, igual ao do feed. Os comunicados já gravados até 27/09 não duplicam.
- [ ] Falhar com `FeedLayoutError`, nunca com lista vazia, quando:
  - a página responde 200, mas não tem o contêiner da listagem;
  - há itens, mas nenhum tem link `https`, título e data válidos;
  - houve redirecionamento para fora de `.../noticias` (mesma ideia do `exigirEdicaoDou`).
- [ ] Testes em `tests/collectors/planalto.test.ts` com as fixtures reais: itens lidos, datas, links, resumo sem HTML,
  item sem data descartado e página sem listagem lança erro.

### Tarefa 3 — Ligar no pipeline (`src/pipeline/run.ts`)

- [ ] Trocar a busca do feed pela da página (uma requisição por execução, como hoje). Manter o resumo no log
  ("N itens, mais recente de ...; M citam o presidente") e a regra de feed parado (10 dias).
- [ ] Manter o nome da fonte `planalto` no `status.json`, para o aviso do site e a rotina não mudarem.
- [ ] Remover o código e a constante do feed (`parsePlanaltoFeed`, `URL_FEED_PLANALTO`) e os testes dele, ou
  mantê-los como reserva. Recomendado: remover, para não sobrar código morto.
- [ ] Ajustar os testes de `tests/pipeline/run.test.ts` que montam o feed (`rdfPlanalto` em `tests/helpers.ts`).
- [ ] Teste de idempotência: duas execuções seguidas com a mesma página não reescrevem nenhum arquivo.

### Tarefa 4 — Recuperar o período sem coleta (uma vez)

- [ ] `retroagirComunicados(deps, ate)`: lê a listagem página por página (`b_start`) até passar da data `ate`, a uma
  requisição por segundo, com teto de páginas (ex.: 10) para não varrer o histórico inteiro.
- [ ] Expor no workflow: no "Run workflow", um campo "Recuperar comunicados desde (AAAA-MM-DD)", no mesmo molde da
  recoleta do PR #8. Se falhar, a execução fica vermelha.
- [ ] Rodar uma vez com `2026-09-27` e conferir no log quantos comunicados entraram.

### Tarefa 5 — Textos e documentação

- [ ] `site/sobre.html`: dizer que os comunicados vêm da página de notícias do Planalto e manter a regra dos 10 dias.
  Ajustar `tests/site/sobre.test.ts` se ele citar o feed.
- [ ] `docs/MANUTENCAO.md`: trocar a seção do feed pela da página (o que fazer se o layout mudar e como recapturar a
  fixture).
- [ ] ~~Tirar `planalto` de `FONTES_QUE_SO_AVISAM`~~: o dono decidiu manter sem e-mail por enquanto.

## Regras do projeto que este plano respeita

- **Na dúvida, omitir:** item sem data ou link válido é descartado; só entra quem cita o presidente (`citaPresidente`,
  sem mudança).
- **Falhar com aviso:** mudança de layout, redirecionamento ou página sem listagem é erro da fonte, e o aviso aparece
  no site.
- **Respeito ao servidor:** uma requisição por execução. Na recuperação, uma por segundo, com teto de páginas.
- **Teste primeiro:** fixtures reais antes do código. Nada em `data/` editado à mão.
- **Sem dependência nova:** cheerio já está no projeto.

## Riscos

- **Visual da página muda:** a fonte vira falha e o site avisa. A correção é recapturar a fixture e ajustar o
  seletor.
- **Bloqueio anti-robô do gov.br:** a agenda já é lida do mesmo domínio sem problema, então o risco é baixo. A Tarefa 1
  confirma.
- **Data só no texto da notícia, não na listagem:** obrigaria abrir cada notícia (mais requisições). Nesse caso, ler
  só as notícias novas (id ainda não gravado), uma por segundo.

## Tamanho

Três PRs pequenos: (1) workflow de captura e fixtures; (2) coletor, pipeline e testes; (3) recuperação, textos e
documentação. Cada um passa por `npm run typecheck && npm test && npm run build` e pelo CI antes do merge.
