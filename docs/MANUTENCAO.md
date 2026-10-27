# Manutenção

Guia para quem mantém o repositório e a publicação do site. Para entender o projeto ou contribuir, comece pelo
[README](../README.md) e pelo [CONTRIBUTING](../CONTRIBUTING.md).

## Configuração no GitHub (uma vez, feita pelo dono)

1. Crie um repositório **público** e envie este código para o ramo `main`.
2. Em **Settings → Pages**, escolha **Source: GitHub Actions**.
3. Pronto. Não é preciso mudar as permissões gerais do repositório em Settings → Actions: o workflow declara as
   permissões de que precisa (`contents: write` só no job que grava `data/`, e `pages: write` no de publicação).
4. Não é preciso criar nenhum segredo nem variável. O `CONTATO_URL` (endereço que vai no User-Agent das requisições,
   para as fontes saberem quem está consultando) é definido pelo próprio workflow com a URL do repositório. Não o
   defina à mão e não coloque e-mail pessoal em lugar nenhum.

O primeiro `push` já dispara a coleta e a publicação. O endereço do site aparece no resumo do job "publicar".

## O que significam os e-mails de falha

O GitHub avisa por e-mail quando uma execução do workflow falha. Aqui isso acontece em dois casos:

- **Uma fonte está fora do ar há mais de 6 horas.** O log do passo "Coletar fontes" mostra o erro de cada fonte nessa
  execução (`Falha em dou: ...`) e diz quais passaram do limite (`Fontes com falha há mais de 6 horas: agenda, dou...`);
  `data/status.json` guarda o motivo da primeira falha. Falhas mais curtas só aparecem como aviso no site, sem e-mail.
  **Exceções: o DOU e os Comunicados do Planalto.** O DOU por ser instável e o Planalto porque o feed parou em
  27/09/2026 sem substituto conhecido: os dois só avisam (site, log e rotina de verificação) e nunca derrubam o
  workflow; a lista está em `FONTES_QUE_SO_AVISAM`, em `src/pipeline/run.ts`. Por isso, **olhe o aviso do site ou
  `data/status.json` de vez em quando**: se um deles ficar fora por dias, nenhum e-mail vai avisar. Passado o limite, nas outras fontes, enquanto a fonte continuar fora do ar, **chega um e-mail a cada 10 minutos**; eles param sozinhos
  quando ela volta. Os dados já
  publicados continuam no ar e o site mostra um aviso com o nome da fonte.
  - `páginas de agenda pediram login`: dois ou mais dias da agenda passaram a exigir login. Em geral é o site do
    Planalto bloqueando o acesso. Se forem mesmo dois dias não públicos, os avisos só param quando um deles sair da
    janela de coleta — e, como a janela recua enquanto a fonte está em falha, isso pode levar **até 14 dias**.
  - `coleta interrompida depois de 2 falhas de rede seguidas`: a fonte não respondeu; a execução desiste dela para
    não estourar o tempo do job e tenta de novo na próxima.
  - `Feed parado: o item mais recente é de DD/MM/AAAA` (Comunicados do Planalto): o feed responde, mas não traz nada
    novo há mais de 10 dias. Em 27/09/2026 o Planalto deixou de atualizar `.../noticias/RSS`, e o link "RSS" do rodapé
    (`.../ultimas-noticias/RSS`) devolve uma página HTML. Para testar outro endereço sem mexer no código, use
    **Actions → Testar endereço de feed → Run workflow**; achando um que funcione, ajuste `URL_FEED_PLANALTO` em
    `src/collectors/planalto.ts`.
  - `HTTP 404` no DOU ou `Redirecionamento inesperado`: o endereço da fonte mudou; é preciso ajustar o coletor.
- **Não há mandato configurado para a data de hoje** (ver abaixo). A coleta para por completo até a configuração ser
  atualizada; depois de 24 horas sem mudança nos dados, o site passa a mostrar "Última alteração nos dados: ...".
- **A publicação falhou** (job "publicar", passo `deploy-pages`, mensagem `No artifacts named "github-pages"`). É uma
  demora do GitHub em listar o pacote recém-enviado; o workflow já tenta de novo sozinho depois de 30 segundos. Os
  dados continuam gravados e a próxima coleta com novidade publica tudo. **Não use "Re-run"**: a reexecução parte do
  commit antigo e falha por outro motivo. Para publicar na hora, use **Run workflow**.

Se os e-mails incomodarem durante uma falha longa, desative o workflow em **Actions → Atualizar dados e publicar →
Disable workflow** e reative depois; na volta, a coleta recua até 14 dias para recuperar o período (para mais do que
isso, use `npm run backfill`).

Para recoletar agenda e Diário Oficial de um período sem ligar o PC: **Actions → Atualizar dados e publicar → Run
workflow**, preenchendo "Recoletar a partir de" e "Recoletar até" (AAAA-MM-DD). É o mesmo `npm run backfill`, com uma
requisição por segundo; use intervalos curtos (o job tem 15 minutos). Se algum dia falhar, a execução fica vermelha e o
log diz quais dias repetir. O log da coleta normal também mostra quantos itens o feed do Planalto trouxe, a data do mais
recente e quantos citam o presidente.

## Falas checadas: acrescentar uma checagem

A página "Falas checadas" mostra o que está em `config/checagens.json`. A lista é conferida à mão: o robô não procura
checagens sozinho.

**O que entra:** matéria de uma agência listada em `config/agencias.json` em que ela transcreveu e checou falas do
**próprio presidente** num evento (entrevista, podcast, discurso, debate, coletiva ou pronunciamento). **Não entra:**
checagem de boato, montagem ou frase falsa atribuída ao presidente ("é falso que Lula disse..."). Na dúvida, não
acrescente.

