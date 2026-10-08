#!/usr/bin/env bash
set -euo pipefail
B="https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/agenda-do-presidente-da-republica-lula/agenda-do-presidente-da-republica"
UA="Mozilla/5.0 (X11; Linux x86_64) Chrome/120"
mkdir -p tests/fixtures/agenda
for d in 2025-03-10 2023-01-02; do
  curl -sL -H "Accept: text/html" -A "$UA" "$B/$d" -o "tests/fixtures/agenda/$d.html"
  sleep 1
done
# domingo sem agenda: o servidor responde 404 com a página padrão
curl -sL -H "Accept: text/html" -A "$UA" "$B/2026-10-04" -o tests/fixtures/agenda/2026-10-04.404.html
