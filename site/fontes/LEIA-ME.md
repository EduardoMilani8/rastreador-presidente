# Fontes hospedadas

Arquivos .woff2 servidos pelo próprio site (sem requisição a terceiros). Todos vêm dos pacotes npm
`@fontsource/*`, versão 5.3.0, subconjunto latino, licença SIL Open Font License 1.1 (OFL-1.1).

| Arquivo | Pacote | Versão | Subconjunto | Peso e estilo | Licença |
| --- | --- | --- | --- | --- | --- |
| `newsreader-400.woff2` | `@fontsource/newsreader` | 5.3.0 | latino | 400 normal | OFL-1.1 (`OFL-newsreader.txt`) |
| `newsreader-500.woff2` | `@fontsource/newsreader` | 5.3.0 | latino | 500 normal | OFL-1.1 (`OFL-newsreader.txt`) |
| `newsreader-400-italico.woff2` | `@fontsource/newsreader` | 5.3.0 | latino | 400 itálico | OFL-1.1 (`OFL-newsreader.txt`) |
| `public-sans-600.woff2` | `@fontsource/public-sans` | 5.3.0 | latino | 600 normal | OFL-1.1 (`OFL-public-sans.txt`) |

A Public Sans é hospedada só no peso 600, por causa do limite de 90 kB. Com uma única face, o navegador a usaria para todos os pesos; por isso a folha de estilo aplica 'Public Sans' apenas ao texto em peso 600 (rótulos, navegação), e o texto sem serifa de peso normal usa a fonte do sistema.
