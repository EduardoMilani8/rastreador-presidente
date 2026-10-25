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
  Passado o limite, enquanto a fonte continuar fora do ar, **chega um e-mail a cada 10 minutos**; eles param sozinhos
  quando ela volta. Os dados já
  publicados continuam no ar e o site mostra um aviso com o nome da fonte.
  - `páginas de agenda pediram login`: dois ou mais dias da agenda passaram a exigir login. Em geral é o site do
    Planalto bloqueando o acesso. Se forem mesmo dois dias não públicos, os avisos só param quando um deles sair da
    janela de coleta — e, como a janela recua enquanto a fonte está em falha, isso pode levar **até 14 dias**.
  - `coleta interrompida depois de 2 falhas de rede seguidas`: a fonte não respondeu; a execução desiste dela para
    não estourar o tempo do job e tenta de novo na próxima.
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

## Prévia de link (imagem e texto ao compartilhar)

As quatro páginas trazem marcações Open Graph com o endereço completo do site (`https://rastreadordopresidente.com.br/`),
porque quem monta a prévia lê a página de fora e não resolve caminho relativo. Se o domínio mudar, troque o endereço
nas quatro páginas de `site/` e em `tests/site/paginas.test.ts`.

A imagem é `site/public/capa-social.png` (1200 × 630). Para refazê-la depois de mudar fontes ou cores:
`python3 scripts/gerar-capa-social.py` (precisa do Pillow).
