# Rastreador do Presidente — Documento de Design

Data: 2026-10-08 · Status: aguardando revisão · Nome de trabalho: "Rastreador do Presidente" (nome final e domínio ficam para depois)

## 1. Objetivo

Um site público, somente de leitura, que mostra numa **linha do tempo** o que o Presidente da República fez e o que consta na sua agenda, usando exclusivamente dados públicos. Cada item traz a(s) fonte(s) com link direto para o dado de origem. O público-alvo é qualquer brasileiro, principalmente no celular.

Critérios de sucesso:
- Quem abre o site vê, sem rolar, o último registro oficial do presidente e os próximos compromissos.
- Todo item tem pelo menos um link para a fonte pública; item sem link não é publicado.
- O site nunca afirma que algo aconteceu sem um registro oficial que confirme.
- O site se atualiza sozinho, sem ação manual, a cada ~10 minutos.
- Não existe nenhum ponto de entrada de dados do usuário (sem login, formulário, comentário ou busca no servidor).
- Na virada de governo (01/01/2027) basta adicionar um mandato na configuração.

## 2. Escopo da versão 1

Dentro:
- Linha do tempo principal: agenda, atos oficiais (Diário Oficial) e comunicados oficiais do Planalto.
- Aba separada **Notícias** (imprensa), sem mistura com a linha do tempo.
- Filtros: data (dia ou período), tipo, status. Estado dos filtros na URL.
- Página estática "Sobre e metodologia".
- Carga histórica desde 01/01/2023, feita uma vez.
- Governo atual como ensaio; troca de mandato por configuração.

Fora (de propósito): login e qualquer entrada de usuário; outros políticos, vice e primeira-dama; gastos de viagem (Portal da Transparência); vetos do Congresso; fotos (Flickr) e YouTube; e-Agendas da CGU (usa reCAPTCHA; não contornamos); página HTML por dia para SEO; notificações push; resumos ou reescritas por IA (mostramos só o texto oficial).

## 3. Fontes de dados

Todas verificadas em 2026-10-08, salvo indicação.

| Fonte | Uso | Acesso | Observações |
|---|---|---|---|
| Agenda do Presidente (gov.br/planalto) | Eventos "agendado" / "consta na agenda" | HTML, uma página por dia: `.../agenda-do-presidente-da-republica-lula/agenda-do-presidente-da-republica/AAAA-MM-DD` | Histórico verificado até 01/01/2023. Requer `Accept: text/html` e User-Agent de navegador. Classes CSS `compromisso-inicio`, `-titulo`, `-local`. O caminho contém `-lula`; muda com o novo presidente. Dia sem agenda publicada (fim de semana, dias futuros além de ~1 semana) responde **HTTP 404** com a página padrão (título "Agenda do Presidente da República") e nenhum compromisso: isso é "dia sem agenda", não erro. Enviar `Accept: text/html`; com `*/*` o servidor devolve um JSON de erro |
| Diário Oficial da União (in.gov.br) | Atos (decretos numerados, leis, MPs) | HTML com JSON embutido (`jsonArray`) em `leiturajornal?data=DD-MM-AAAA&secao=do1` | Sem chave. Filtrar por `hierarchyStr` "Atos do Poder Executivo"; leis sancionadas devem ser confirmadas no esquema real durante a implementação |
| Planalto, texto de leis e decretos | Link "ver texto" quando existir | URLs `planalto.gov.br/ccivil_03/...` | Respondem 200; o link é montado pelo número do ato. Se não for possível montar, usar o link do DOU |
| Planalto, Notícias (RSS) | Comunicados oficiais ("registro oficial") | RSS/RDF em `.../acompanhe-o-planalto/noticias/RSS` | Cerca de 30 itens por leitura. Nem todo item cita o presidente (ver regra de relevância) |
| Google News RSS | Aba Notícias | `news.google.com/rss/search?q=...` | 100 itens, sem chave. Exibir só título, veículo, data e link |
| Agência Brasil RSS | Aba Notícias | `agenciabrasil.ebc.com.br/rss/politica/feed.xml` | Política geral; filtrar por relevância |

Termos de uso e cortesia: um coletor por fonte, pausa de 1 s entre requisições, cache, User-Agent identificado com contato, nenhuma carga paralela.

