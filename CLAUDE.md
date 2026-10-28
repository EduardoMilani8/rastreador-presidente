# CLAUDE.md

Orientações para o Claude Code (e outros assistentes) trabalharem neste repositório.

## O projeto

Rastreador do Presidente: site estático, público e somente de leitura que mostra a agenda oficial e os atos do
Presidente da República, sempre com link para a fonte pública. Um workflow do GitHub Actions coleta as fontes a cada
10 minutos, grava JSON em `data/` e republica o site no GitHub Pages. Não há backend, login nem entrada de usuário.

A credibilidade é o produto. Duas regras decidem qualquer dúvida:

1. **Na dúvida, omitir é melhor do que afirmar.**
2. **Falhar com aviso é melhor do que gravar ou mostrar dado errado em silêncio.**

## Comandos

```bash
npm ci                 # instalar dependências (Node >= 22)
npm test               # todos os testes (vitest)
npx vitest run tests/collectors/dou.test.ts   # um arquivo de teste
npm run typecheck      # tsc --noEmit
npm run dev            # site em desenvolvimento, lendo ./data
npm run build          # gera ./dist (site + cópia de ./data)
npm run update         # uma coleta real (faz requisições às fontes e altera ./data)
npm run backfill -- AAAA-MM-DD AAAA-MM-DD     # recoleta um intervalo (1 requisição por segundo)
```

Antes de dar um trabalho por pronto: `npm run typecheck && npm test && npm run build`, com a saída limpa.

## Arquitetura

```
fontes públicas → src/collectors → src/pipeline → data/*.json → site/ (Vite) → GitHub Pages
```

- `src/collectors/`: um arquivo por fonte (`agenda`, `dou`, `planalto`, `noticias`, `factcheck`). Cada um só lê e interpreta a
  resposta da fonte; não grava nada.
- `src/pipeline/`: `run.ts` orquestra a coleta; `merge.ts` mescla com o que já existe e calcula o status; `link.ts`
  liga comunicados à agenda (desligado por padrão); `store.ts` valida e grava; `cli.ts` é a entrada de `update` e
  `backfill`.
- `src/shared/`: `schema.ts` (esquemas zod, usados pelo pipeline **e** pelo site), `http.ts` (requisições com pausa,
  tentativas e tempo limite), `text.ts` (datas e normalização).
- `config/mandatos.json`: qual presidente o site acompanha em cada período e o endereço da agenda dele.
- `config/agencias.json` e `config/checagens.json`: agências de checagem aceitas e checagens de falas conferidas à mão.
  `src/pipeline/falas.ts` valida as duas e o pipeline grava `data/falas.json`. As frases checadas automáticas vêm da
  Fact Check API (`src/collectors/factcheck.ts` + `src/pipeline/frases.ts` → `data/frases-checadas.json`);
  `config/frases-excluidas.json` tira à mão uma frase que a agência marcou errado.
- `data/`: `eventos/AAAA-MM.json` (um por mês), `meses.json`, `noticias.json`, `falas.json`, `frases-checadas.json`,
  `status.json`. É gravado
  pelo robô.
- `site/`: HTML, CSS e TypeScript sem framework, em cinco páginas (`index.html` é o painel, `registros.html`,
  `noticias.html`, `falas.html`, `sobre.html`). `dados.ts` carrega, `filtrar.ts` filtra, `render.ts` cria os elementos,
  `comum.ts` cuida dos avisos, `painel.ts`, `registros.ts`, `noticias.ts` e `falas.ts` montam cada página, `redirecionar.ts` leva os
  endereços antigos à página certa, `params.ts` lê os filtros da URL e há uma entrada `main-*.ts` por página. As
  fontes tipográficas ficam em `site/fontes/`.
- `.github/workflows/`: `ci.yml` (testes) e `update.yml` (coleta agendada e publicação).

## Regras que não podem ser quebradas

