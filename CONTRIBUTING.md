# Como contribuir

Obrigado por querer ajudar. Este projeto existe para que qualquer pessoa consiga conferir, com a fonte na mão, o que o
Presidente fez. Quanto mais gente olhando, mais confiável ele fica.

## Sem programar

A ajuda mais valiosa é **conferir os dados**. Se você encontrar algo errado, faltando ou confuso:

| O que você viu | Onde avisar |
|---|---|
| Um compromisso ou ato errado, duplicado ou faltando | [Erro nos dados](https://github.com/EduardoMilani8/rastreador-presidente/issues/new?template=1-erro-nos-dados.yml) |
| O site quebrou, ficou lento ou difícil de usar | [Problema no site](https://github.com/EduardoMilani8/rastreador-presidente/issues/new?template=2-problema-no-site.yml) |
| Uma ideia de melhoria ou de nova fonte pública | [Sugestão](https://github.com/EduardoMilani8/rastreador-presidente/issues/new?template=3-sugestao.yml) |

Para um erro nos dados, o que mais ajuda é o **link do item no site** (o "Link permanente" de cada cartão) e o **link
da fonte oficial** que mostra o correto.

## Com código

### Preparar o ambiente

Precisa de [Node.js](https://nodejs.org) 22 ou mais novo.

```bash
git clone https://github.com/EduardoMilani8/rastreador-presidente.git
cd rastreador-presidente
npm ci
npm test          # todos os testes
npm run dev       # site em http://localhost:5173, lendo a pasta data/
```

Outros comandos úteis:

```bash
npm run typecheck   # confere os tipos
npm run build       # gera o site em dist/
```

`npm run update` e `npm run backfill` fazem requisições reais às fontes públicas e alteram a pasta `data/`. Você
quase nunca vai precisar deles para contribuir: os testes usam trechos salvos das fontes.

### Como o código está organizado

```
src/collectors/   lê cada fonte (agenda, dou, planalto, noticias)
src/pipeline/     mescla, calcula status, valida e grava em data/
src/shared/       esquemas, requisições e datas
site/             o site (HTML, CSS e TypeScript, sem framework)
tests/            testes, na mesma estrutura de src/ e site/
data/             os dados publicados, gravados pelo robô
```

O [CLAUDE.md](CLAUDE.md) descreve a arquitetura e as regras com mais detalhe. Vale a leitura mesmo para quem não usa
assistente de código.

### Antes de abrir um pull request

1. **Converse primeiro em mudanças grandes.** Abra uma sugestão antes de investir tempo numa funcionalidade nova, para
   alinharmos se ela cabe no projeto.
2. **Escreva o teste antes.** Para um erro de dados, reproduza o caso com um trecho real da fonte num teste que falha,
   e então corrija.
3. **Rode tudo:** `npm run typecheck && npm test && npm run build`.
4. **Não edite a pasta `data/` à mão.** Corrija a regra no código; os dados são regravados pelo robô ou num commit
   separado, feito por quem mantém o projeto.
5. **Um assunto por pull request**, com uma descrição que diga o que mudou e por quê.

### As regras da casa

Elas existem porque o site só vale alguma coisa se for confiável:

- **Na dúvida, omitir é melhor do que afirmar.** Nenhuma mudança pode fazer o site dizer que algo aconteceu sem um
  registro oficial que prove.
- **Falhar com aviso é melhor do que mostrar dado errado em silêncio.** Fonte fora do ar ou com formato diferente é
  erro, não lista vazia.
- **Todo item tem fonte pública com link `https`.**
- **O site não interpreta o que vem das fontes como HTML** (só `textContent`), não tem script inline e não recebe
  entrada de usuário.
- **Acessibilidade não é opcional:** navegação por teclado, contraste e leitor de tela.
- **Respeito às fontes:** uma requisição por segundo, sem paralelismo.
- **Sem opinião.** O site mostra o registro oficial; não resume, não comenta e não classifica como bom ou ruim.

### Estilo

- TypeScript `strict`; textos, mensagens de erro e nomes de teste em português do Brasil.
- Commits no formato `tipo(escopo): resumo`, por exemplo `fix(dou): ...`, `feat(site): ...`, `docs: ...`.
- Comentário só quando explica o porquê.

## Convivência

Este é um projeto sobre um assunto político, mas não é um espaço de disputa política. Discussões aqui são sobre dados,
fontes e código. Seja respeitoso; mensagens com ataque pessoal ou propaganda serão fechadas.
