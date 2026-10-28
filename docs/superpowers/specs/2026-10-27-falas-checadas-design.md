# Falas checadas: design

Data: 27/10/2026. Situação: aprovado na conversa de brainstorming. A fase 1 é implementada agora; a fase 2 depende de
uma captura real da fonte (ver "Fase 2").

## Propósito

Uma aba nova, separada dos registros oficiais, que reúne **checagens de falas do presidente feitas por agências
independentes de checagem** em entrevistas, podcasts, discursos, debates, coletivas e pronunciamentos.

O site não checa nada por conta própria. Ele registra que "a agência X checou a fala do presidente no evento Y" e leva o
visitante até a checagem completa. Isso mantém as duas regras do projeto:

- **Na dúvida, omitir.** Só entra checagem de um evento em que a agência transcreveu e checou falas do próprio
  presidente. Checagem de boato *sobre* o presidente ("é falso que Lula disse X") não entra.
- **Falhar com aviso.** Lista inválida não é publicada pela metade: a coleta marca a falha e o site mantém o último
  arquivo bom.

### Por que a unidade é "a checagem de um evento"

Pesquisa feita em 27/10/2026:

- Não há monitor público e contínuo de todas as falas do presidente. As agências escolhem o que checam.
- As agências publicam matérias por evento ("Checamos a entrevista de Lula ao Flow", "Checamos o discurso de Lula na
  ONU"), em que transcrevem a fala e checam frase por frase. Nessas matérias, a autoria da fala é atestada pela própria
  agência, o que resolve o maior risco (atribuir ao presidente uma frase que ele não disse).
- Não há API pública das agências. A Fact Check Tools API do Google exige chave e não distingue, de forma confiável,
  fala do presidente de boato sobre ele.

Por isso, a fase 1 é uma **lista conferida à mão**, no mesmo modelo de `config/locais.json`.

### Agências aceitas

Critério: agência na lista de signatárias verificadas da IFCN (International Fact-Checking Network), publicada em
`https://github.com/IFCN/verified-signatories`. Em 27/10/2026 a lista traz, do Brasil:

| Agência          | Na lista da IFCN            | Endereços aceitos                                                                                      |
| ---------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Aos Fatos        | `aosfatos.org`              | `https://www.aosfatos.org/noticias/`                                                                   |
| Estadão Verifica | `politica.estadao.com.br`   | `https://www.estadao.com.br/estadao-verifica/`, `https://politica.estadao.com.br/blogs/estadao-verifica/` |
| AFP Checamos     | `factcheck.afp.com` (a AFP) | `https://checamos.afp.com/`                                                                            |
| Lupa             | não (ver abaixo)            | `https://www.agencialupa.org/checagem/`                                                                |

- **Lupa**: não aparece na lista do GitHub consultada em 27/10/2026, mas a verificação pela IFCN foi confirmada pelo
  mantenedor em 28/10/2026 e ela foi incluída.
- **Comprova** ficou de fora: é uma coalizão de veículos, não uma signatária.

## Fase 1: checagens conferidas à mão

### Arquivos

```
config/agencias.json   agências aceitas (nome e prefixos de endereço)        ← editado à mão
config/checagens.json  checagens conferidas                                 ← editado à mão
src/pipeline/falas.ts  valida as duas tabelas e monta a lista publicada
data/falas.json        lista publicada, gravada pelo robô                   ← nunca à mão
site/falas.html        a página "Falas checadas"
```

### Formato de uma checagem (`config/checagens.json`)

Exemplo ilustrativo: datas, números e textos são fictícios.

```json
{
  "id": "2026-03-12-aos-fatos-entrevista-flow",
  "data": "2026-03-12",
  "tipo": "podcast",
  "evento": "Entrevista ao podcast Flow",
  "agencia": "aos-fatos",
  "titulo": "Checamos a entrevista de Lula ao Flow",
  "url": "https://www.aosfatos.org/noticias/checamos-entrevista-lula-ao-flow/",
  "publicadaEm": "2026-03-13",
  "vereditos": [{ "rotulo": "Falso", "frases": 3 }],
  "errata": { "data": "2026-03-14", "texto": "..." }
}
```

Regras validadas no código, todas com teste:

- `id`: minúsculas, números e hífens, começando pela `data`. Não pode repetir. Também não pode repetir a `url`.
- `data` (dia da fala): dentro de um mandato de `config/mandatos.json` e nunca depois de hoje.
- `tipo`: `entrevista`, `podcast`, `discurso`, `debate`, `coletiva` ou `pronunciamento`.
- `agencia`: id existente em `config/agencias.json`. A `url` precisa ser `https` e começar por um dos prefixos dessa
  agência. Isso pega link colado errado ou de outro site.
- `publicadaEm` (dia da checagem): não pode ser antes da `data` nem depois de hoje.
- `vereditos` (opcional): rótulo com as palavras da agência e quantas frases o receberam. Sem tradução para uma escala
  nossa. Se a matéria não deixa claro, o campo não é preenchido.
- `errata` (opcional): correção publicada pela agência, com data não anterior a `publicadaEm`. Aparece no cartão.
- Textos têm tamanho máximo (evento 200, título 300, rótulo 60, errata 600 caracteres).

### Pipeline

- A cada coleta, `atualizar` lê e valida as duas tabelas e grava `data/falas.json` (ordenado da fala mais recente à mais
  antiga), no mesmo formato da tabela mais o nome da agência.
- Tabela inválida: a fonte `checagens` fica com falha no `status.json`, o arquivo anterior fica como estava e o site
  avisa. Como é erro nosso, e não de servidor público, a falha que passar de 6 horas derruba o workflow (e-mail).
- Duas execuções sem mudança não reescrevem o arquivo.
- O CI valida a tabela real em todo push e pull request.

### Página `falas.html`

- Item novo no menu de todas as páginas: "Falas checadas", entre Notícias e Sobre.
- Aviso no topo: a seção não é registro oficial; reúne checagens de agências independentes; quem escolhe o que checar e
  dá o veredito são as agências; o site não avalia falas.
- Filtro por tipo na URL (`falas.html?tipo=entrevista`), em links simples, com a opção atual marcada. Valor desconhecido
  é ignorado.
- Cada cartão: tipo e data da fala, evento, agência e data da checagem, link para a matéria (título da agência),
  vereditos e errata.
- A página não entra nos totais da capa nem na página Registros.
- Mesmas regras de todas as páginas: texto só com `textContent`, links validados por `urlHttpsSegura`, nada inline,
  caminhos relativos, verificação de acessibilidade com o axe.

### Sobre e manutenção

- Sobre ganha a seção "Falas checadas": de onde vêm, o critério das agências, que a lista é conferida à mão, que o site
  não faz checagem própria e o que fica de fora (boatos sobre o presidente).
- `docs/MANUTENCAO.md` ganha o roteiro de como acrescentar uma checagem, com exemplo.

## Fase 2: falas oficiais do Planalto

Teste feito em 27/10/2026 com o workflow "Testar endereço de feed":

- `https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/discursos-e-pronunciamentos` e `.../entrevistas`
  respondem 200 (HTML).
- `/RSS` e `/atom.xml` das duas respondem 404: não há feed.

Plano:

1. Capturar uma página real de cada listagem como fixture de teste (ampliar a saída do `testar-feed.yml` ou captura
   manual).
2. Coletor `src/collectors/falas.ts`: lê título, data e link de cada transcrição. Layout diferente do esperado é erro da
   fonte, nunca lista vazia.
3. A aba ganha a lista "Falas oficiais (transcrições do Planalto)".
4. Uma checagem pode apontar a transcrição oficial por um campo `falaOficial` em `config/checagens.json`, preenchido à
   mão. Ligação automática não existe, pelo mesmo motivo que deixa `link.ts` desligado.

## Fora do escopo

- Checagem própria, selo próprio ou nota de "veracidade" calculada pelo site.
- Captação ou transcrição automática de transmissões.
- Atualização "ao vivo" por polling: as agências publicam horas ou dias depois, e o ciclo de 10 minutos basta.
