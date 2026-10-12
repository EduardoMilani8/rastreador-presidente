# Regras do painel: frases para a página Sobre

Texto pronto para a página "Sobre e metodologia". Cada frase descreve o que o código faz hoje
(`src/pipeline/derivados.ts`, `src/pipeline/viagens.ts`, `config/locais.json`). Se uma regra mudar no código, a frase
correspondente precisa mudar junto.

## Números do topo (`data/resumo.json`)

- Os números do alto do painel contam tudo o que está guardado no site: compromissos da agenda, atos do Diário Oficial
  e comunicados do Planalto, desde 01/01/2023.
- Compromisso que saiu da agenda oficial continua na contagem, porque continua guardado e aparece nos registros como
  "Removido da agenda".
- Os números são recalculados a cada coleta. Não são estimativa: são a contagem dos registros publicados aqui.

## Viagens (`data/viagens.json`)

- O mapa mostra cidades fora do Brasil em que a agenda oficial registra compromissos do presidente.
- A agenda escreve o local em texto livre ("Sede das Nações Unidas – Nova York", "Casa Branca", "Bharat Mandapam").
  Para saber a cidade, usamos uma tabela feita e conferida à mão, que liga cada texto conhecido a uma cidade. A tabela
  é pública e está no repositório, em `config/locais.json`.
- Texto que a tabela não reconhece fica de fora. O site nunca adivinha a cidade por semelhança de nome.
- Local genérico, como "Local de hospedagem", "Palácio Presidencial", "Sala de Bilaterais" ou o nome de um hotel que
  existe em várias cidades, não identifica a cidade sozinho e fica de fora. Por isso o número de compromissos de cada
  cidade é o mínimo que conseguimos confirmar pelo texto da agenda; o número real costuma ser maior.
- Texto que termina com sigla de estado brasileiro ("Nova York - MA", "Buenos Aires (PE)") nunca é tratado como cidade
  de outro país.
- Compromisso removido da agenda não entra na contagem das viagens.
- Escala técnica não é viagem: cidade em que a agenda só registra chegada ou partida em aeroporto ou base aérea fica
  fora do mapa. Em cidade que tem algum compromisso fora do aeroporto, a chegada e a partida também são contadas.
- "Compromissos" é a quantidade de itens da agenda naquela cidade. "Dias" é a quantidade de datas diferentes em que há
  pelo menos um item. O período vai do primeiro ao último dia com registro, e pode juntar várias visitas à mesma
  cidade.
- A posição no mapa é a da cidade, não a do endereço do compromisso.
- Dias inteiros no exterior em que a agenda não publica o local, ou só publica locais genéricos, não aparecem.
- Só aparecem viagens que constam na agenda oficial publicada. Viagem sem agenda publicada não aparece.

### Situação em 12/10/2026

- 55 cidades em 40 países, com 669 itens da agenda.
- 12 cidades reconhecidas ficaram de fora por serem só escala: Letícia, Anchorage, Houston, Calgary, Porto, Brindisi,
  Acra, Túnis, Casablanca, Ilha do Sal, Praia e São Tomé.
- Dos 1.155 textos de local diferentes que a agenda já usou, 324 estão na tabela. Os outros 831 ficam sem
  classificação: a grande maioria é de lugares no Brasil, e uma parte menor é de locais genéricos no exterior.

## Gastos (`data/gastos.json`)

Ainda não há coleta. O recorte está em análise; esta seção será escrita quando ele for aprovado.