## 4. Arquitetura

```
Fontes ─► Coletores (1 por fonte) ─► Normalização ─► Ligação ─► data/*.json ─► Site estático
          GitHub Actions, ~10 min     formato único   agenda↔comunicado        (Pages, filtros no navegador)
```

Unidades (cada uma com uma função e interface própria):
- `collectors/<fonte>`: busca e faz o parse da fonte; devolve eventos brutos tipados. Falha isolada: uma fonte quebrada não afeta as outras.
- `pipeline/normalize`: bruto → formato `Evento`.
- `pipeline/link`: associa comunicado a compromisso de agenda (seção 6).
- `pipeline/write`: mescla com os dados existentes, valida contra o esquema e grava `data/`.
- `config/mandatos.json`: presidente, período, caminho da agenda, termos de relevância.
- `site/`: página única (TypeScript + Vite, sem framework pesado) que lê `data/` e filtra no navegador.
- `.github/workflows/`: agendamento, build e deploy.

Tecnologia: TypeScript em tudo; repositório público; hospedagem estática gratuita (GitHub Pages ou Cloudflare Pages; decidir na fase de deploy). O histórico do git registra cada mudança de dado e serve de auditoria.

### Armazenamento
- `data/eventos/AAAA-MM.json`: eventos do mês, ordenados por data/hora.
- `data/noticias.json`: últimos 14 dias de notícias.
- `data/status.json`: por fonte `{ ok, desde, mensagem? }` mais `ultimaNovidadeEm`. Só muda em transições de estado ou quando há novidade, para não gerar commits sem mudança. Alimenta o aviso de fonte com falha e o "última novidade há X".
- O site carrega primeiro o mês atual; meses anteriores só quando o filtro pedir.

## 5. Modelo de dados

`Evento`:
- `id`: estável. Agenda: `agenda:AAAA-MM-DD:HH:MM:n` (n = ordem entre eventos do mesmo horário). DOU: id numérico do ato. Comunicado: slug da URL.
- `tipo`: `agenda` | `ato` | `comunicado`
- `data` (ISO), `hora` (opcional), `titulo`, `local` (opcional)
- `status`: `agendado` | `consta_na_agenda` | `realizado` | `publicado` | `alterado` | `removido`
- `datas_ato` (só atos): `assinatura` e `publicacao`
- `fontes[]`: `{ nome, rotulo ("Planalto (governo)" | "Diário Oficial" | ...), url, coletadoEm }`; mínimo 1 item, url obrigatório
- `confirmadoPor[]`: ids de comunicados que confirmam um compromisso
- `historico[]`: versões anteriores quando `alterado`

Esquema JSON validado a cada execução; execução que gerar dado inválido não publica.

## 6. Regras de negócio

**Status**
- Compromisso de agenda futuro: `agendado`.
- Compromisso de agenda cujo dia passou, sem confirmação: `consta_na_agenda`. O tempo passar **não** o torna `realizado`.
- `realizado`: existe comunicado oficial ligado a ele.
- Ato do DOU: `publicado` (a publicação é o fato); mostrar data de assinatura e de publicação.
- Compromisso que mudou na agenda: `alterado` (versão anterior em `historico`). Que saiu da agenda: `removido`. Nunca apagar sem rastro.

**Relevância (comunicados do Planalto)**: entra só se o título/texto cita explicitamente o presidente (ex.: "Presidente da República", nome do presidente do mandato vigente). Vice, primeira-dama e ministros não entram. Itens ambíguos só entram se ligados a um compromisso (abaixo); caso contrário são descartados.

**Ligação comunicado ↔ agenda**: casar por mesma data e mesmo local (normalizados). Se há exatamente um candidato, liga e marca `realizado`. Se há zero ou mais de um, o comunicado aparece como item próprio de "registro oficial" e não marca nenhum compromisso. Errar para menos.

**Fontes**: item sem `url` de fonte não é publicado. Selo "Confirmado por N fontes" (N = fontes distintas) ou "Fonte única"; toda fonte é hyperlink para o dado de origem.

## 7. Interface (mobile-first)