1. No GitHub, abra `config/checagens.json` → ícone de lápis.
2. Acrescente um item (a ordem no arquivo não importa; o site ordena pela data da fala):

   ```json
   {
     "id": "2026-03-12-aos-fatos-entrevista-radio",
     "data": "2026-03-12",
     "tipo": "entrevista",
     "evento": "Entrevista à Rádio Exemplo",
     "agencia": "aos-fatos",
     "titulo": "Título exatamente como a agência publicou",
     "url": "https://www.aosfatos.org/noticias/endereco-da-materia/",
     "publicadaEm": "2026-03-13",
     "vereditos": [{ "rotulo": "Falso", "frases": 3 }, { "rotulo": "Verdadeiro", "frases": 5 }]
   }
   ```

   - `id`: a data da fala, a agência e duas ou três palavras do evento, em minúsculas e com hífens. Não pode repetir.
   - `data` é o dia da fala; `publicadaEm`, o dia em que a agência publicou a checagem.
   - `tipo`: `entrevista`, `podcast`, `discurso`, `debate`, `coletiva` ou `pronunciamento`.
   - `vereditos` é opcional. Copie os rótulos com as palavras da agência e conte as frases de cada um. Se a matéria não
     deixar claro, apague o campo.
   - Se a agência corrigir a matéria depois, acrescente `"errata": { "data": "AAAA-MM-DD", "texto": "..." }`.
3. Faça o commit com uma mensagem como `checagens: entrevista de 12/03/2026 (Aos Fatos)`.

O CI confere o arquivo. A próxima coleta valida de novo e publica em poucos minutos. Se algo estiver errado (agência
fora da lista, link que não é da agência, id repetido, data no futuro...), **a lista nova não é publicada**: o site
continua com a anterior, mostra o aviso "Lista de falas checadas" e o motivo fica em `data/status.json`. Se o erro
não for corrigido em 6 horas, o workflow passa a falhar e chegam os e-mails.

**Agências:** só entram signatárias verificadas da IFCN, conferidas na lista pública
`https://github.com/IFCN/verified-signatories`. Para acrescentar uma, inclua em `config/agencias.json` o `id`, o
`nome` e os `prefixos` (o começo dos endereços das matérias de checagem, terminando em `/`), atualize a seção "Falas
checadas" de `site/sobre.html` e o teste de `tests/pipeline/falas.test.ts`. A Lupa ficou de fora porque não estava na
lista da IFCN consultada em 27/10/2026; confira de novo antes de incluir.

## Troca de mandato (1º de janeiro de 2027)

`config/mandatos.json` diz qual presidente o site acompanha em cada período e onde fica a agenda dele. O mandato atual
termina em `2026-12-31`. **A partir de 01/01/2027 a coleta falha de propósito**, com a mensagem
`Nenhum mandato configurado cobre 2027-01-01. Atualize config/mandatos.json...`, em vez de continuar lendo a agenda
errada em silêncio.

Para trocar, acrescente um item à lista (mantendo o anterior, que continua valendo para o histórico):

```json
{
  "presidente": "Nome completo",
  "nomes": ["Nome usado na imprensa"],
  "inicio": "2027-01-01",
  "fim": "2030-12-31",
  "agendaBase": "https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/agenda-do-presidente-da-republica-.../agenda-do-presidente-da-republica"
}
```

- `agendaBase` é o endereço da agenda **sem** a data no fim; abra a agenda de um dia no site do Planalto e copie o
  endereço até antes de `/AAAA-MM-DD`. Confira mesmo que o presidente seja o mesmo: o endereço pode mudar.
- `nomes` é usado para buscar notícias e reconhecer comunicados que citam o presidente.
- Depois do commit, rode o workflow à mão (**Actions → Run workflow**) e confira se a agenda do dia apareceu.
- Revise também `site/sobre.html` se o texto citar algo específico do mandato anterior.

## Aviso da eleição na capa

A capa mostra, como primeiro aviso, a data do 2º turno e um link para o TSE (`site/src/eleicao.ts`). Ele aparece sozinho e
some em 01/01/2027. O texto vale para qualquer resultado e **não diz quem ganhou**. Para nomear o eleito, depois que o TSE
declarar o resultado, preencha `RESULTADO` nesse arquivo com o nome e o endereço oficial que o comprova:

```ts
export const RESULTADO: ResultadoEleicao | null = { eleito: 'Nome', fonteUrl: 'https://...' };
```

Sem endereço `https` válido, o nome não aparece. Depois, rode `npm test`, faça o commit e confira o site.

## Prévia de link (imagem e texto ao compartilhar)

As quatro páginas trazem marcações Open Graph com o endereço completo do site (`https://rastreadordopresidente.com.br/`),
porque quem monta a prévia lê a página de fora e não resolve caminho relativo. Se o domínio mudar, troque o endereço
nas quatro páginas de `site/` e em `tests/site/paginas.test.ts`.

A imagem é `site/public/capa-social.png` (1200 × 630). Para refazê-la depois de mudar fontes ou cores:
`python3 scripts/gerar-capa-social.py` (precisa do Pillow).

## Atualizar as GitHub Actions

Os workflows usam cada action fixada pelo SHA do commit, com a versão em comentário
(`actions/checkout@3d3c42e... # v7.0.1`): uma tag pode ser movida para outro código, um SHA não. Para atualizar, pegue
o SHA da versão nova (`git ls-remote --tags https://github.com/actions/checkout`), troque o SHA e o comentário juntos e
rode `npm test` (o teste `tests/workflows.test.ts` recusa action sem SHA, `${{ }}` dentro de comando de shell e
checkout que guarda o token fora do job que grava os dados).
