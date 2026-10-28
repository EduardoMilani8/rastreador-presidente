# Falas checadas automáticas: design

Data: 28/10/2026. Situação: proposta, aguardando aprovação. Complementa
`2026-10-27-falas-checadas-design.md` (lista conferida à mão, que continua existindo).

## Propósito

Mostrar na página "Falas checadas", sem ninguém cadastrar à mão, **cada frase do presidente que uma agência de checagem
verificou**: a frase, o veredito com as palavras da agência e a fonte (nome da agência e link para a checagem
completa). O site só consome o que as agências já publicaram; não checa nem dá nota.

As regras do projeto continuam decidindo:

- **Na dúvida, omitir.** A frase só entra se a **própria agência** disser que quem falou foi o presidente. Autor
  ambíguo, ausente ou diferente fica de fora.
- **Falhar com aviso.** Se a fonte cair ou mudar, nada é apagado e o site mostra que ela está sem atualizar.

## O que o teste mostrou (28/10/2026)

O workflow "Testar Fact Check API" consultou a Fact Check Tools API do Google (`claims:search`, que reúne as marcações
ClaimReview das agências) com a busca "Lula":

| Agência          | Checagens | Campo "quem disse" (`claimant`)                         | Falas do presidente       |
| ---------------- | --------- | ------------------------------------------------------- | ------------------------- |
| Aos Fatos        | 300+      | `Lula` nas falas dele; `desinformação` nos boatos        | 41 em 300                 |
| Estadão Verifica | 300+      | só boatos ("Boatos de redes sociais" e variantes)       | nenhuma                   |
| AFP Checamos     | ~100      | quase tudo "Várias fontes"; um "Lula Flávio Bolsonaro"  | nenhuma                   |
| Lupa             | 0         | não aparece na API (`agencialupa.org` e `lupa.uol.com.br`) | nenhuma                |

Também apareceram: o boato "Lula disse que fará de tudo para tomar o poder" com autor `uniaopatriotabrasil`, e
"Lula diz no Flow que emprestou R$ 24 milhões…" com autor "Várias fontes". Os dois ficam de fora pelo filtro de
autor, como deve ser. Houve um item do Aos Fatos cuja frase era só "/", e a API respondeu 503 em parte das consultas.

**Decisão do mantenedor:** aceitar, por ora, a parte automática praticamente só com o Aos Fatos. As outras agências
entram sozinhas se passarem a marcar falas do presidente na API.

## Fonte e coleta

- Endpoint: `https://factchecktools.googleapis.com/v1alpha1/claims:search`, com `query` = cada nome de
  `config/mandatos.json` (`nomes`, hoje "Lula"), `languageCode=pt`, `reviewPublisherSiteFilter` = domínio de cada
  agência de `config/agencias.json` e `maxAgeDays=30` na coleta normal (no máximo 3 páginas de 100 por agência).
- **A chave vai no cabeçalho `X-Goog-Api-Key`, nunca no endereço.** A mensagem de erro de `buscarTexto` inclui o
  endereço e vai para `data/status.json`, que é público. `buscarTexto` ganha um parâmetro opcional de cabeçalhos; um
  teste garante que nenhuma mensagem gravada contém a chave.
- A chave vem do segredo `FACTCHECK_API_KEY`, passado como variável de ambiente só ao passo "Coletar fontes" do
  `update.yml`. Execução local sem a chave pula essa fonte sem erro e sem tocar no arquivo.
- Uma requisição por segundo (a pausa que `buscarTexto` já faz), em série. Erro 5xx é repetido (já é o comportamento
  de `buscarTexto`).
- Carga inicial: `npm run backfill-frases` (sem `maxAgeDays`, até 5 páginas por agência), rodado uma vez no Actions.

## Regras de aceitação (todas com teste, a partir de um trecho real da API)

Para cada par (frase, checagem) da resposta:

1. **Autor:** `claimant`, normalizado (sem acento, minúsculo, espaços simples), precisa ser **igual** a um nome do
   presidente do mandato da data da frase: `presidente` ou um dos `nomes` de `config/mandatos.json`, com ou sem o
   prefixo "presidente". Igual, não "contém": "Lula Flávio Bolsonaro" fica de fora.
2. **Agência:** a URL da checagem precisa começar por um prefixo de `config/agencias.json` (a mesma regra da lista
   manual, que já recusa `https://site@golpe/`, sufixo de domínio e `../`).
3. **Frase:** depois de limpar espaços, entre 15 e 1.000 caracteres e com pelo menos uma letra. "/" fica de fora.
4. **Veredito:** `textualRating` não vazio, até 60 caracteres.
5. **Datas:** `claimDate` (dia da frase) e `reviewDate` (dia da checagem) válidas, não futuras, e a frase dentro de um
   mandato configurado. Sem `claimDate`, a data da frase fica igual à da checagem.
