# Rastreador do Presidente

Site público, estático e somente de leitura que registra o que o Presidente da República fez e o que consta na sua
agenda oficial, sempre com link para a fonte pública de cada item. Projeto independente, sem vínculo com o governo.

O que o site afirma, e os limites do que ele sabe, estão em [`site/sobre.html`](site/sobre.html) (página "Sobre e
metodologia"). A regra do projeto: na dúvida, omitir é melhor do que afirmar; falhar com aviso é melhor do que mostrar
dado errado em silêncio.

## Como funciona

1. A cada 10 minutos, o GitHub Actions (`.github/workflows/update.yml`) roda os coletores:
   - **Agenda do Presidente** (gov.br/planalto): de 3 dias atrás a 7 dias à frente;
   - **Diário Oficial da União** (in.gov.br, Seção 1 e edições extras): decretos numerados, leis e medidas
     provisórias de ontem e de hoje;
   - **Comunicados do Planalto** (RSS) e **notícias** (Google Notícias e Agência Brasil).
2. O resultado é mesclado com o que já existe em `data/` (um JSON por mês em `data/eventos/`, mais `meses.json`,
   `noticias.json` e `status.json`). Se nada mudou, nenhum arquivo é reescrito e não há commit.
3. Quando os dados mudam, o workflow faz o commit de `data/`, gera o site com Vite e publica no GitHub Pages.

Regras que o código garante (e os testes cobrem):

- compromisso só vira "Realizado" com registro oficial posterior ao fato — hoje nenhuma fonte serve para isso, então
  o status não é atribuído automaticamente;
- dia de agenda que responde 404 é "dia sem agenda publicada": nunca remove o que já estava gravado;
- republicações do Diário Oficial (mais de 10 dias depois da assinatura, título com `ANEXO`, retificação `(*)` de ato já listado) e atos assinados
  fora do mandato não entram como atos novos;
- o link "Texto do ato" (Planalto) só é gravado se a página trouxer a data do ato;
- se a coleta fica parada alguns dias, a execução seguinte recua até 14 dias para recolher o que perdeu;
- o site só usa `textContent`, só cria links `https` e não tem script nem estilo inline (CSP restrita).

## Comandos locais

Requer Node 22 ou mais novo.

```bash
npm ci                 # instala as dependências
npm test               # testes (vitest; os do site usam jsdom + axe)
npm run typecheck      # tipos
npm run dev            # site em modo desenvolvimento, lendo ./data
npm run build          # gera ./dist (site + cópia de ./data)
npm run update         # uma coleta, como a do agendador (faz requisições reais às fontes)
npm run backfill -- 2026-10-01 2026-10-05   # recoleta um intervalo de dias (1 requisição por segundo)
```

`npm run update` e `npm run backfill` alteram os arquivos de `data/`. Confira o `git diff` antes de fazer commit.

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

- **Uma fonte falhou em duas execuções seguidas.** A mensagem do passo "Coletar fontes" diz qual
  (`Fontes com falha em execuções seguidas: agenda, dou...`), e `data/status.json` guarda o motivo. Enquanto a fonte
  continuar fora do ar, **chega um e-mail a cada 10 minutos**; eles param sozinhos quando ela volta. Os dados já
  publicados continuam no ar e o site mostra um aviso com o nome da fonte.
  - `páginas de agenda pediram login`: dois ou mais dias da agenda passaram a exigir login. Em geral é o site do
    Planalto bloqueando o acesso. Se forem mesmo dois dias não públicos, os avisos só param quando um deles sair da
    janela de coleta — e, como a janela recua enquanto a fonte está em falha, isso pode levar **até 14 dias**.
  - `coleta interrompida depois de 2 falhas de rede seguidas`: a fonte não respondeu; a execução desiste dela para
    não estourar o tempo do job e tenta de novo na próxima.
  - `HTTP 404` no DOU ou `Redirecionamento inesperado`: o endereço da fonte mudou; é preciso ajustar o coletor.
- **Não há mandato configurado para a data de hoje** (ver abaixo). A coleta para por completo até a configuração ser
  atualizada; depois de 24 horas sem mudança nos dados, o site passa a mostrar "Última alteração nos dados: ...".

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
