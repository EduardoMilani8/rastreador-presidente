# Fontes hospedadas

Arquivos .woff2 servidos pelo próprio site (sem requisição a terceiros). Todos vêm dos pacotes npm
`@fontsource/*`, versão 5.3.0, subconjunto latino, licença SIL Open Font License 1.1 (OFL-1.1).

| Arquivo | Pacote | Versão | Subconjunto | Peso e estilo | Licença |
| --- | --- | --- | --- | --- | --- |
| `newsreader-400.woff2` | `@fontsource/newsreader` | 5.3.0 | latino | 400 normal | OFL-1.1 (`OFL-newsreader.txt`) |
| `newsreader-500.woff2` | `@fontsource/newsreader` | 5.3.0 | latino | 500 normal | OFL-1.1 (`OFL-newsreader.txt`) |
| `newsreader-400-italico.woff2` | `@fontsource/newsreader` | 5.3.0 | latino | 400 itálico | OFL-1.1 (`OFL-newsreader.txt`) |
| `public-sans-600.woff2` | `@fontsource/public-sans` | 5.3.0 | latino | 600 normal | OFL-1.1 (`OFL-public-sans.txt`) |

A Public Sans é hospedada só no peso 600, porque os cinco arquivos juntos passavam do limite de 90 kB. Com uma única face, o navegador usa essa face para qualquer peso pedido à família; por isso a folha de estilo só deve nomear 'Public Sans' em regras pensadas para o peso semibold, e o texto sem serifa de peso normal deve usar a pilha de fontes do sistema.