6. **Exclusão manual:** `config/frases-excluidas.json` (id e motivo, conferida à mão) tira um item específico se a
   agência tiver marcado algo errado. Saída de emergência, não curadoria.

Item que não passa em alguma regra é **descartado sem derrubar os outros** (é dado de terceiros, não tabela nossa).
Se nenhum item vier e a API responder sem erro, não é falha: a lista só não cresce.

## Dados

`data/frases-checadas.json`, gravado pelo robô:

```json
{
  "id": "aos-fatos-3f9a1c2b7d",
  "frase": "Alexandre de Moraes, sabe, mandou prender o cara que matou a Marielle",
  "data": "2026-09-17",
  "agencia": "aos-fatos",
  "agenciaNome": "Aos Fatos",
  "veredito": "não_é_bem_assim",
  "url": "https://www.aosfatos.org/noticias/lula-flavio-crise-stf/",
  "titulo": "Título da checagem, se a API trouxer",
  "publicadaEm": "2026-09-17",
  "coletadoEm": "2026-10-28T12:00:00.000Z"
}
```

- `id` = agência + resumo (hash curto) da URL da checagem com a frase normalizada. Estável entre execuções.
- O veredito é guardado como a agência escreveu. A tela só troca `_` por espaço e põe a primeira letra maiúscula
  ("Não é bem assim"); nunca traduz para uma escala nossa.
- **Acumula:** item já gravado não some porque a API deixou de devolvê-lo (a cobertura da API varia). Só sai pela
  exclusão manual. Se a agência editar a frase, entra um item novo e o antigo continua (limite documentado na Sobre).
- Duas execuções sem novidade não reescrevem o arquivo (regra do projeto, com teste).

## Status e falhas

- Fonte nova `frases` no `status.json` (nome no site: "Frases checadas (Google Fact Check)").
- Falha (rede, 4xx, 5xx persistente, corpo que não é o JSON esperado): o arquivo fica como estava e o site avisa.
- Por ser uma API "alpha" de terceiro, entra em `FONTES_QUE_SO_AVISAM` (avisa no site e no log, não manda e-mail).
- Chave recusada (HTTP 400/403 com motivo de chave) tem mensagem própria, sem a chave: "chave da Fact Check API
  recusada; confira o segredo FACTCHECK_API_KEY".

## Página `falas.html`

1. **Frases checadas pelas agências** (automático, no topo): um cartão por checagem (mesma URL), da mais recente à
   mais antiga, com:
   - título da checagem (ou "Checagem de {agência}"), agência e data;
   - a lista de frases dessa checagem, cada uma entre aspas (`<blockquote>`, só `textContent`) com "Veredito de
     {agência}: {veredito}";
   - o link "Ler a checagem completa em {agência}" (`urlHttpsSegura`).
2. **Checagens de eventos (lista conferida à mão)**: a seção que já existe. Se uma checagem manual tiver a mesma URL de
   uma automática, aparece só a automática, que tem mais detalhe.
- Aviso do topo ganha uma frase: "As frases e os vereditos são atribuídos ao presidente pelas próprias agências."
- Mais de 20 checagens: as 20 mais recentes à vista e o resto num `<details>` "Checagens anteriores".
- Mesmas regras de sempre: sem `innerHTML`, links só `https`, axe sem violações, nada inline.

## Sobre e manutenção

- Sobre: de onde vem a parte automática (marcação ClaimReview das agências, reunida pela API do Google), o filtro pelo
  autor marcado pela agência, que hoje só o Aos Fatos marca falas do presidente, que a Lupa não aparece na API, que
  itens não somem sozinhos e que existe a exclusão manual. Teste em `tests/site/sobre.test.ts`.
- `docs/MANUTENCAO.md`: o segredo, o que fazer se a chave expirar e como excluir um item.

## Fora do escopo

- Checagem própria, nota ou cor por veredito.
- Ligar automaticamente frase a compromisso da agenda.
- Ler HTML das agências (a API cobre o que elas marcam; o resto continua na lista manual).

## Plano resumido (detalhado depois da aprovação)

1. Capturar uma resposta real da API como fixture (opção no workflow de teste para salvar o JSON como artefato).
2. `buscarTexto` com cabeçalhos; coletor `src/collectors/factcheck.ts` (só interpreta a resposta), com testes.
3. Pipeline: regras de aceitação, `data/frases-checadas.json`, status, exclusão manual, carga inicial.
4. Site: seção automática na página; Sobre; manutenção.
5. Segredo no `update.yml` e carga inicial no Actions.