**Dados**
- Um compromisso da agenda nunca vira "Realizado" só porque a data passou. Hoje nenhuma fonte confirma eventos depois
  do fato, então esse status não é atribuído automaticamente. Não afrouxe a regra de ligação em `link.ts`.
- Agenda com HTTP 404 é "dia sem agenda publicada": nunca remove o que já estava gravado. Só um dia que respondeu 200
  com compromissos pode marcar remoção.
- Mudança de layout, redirecionamento inesperado ou resposta estranha de uma fonte é **erro da fonte**, nunca uma
  lista vazia.
- Falas checadas são avaliação de agências, nunca registro oficial: ficam fora da linha do tempo e dos totais. Só entram
  checagens de falas do próprio presidente (boato atribuído a ele não entra), de agência listada em
  `config/agencias.json`, com o veredito nas palavras da agência. O site não dá nota nem checa por conta própria.
  Na parte automática, o autor marcado pela agência precisa ser **igual** a um nome do presidente (nunca "contém").
- A chave da Fact Check API (`FACTCHECK_API_KEY`) vai só em cabeçalho, nunca no endereço: mensagens de erro de busca
  vão para o `status.json`, que é público.
- Republicações do Diário Oficial e atos assinados fora do mandato não entram como atos novos (veja `dou.ts` e
  `run.ts`). Cada ato aparece uma vez.
- Todo evento precisa de pelo menos uma fonte com URL `https`. O esquema recusa o resto.
- Duas execuções seguidas sem mudança nas fontes não podem reescrever nenhum arquivo (senão haveria um commit a cada
  10 minutos). Há testes para isso; mantenha-os passando.

**Site**
- Texto vindo das fontes entra no DOM só com `textContent`/`append(string)`. Nunca `innerHTML`, `outerHTML` ou
  `insertAdjacentHTML`.
- Links só `https`, validados por `urlHttpsSegura`.
- Nada de script, estilo ou manipulador de evento inline: a CSP do build proíbe (`vite.config.ts`).
- Caminhos sempre relativos: o site roda dentro de um subdiretório no GitHub Pages.
- Acessibilidade conta: os testes de `tests/site` rodam o axe; mantenha ordem de títulos, foco visível e contraste.
- A página "Sobre e metodologia" (`site/sobre.html`) precisa dizer a verdade sobre o que o código faz. Se mudar uma
  regra de dados, atualize o texto e o teste `tests/site/sobre.test.ts`.

**Fontes**
- Respeite os servidores públicos: uma requisição por segundo, sem paralelismo, sem recoletar o histórico inteiro sem
  necessidade.
- Não defina `CONTATO_URL` em execuções locais e não coloque e-mail pessoal em nenhum arquivo. O workflow define esse
  valor com a URL do repositório.

## Como trabalhar aqui

- **Teste primeiro.** Para corrigir um coletor, reproduza o problema com um trecho real da fonte (em `tests/helpers.ts`
  ou `tests/fixtures/`) num teste que falha, e só então corrija.
- **Não edite `data/` à mão** para "arrumar" um item: corrija a regra no código, com teste, e aplique a mesma regra
  aos dados já gravados. O commit de dados vai separado do commit de código, com prefixo `dados:`.
- TypeScript `strict`, imports sem extensão, sem dependências novas sem motivo forte.
- Textos de interface, mensagens de erro, nomes de teste e mensagens de commit em português do Brasil. Commits no
  estilo `tipo(escopo): resumo` (`fix(dou): ...`, `feat(site): ...`, `docs: ...`, `dados: ...`).
- Comentários só quando explicam o porquê.
- O robô faz commits em `main` a cada poucos minutos: rode `git pull --rebase` antes de `git push`.

## Onde olhar

- `README.md`: apresentação para quem chega.
- `CONTRIBUTING.md`: como contribuir.
- `docs/MANUTENCAO.md`: publicação, e-mails de falha e troca de mandato.
- `docs/superpowers/specs/`: desenho original do projeto. Algumas decisões mudaram depois; o código e a página Sobre
  são a referência atual.
