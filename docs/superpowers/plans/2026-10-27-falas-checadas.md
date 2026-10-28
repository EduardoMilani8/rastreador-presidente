# Falas checadas: plano de implementação

Spec: `docs/superpowers/specs/2026-10-27-falas-checadas-design.md`. Branch: `feat/falas-checadas`. Cada passo é um
commit, com teste escrito antes do código.

1. **Spec e plano** (`docs:`).
2. **Esquema e validação** (`feat(falas):`): `ChecagemSchema`, `AgenciaSchema` e `FalaChecadaSchema` em
   `src/shared/schema.ts`; `config/agencias.json`, `config/checagens.json` (vazio); `src/pipeline/falas.ts` com
   `carregarAgencias`, `carregarChecagens` e `montarFalas`; testes de cada regra e da tabela real.
3. **Pipeline** (`feat(pipeline):`): `gravarFalas` em `store.ts`; `atualizar` grava `data/falas.json` e marca a fonte
   `checagens`; teste de falha com aviso e de execução repetida sem reescrita.
4. **Dados** (`dados:`): `data/falas.json` gerado pelo script de derivados, nunca à mão.
5. **Página** (`feat(site):`): `falas.html`, `site/src/falas.ts`, `main-falas.ts`, carregamento em `dados.ts`, menu nas
   cinco páginas, estilo, entrada no Vite; testes de render, filtro, página e build.
6. **Sobre e manutenção** (`docs(sobre):`, `docs:`): seção "Falas checadas" com teste; roteiro em `MANUTENCAO.md`.
7. **Segurança e testes** (`fix(seguranca):`, `test:`, `ci:`): revisão do site e dos workflows; reforço onde houver
   brecha.

Antes de cada commit: `npm run typecheck && npm test && npm run build`.