1. Cabeçalho: nome, "última novidade há X", abas **Linha do tempo | Notícias**; indicação de fonte sem atualizar quando aplicável.
2. Cartão "Último registro": o item `realizado`/`publicado` mais recente, com fontes.
3. Faixa "Próximos compromissos": hoje e próximos dias, tom neutro.
4. Linha do tempo vertical por dia, mais novo primeiro; cada item: ícone, hora, título, local, status, selo e links de fonte, âncora permanente.
5. Filtros: data (dia/período), tipo, status; refletidos na URL (parâmetros lidos com validação rígida).
6. Aba Notícias: lista separada (título, veículo, data, link), com aviso de que é imprensa, não registro oficial.
7. Página "Sobre e metodologia": fontes, significado de cada status, limitações.

Acessibilidade: HTML semântico (`ol`, `time`), teclado e leitor de tela, contraste AA, nada depende só de cor (ícone + texto), tema claro/escuro, respeita `prefers-reduced-motion`, carga leve.

## 8. Erros e confiabilidade

- Fonte indisponível: manter dados anteriores, registrar em `status.json`, exibir aviso.
- Layout inesperado da agenda (página sem o título esperado, ou HTTP 200 sem o contêiner `.list-compromissos`): tratar como falha, não sobrescrever e registrar em `status.json`. Dia com HTTP 404 = sem agenda (não é falha) e **nunca** marca compromissos como removidos; só um dia com HTTP 200 em que o compromisso deixou de aparecer o marca como removido.
- O workflow só falha (e notifica) quando uma fonte está com falha em duas execuções seguidas, para não gerar alarme por instabilidade momentânea.
- Retry com backoff; pausa entre requisições; execução idempotente.
- Carga histórica desde 01/01/2023 como tarefa única, lenta e retomável.
- Falha do workflow notifica o mantenedor.

## 9. Segurança

- Nenhuma entrada de usuário, backend, banco de dados ou sessão.
- Todo texto vindo das fontes é renderizado como texto puro (nunca como HTML); links só com esquema `https`.
- Parâmetros de URL (filtros) validados contra lista permitida.
- Content-Security-Policy restritiva (sem scripts de terceiros).
- Repositório público; segredos, se houver, apenas em segredos do GitHub Actions (previsto nenhum na V1).

## 10. Testes

- Parsers com páginas reais salvas como fixtures (várias datas, incluindo 01/01/2023, dia sem eventos e dia com 404 + corpo válido).
- Regra de ligação: casos claros ligam; ambíguos não ligam.
- Regra de relevância dos comunicados com os casos reais ambíguos já observados.
- Segurança: texto com `<script>` aparece como texto.
- Validação dos JSON gerados contra o esquema.
- Acessibilidade: axe automatizado + teste manual em celular e leitor de tela.

## 11. Troca de governo

`config/mandatos.json` lista presidentes com nome, início, fim, caminho da agenda e termos de relevância. Em 01/01/2027 adiciona-se o novo mandato; os dados do anterior permanecem intactos e consultáveis (filtro de mandato é evolução futura). Verificar nesse dia o novo caminho da agenda.

## 12. Limitações conhecidas da V1 (devem constar em "Sobre e metodologia")

- Comunicados do Planalto: o feed só traz ~30 itens recentes, então esse histórico existe **a partir do início da coleta**; agenda e DOU têm histórico desde 01/01/2023.
- Mudança de horário de um compromisso aparece como "removido" (horário antigo) + novo item (o id inclui o horário). Mudança de título ou local no mesmo horário aparece como "alterado".
- Um comunicado só confirma um compromisso do **mesmo dia** (data de publicação do comunicado = data do compromisso) e mesmo local. Publicações em dia posterior não ligam.
- Agenda e comunicados são ambos do governo: "confirmado por N fontes" conta documentos distintos, mas fontes governamentais não são independentes entre si.
- O texto do ato no Planalto só é adicionado como fonte quando a URL montada responde 200; caso contrário fica apenas o link do DOU.

## 13. Decisões adiadas

- Nome final do projeto e domínio (verificar qual benefício o usuário tem no GitHub; alternativa `.com.br` via Registro.br).
- Provedor de hospedagem (GitHub Pages vs Cloudflare Pages).
- Esquema exato do DOU para leis e MPs, e montagem dos links do Planalto (resolver durante a implementação, com teste).
- Evolução: Portal da Transparência (viagens), vetos do Congresso, Flickr, página por dia para SEO.
