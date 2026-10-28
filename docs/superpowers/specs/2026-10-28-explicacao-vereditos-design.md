# Explicação de cada veredito: design

Data: 28/10/2026. Situação: proposta, aguardando aprovação **e autorização do Aos Fatos**. Complementa
`2026-10-28-falas-automaticas-design.md`.

## Propósito

Na página "Falas checadas", mostrar embaixo de cada veredito o **resumo da explicação escrito pela própria agência**,
como o Aos Fatos faz no site dele:

> “Um país que é o terceiro produtor de proteína animal do mundo”
> Veredito da agência: Verdadeiro
> Resumo do Aos Fatos: De acordo com dados de 2020 da FAO, o Brasil é o terceiro maior produtor de proteína animal do
> planeta, atrás da China e dos Estados Unidos.

O site continua só consumindo o que a agência publicou: não resume, não reescreve e não traduz.

## Condição antes de tudo: autorização

O resumo é texto do Aos Fatos ("Todos os direitos reservados" no rodapé). **Nada é implementado nem exibido antes de
uma autorização por escrito do Aos Fatos.** O pedido foi enviado em 28/10/2026 para o canal institucional publicado
nas páginas deles (ouvidoria). A autorização (data e condições, sem dados pessoais) fica registrada em
`docs/MANUTENCAO.md`.

- Cada agência tem uma chave em `config/agencias.json`, `exibirExplicacao` (padrão `false`). Só agência autorizada
  liga a chave. Hoje: nenhuma.
- Se a agência pedir para retirar, basta desligar a chave: o site para de mostrar na publicação seguinte, e o
  pipeline apaga do arquivo as explicações dessa agência.

## Fonte: o que a captura mostrou (28/10/2026)

O workflow "Capturar página para teste" baixou três matérias (Flow, RedeTV, transposição do São Francisco). Cada
frase checada está num bloco `<script type="application/ld+json">` do tipo `ClaimReview`, com:

| Campo                     | Exemplo                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `claimReviewed`           | a frase, igual à que a Fact Check API devolve                      |
| `itemReviewed.author.name`| `Lula`                                                             |
| `reviewRating.alternateName` | `falso`, `verdadeiro`, `não_é_bem_assim`                        |
| `reviewBody`              | o resumo da explicação, 140 a 403 caracteres nas seis frases vistas |
| `url`                     | a matéria                                                          |

O resumo está **no mesmo bloco da frase**: não é preciso adivinhar qual parágrafo da matéria explica qual frase.
A página também repete esses dados dentro de um script do Next.js, escapados; esse trecho é ignorado.

## Regras para ligar um resumo a uma frase (todas com teste, a partir das páginas capturadas)

Para cada frase de `data/frases-checadas.json` de agência com `exibirExplicacao: true` e ainda sem resumo conferido:

1. Ler a matéria (a `url` da frase), **uma vez por URL**, só se for `https` e do domínio da agência; redirecionamento
   para outro domínio é erro. Corpo acima de 2 MB é erro.
2. Considerar só os blocos `application/ld+json` de nível superior cujo `@type` inclua `ClaimReview`.
3. O resumo entra só se houver exatamente um texto de `reviewBody` para blocos em que:
   - `claimReviewed` normalizado é **igual** à frase normalizada (nunca "contém");
   - `reviewRating.alternateName` é **igual** ao veredito gravado;
   - `itemReviewed.author.name` normalizado é um nome aceito do presidente (a mesma regra das frases).
   Blocos repetidos com o mesmo texto contam como um. Dois resumos diferentes para a mesma frase: fica sem resumo.
4. O resumo, depois de limpar espaços, precisa ter entre 20 e 600 caracteres e pelo menos uma letra. Senão, fica sem.
5. Na dúvida, fica sem resumo: a frase continua aparecendo com o veredito e o link, como hoje.

## Dados

Arquivo novo `data/explicacoes.json`, separado, para não reescrever as frases já gravadas:

```json
{ "id": "aos-fatos-3f9a1c2b7d12", "resumo": "Desde 1974, a escolha…", "conferidaEm": "2026-10-28T13:00:00.000Z" }
```

- `id` é o da frase. Sem resumo encontrado, a entrada é gravada sem `resumo`, para não ler a matéria de novo a cada
  hora; uma nova tentativa só acontece depois de 30 dias.
- Item já gravado com resumo não é reescrito. Duas execuções sem novidade não reescrevem o arquivo.
- Ritmo: roda junto com as frases (uma vez por hora), uma requisição por segundo, no máximo 10 matérias por rodada.
  A carga inicial (19 matérias hoje) termina em duas rodadas.

## Status e falhas

- Fonte nova `explicacoes` no `status.json` ("Resumos das agências"), em `FONTES_QUE_SO_AVISAM`.
- Rede, HTTP de erro, página sem nenhum bloco `ClaimReview` (provável mudança de layout) ou JSON quebrado: erro da
  fonte, com aviso. Nada já gravado é apagado.

## Página

- Embaixo do veredito: `<p class="explicacao">` com "Resumo do {agência}:" em negrito e o texto, só por `textContent`.
- O link "Por que esse veredito? Ler a explicação completa em {agência}" continua.
- A Sobre explica de onde vem o resumo, que é texto da agência reproduzido com autorização, e que nem toda frase tem
  resumo. Teste em `tests/site/sobre.test.ts`.
- Mesmas regras de sempre: sem `innerHTML`, nada inline, axe sem violações.

## Fora do escopo

- Ler o corpo da matéria (parágrafos) ou qualquer coisa além dos blocos `ClaimReview`.
- Resumir, encurtar ou traduzir o texto da agência.
- Outras agências, até cada uma autorizar.

## Plano resumido (detalhado depois da aprovação e da autorização)

1. Fixtures: as três páginas capturadas, reduzidas aos blocos `ld+json` e a um trecho do script do Next.js.
2. Coletor `src/collectors/claimreview.ts` (só interpreta o HTML), com testes.
3. Pipeline: regras de ligação, `data/explicacoes.json`, status, chave por agência, limite de tamanho em `buscarTexto`.
4. Site, Sobre e `docs/MANUTENCAO.md`.
