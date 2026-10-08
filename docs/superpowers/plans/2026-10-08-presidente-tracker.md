# Rastreador do Presidente — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Site estático, somente leitura, com linha do tempo do que o Presidente da República fez e do que consta na sua agenda, cada item com link para a fonte pública, atualizado automaticamente a cada ~10 minutos.

**Architecture:** Coletores TypeScript (um por fonte) rodam no GitHub Actions, normalizam tudo num formato `Evento`, ligam comunicados do Planalto a compromissos da agenda, mesclam com o histórico e gravam JSON mensais em `data/`. Um site Vite (TypeScript, sem framework) lê esses JSON e filtra no navegador; filtros vivem na URL (formulário GET, sem JS de roteamento).

**Tech Stack:** Node ≥ 22, TypeScript strict, Vitest, Vite, cheerio (HTML), fast-xml-parser (RSS/RDF), zod (esquema), jsdom + axe-core (testes de DOM/acessibilidade), GitHub Actions + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-08-presidente-tracker-design.md` (ler antes; este plano a implementa e corrige onde o spec foi atualizado após verificação em 2026-10-08).

## Global Constraints

- Node `>=22`; TypeScript `strict`; imports sem extensão (`moduleResolution: Bundler`).
- Fuso de referência para "hoje" e datas de evento: `America/Sao_Paulo`. Datas como `AAAA-MM-DD`; instantes como ISO-8601 com `Z`.
- Toda fonte exibida é `https://`; item sem ao menos uma fonte com URL https **não** é gravado (esquema recusa).
- Todo texto vindo de fontes é inserido no DOM só com `textContent`/`createTextNode`/`append(string)`; **nunca** `innerHTML`, `outerHTML`, `insertAdjacentHTML` nem `style=` inline.
- Requisições às fontes: `User-Agent` identificado, pausa de **1000 ms** entre requisições em produção, 3 tentativas com espera exponencial só para erro de rede/HTTP ≥ 500 (nunca repetir 4xx).
- `Accept: text/html` para agenda/DOU/Planalto; com `*/*` a agenda devolve JSON de erro.
- Janelas do `update`: agenda de `hoje-3` a `hoje+7`; DOU de `hoje-1` a `hoje`; notícias retidas por **14 dias**.
- Agenda: HTTP 404 com página padrão = "dia sem agenda" (não é erro e **nunca** marca remoção); só HTTP 200 com o compromisso ausente marca `removidoEm`.
- Cron do Actions: `*/10 * * * *`. Workflow só falha quando uma fonte falha em duas execuções seguidas.
- Sem backend, sem login, sem entrada de usuário; CSP restritiva no build (`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'`).
- Comentários só quando explicam o porquê; mensagens e textos de interface em português do Brasil.

## Review Focus

Entradas/condições que o spec implica mas que nenhuma tarefa de "caminho feliz" exercitaria; cada linha tem teste na tarefa indicada.

1. **Dia sem agenda (HTTP 404) vs. layout quebrado (HTTP 200 sem contêiner):** 404 = dia vazio sem apagar nada; 200 sem `.list-compromissos` = erro — Task 3 (parser) e Task 9 (404 não remove; 200 sem o item remove).
2. **Duas execuções seguidas sem mudança na fonte:** nenhum arquivo muda, evitando commit a cada 10 min — Task 7 (`mesclar` idempotente) e Task 9 (`arquivosEscritos === 0`).
3. **Fonte fora do ar durante a atualização:** dados anteriores intactos, estado `ok:false`, e só vira falha do workflow na segunda seguida — Task 9.
4. **Texto malicioso vindo da fonte** (`<script>`, `javascript:`, `http:`): aparece como texto, sem link inseguro — Task 3 (esquema recusa URL não-https), Task 11 (renderização).
5. **Dois compromissos no mesmo dia e local + um comunicado, ou "Presidente do Senado" no título:** não liga e não entra como "do presidente" — Task 5 e Task 8.

---

### Task 1: Scaffold do projeto, utilitários de texto e esquema de dados

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/shared/text.ts`, `src/shared/schema.ts`
- Test: `tests/shared/text.test.ts`, `tests/shared/schema.test.ts`

**Interfaces:**
- Produces (`src/shared/text.ts`):
  `normalizar(s: string): string` · `limparEspacos(s: string): string` · `urlHttpsSegura(u: string): string | null` · `dataSaoPaulo(d: Date): string` · `parseDataExtenso(texto: string): string | null` · `somarDias(data: string, dias: number): string`
- Produces (`src/shared/schema.ts`): zod schemas `FonteSchema`, `EventoSchema`, `NoticiaSchema`, `MandatoSchema`, `EstadoFontesSchema` e os tipos `Fonte`, `Evento`, `Noticia`, `Mandato`, `EstadoFontes`, `TipoEvento`, `Status`.

- [ ] **Step 1: Criar a pasta do projeto (fora da pasta temporária da sessão) e iniciar o git**

```bash
mkdir -p ~/rastreador-presidente && cd ~/rastreador-presidente
git init -b main
# copie para cá a pasta docs/ (spec e este plano) que está na pasta da sessão
mkdir -p src/shared tests/shared
```

- [ ] **Step 2: Criar os arquivos de configuração**

`package.json`:

```json
{
  "name": "rastreador-presidente",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "update": "tsx src/pipeline/cli.ts update",
    "backfill": "tsx src/pipeline/cli.ts backfill",
    "dev": "vite",
    "build": "vite build && node scripts/copy-data.mjs"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  },
  "include": ["src", "site", "tests", "scripts", "vite.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
```

`.gitignore`:

```
node_modules
dist
.env
```

```bash
npm install cheerio fast-xml-parser zod
npm install -D typescript tsx vitest vite jsdom axe-core @types/node
```

- [ ] **Step 3: Escrever os testes que falham**

`tests/shared/text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  dataSaoPaulo, limparEspacos, normalizar, parseDataExtenso, somarDias, urlHttpsSegura,
} from '../../src/shared/text';

describe('text', () => {
  it('normalizar remove acentos, caixa e espaços repetidos', () => {
    expect(normalizar('  Palácio   do Planalto ')).toBe('palacio do planalto');
  });
  it('limparEspacos só colapsa espaços', () => {
    expect(limparEspacos('  Olá \n  mundo ')).toBe('Olá mundo');
  });
  it('urlHttpsSegura aceita só https', () => {
    expect(urlHttpsSegura('https://x.com/a')).toBe('https://x.com/a');
    expect(urlHttpsSegura('http://x.com')).toBeNull();
    expect(urlHttpsSegura('javascript:alert(1)')).toBeNull();
    expect(urlHttpsSegura('não é url')).toBeNull();
  });
  it('dataSaoPaulo usa o fuso de São Paulo', () => {
    expect(dataSaoPaulo(new Date('2026-10-08T01:30:00Z'))).toBe('2026-10-07');
    expect(dataSaoPaulo(new Date('2026-10-08T15:00:00Z'))).toBe('2026-10-08');
  });
  it('parseDataExtenso lê datas em português', () => {
    expect(parseDataExtenso('DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026')).toBe('2026-10-06');
    expect(parseDataExtenso('LEI Nº 1, DE 12 DE MARÇO DE 2025')).toBe('2025-03-12');
    expect(parseDataExtenso('sem data')).toBeNull();
  });
  it('somarDias cruza meses e anos', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
  });
});
```

`tests/shared/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EventoSchema } from '../../src/shared/schema';

const base = {
  id: 'agenda:2026-10-08:10:00:1',
  tipo: 'agenda',
  data: '2026-10-08',
  hora: '10:00',
  titulo: 'Reunião',
  status: 'agendado',
  fontes: [{ nome: 'agenda-planalto', rotulo: 'Planalto (governo)', url: 'https://www.gov.br/x', coletadoEm: '2026-10-08T12:00:00.000Z' }],
  confirmadoPor: [],
  historico: [],
};

describe('EventoSchema', () => {
  it('aceita um evento válido', () => {
    expect(EventoSchema.safeParse(base).success).toBe(true);
  });
  it('recusa fonte com URL não-https', () => {
    const ruim = { ...base, fontes: [{ ...base.fontes[0], url: 'http://x.com' }] };
    expect(EventoSchema.safeParse(ruim).success).toBe(false);
    const js = { ...base, fontes: [{ ...base.fontes[0], url: 'javascript:alert(1)' }] };
    expect(EventoSchema.safeParse(js).success).toBe(false);
  });
  it('recusa evento sem nenhuma fonte', () => {
    expect(EventoSchema.safeParse({ ...base, fontes: [] }).success).toBe(false);
  });
  it('recusa hora e data mal formadas', () => {
    expect(EventoSchema.safeParse({ ...base, hora: '9h' }).success).toBe(false);
    expect(EventoSchema.safeParse({ ...base, data: '08/10/2026' }).success).toBe(false);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run`
Expected: FAIL — `Cannot find module '../../src/shared/text'`.

- [ ] **Step 5: Implementar**

`src/shared/text.ts`:

```ts
const MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function limparEspacos(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function urlHttpsSegura(u: string): string | null {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function dataSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export function parseDataExtenso(texto: string): string | null {
  const m = normalizar(texto).match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (!m) return null;
  const mes = MESES.indexOf(m[2]);
  if (mes < 0) return null;
  return `${m[3]}-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
```

`src/shared/schema.ts`:

```ts
import { z } from 'zod';

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instante = z.string().datetime({ offset: true });
const urlHttps = z.string().url().refine((u) => u.startsWith('https://'), 'a URL deve ser https');

export const FonteSchema = z.object({
  nome: z.string().min(1),
  rotulo: z.string().min(1),
  url: urlHttps,
  coletadoEm: instante,
});

export const VersaoSchema = z.object({
  titulo: z.string(),
  hora: z.string().optional(),
  local: z.string().optional(),
  registradoEm: instante,
});

export const TipoEventoSchema = z.enum(['agenda', 'ato', 'comunicado']);
export const StatusSchema = z.enum([
  'agendado', 'consta_na_agenda', 'realizado', 'publicado', 'alterado', 'removido',
]);

export const EventoSchema = z.object({
  id: z.string().min(1),
  tipo: TipoEventoSchema,
  data: dataIso,
  hora: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  titulo: z.string().min(1),
  local: z.string().optional(),
  status: StatusSchema,
  ementa: z.string().optional(),
  datasAto: z.object({ assinatura: dataIso.optional(), publicacao: dataIso }).optional(),
  fontes: FonteSchema.array().min(1),
  confirmadoPor: z.string().array(),
  historico: VersaoSchema.array(),
  removidoEm: instante.optional(),
});

export const NoticiaSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  veiculo: z.string().min(1),
  data: instante,
  url: urlHttps,
  origem: z.enum(['google-news', 'agencia-brasil']),
});

export const MandatoSchema = z.object({
  presidente: z.string().min(1),
  nomes: z.string().array().min(1),
  inicio: dataIso,
  fim: dataIso.nullable(),
  agendaBase: urlHttps,
});

export const EstadoFontesSchema = z.object({
  fontes: z.record(z.object({ ok: z.boolean(), desde: instante, mensagem: z.string().optional() })),
  ultimaNovidadeEm: instante.optional(),
});

export type Fonte = z.infer<typeof FonteSchema>;
export type Evento = z.infer<typeof EventoSchema>;
export type Noticia = z.infer<typeof NoticiaSchema>;
export type Mandato = z.infer<typeof MandatoSchema>;
export type EstadoFontes = z.infer<typeof EstadoFontesSchema>;
export type TipoEvento = z.infer<typeof TipoEventoSchema>;
export type Status = z.infer<typeof StatusSchema>;
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run && npm run typecheck`
Expected: PASS (todos os testes de `text` e `schema`), typecheck sem erros.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold do projeto, utilitários de texto e esquema de dados"
```

---

### Task 2: Cliente HTTP e configuração de mandatos

**Files:**
- Create: `src/shared/http.ts`, `src/config.ts`, `config/mandatos.json`
- Test: `tests/shared/http.test.ts`, `tests/config.test.ts`

**Interfaces:**
- Consumes: `MandatoSchema`, `Mandato` (Task 1).
- Produces (`src/shared/http.ts`):
  `ACCEPT_HTML = 'text/html'` · `ACCEPT_XML = 'application/rss+xml, application/xml, text/xml'`
  `interface Resposta { status: number; corpo: string; url: string }`
  `interface OpcoesHttp { fetchImpl?: typeof fetch; tentativas?: number; esperaMs?: number; pausaMs?: number; contato?: string }`
  `buscarTexto(url: string, accept?: string, o?: OpcoesHttp): Promise<Resposta>`
- Produces (`src/config.ts`): `carregarMandatos(caminho?: string): Promise<Mandato[]>` · `mandatoVigente(mandatos: Mandato[], hoje: string): Mandato`

- [ ] **Step 1: Escrever os testes que falham**

`tests/shared/http.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ACCEPT_HTML, buscarTexto } from '../../src/shared/http';

const resp = (status: number, corpo: string) => new Response(corpo, { status });

describe('buscarTexto', () => {
  it('devolve status e corpo, inclusive em 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(resp(404, 'nada'));
    const r = await buscarTexto('https://x.test/a', ACCEPT_HTML, { fetchImpl, esperaMs: 0 });
    expect(r).toMatchObject({ status: 404, corpo: 'nada' });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 4xx não repete
  });
  it('repete em HTTP 500 e depois funciona', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(resp(500, 'erro'))
      .mockResolvedValueOnce(resp(200, 'ok'));
    const r = await buscarTexto('https://x.test/a', ACCEPT_HTML, { fetchImpl, esperaMs: 0 });
    expect(r.corpo).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('lança erro depois de esgotar as tentativas', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('rede'));
    await expect(buscarTexto('https://x.test/a', ACCEPT_HTML, { fetchImpl, esperaMs: 0, tentativas: 3 }))
      .rejects.toThrow(/Falha ao buscar/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('envia User-Agent identificado e o Accept pedido', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(resp(200, ''));
    await buscarTexto('https://x.test/a', 'text/html', { fetchImpl, contato: 'https://github.com/o/r' });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const h = init.headers as Record<string, string>;
    expect(h['User-Agent']).toContain('RastreadorPresidente');
    expect(h['User-Agent']).toContain('https://github.com/o/r');
    expect(h.Accept).toBe('text/html');
  });
});
```

`tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { carregarMandatos, mandatoVigente } from '../src/config';

const m = (presidente: string, inicio: string, fim: string | null) => ({
  presidente, nomes: [presidente], inicio, fim, agendaBase: 'https://www.gov.br/x',
});

describe('mandatoVigente', () => {
  const lista = [m('A', '2023-01-01', '2026-12-31'), m('B', '2027-01-01', null)];
  it('escolhe o mandato que contém a data', () => {
    expect(mandatoVigente(lista, '2026-12-31').presidente).toBe('A');
    expect(mandatoVigente(lista, '2027-01-01').presidente).toBe('B');
  });
  it('lança erro quando nenhum mandato cobre a data', () => {
    expect(() => mandatoVigente(lista, '2022-12-31')).toThrow(/mandato/i);
  });
});

describe('carregarMandatos', () => {
  it('lê e valida config/mandatos.json', async () => {
    const lista = await carregarMandatos();
    expect(lista.length).toBeGreaterThan(0);
    expect(lista[0].agendaBase).toMatch(/^https:\/\//);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/shared/http.test.ts tests/config.test.ts`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Implementar**

`src/shared/http.ts`:

```ts
export const ACCEPT_HTML = 'text/html';
export const ACCEPT_XML = 'application/rss+xml, application/xml, text/xml';

export interface Resposta { status: number; corpo: string; url: string }
export interface OpcoesHttp {
  fetchImpl?: typeof fetch;
  tentativas?: number;
  esperaMs?: number;
  pausaMs?: number;
  contato?: string;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function buscarTexto(url: string, accept: string = ACCEPT_HTML, o: OpcoesHttp = {}): Promise<Resposta> {
  const f = o.fetchImpl ?? fetch;
  const tentativas = o.tentativas ?? 3;
  const espera = o.esperaMs ?? 1000;
  const ua = `Mozilla/5.0 (X11; Linux x86_64) RastreadorPresidente/0.1 (+${o.contato ?? 'https://github.com/'})`;
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await f(url, { headers: { 'User-Agent': ua, Accept: accept }, redirect: 'follow' });
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
      const corpo = await r.text();
      if (o.pausaMs) await dormir(o.pausaMs);
      return { status: r.status, corpo, url: r.url || url };
    } catch (e) {
      ultimoErro = e;
      if (i < tentativas - 1) await dormir(espera * 2 ** i);
    }
  }
  throw new Error(`Falha ao buscar ${url}: ${String(ultimoErro)}`);
}
```

`config/mandatos.json`:

```json
[
  {
    "presidente": "Luiz Inácio Lula da Silva",
    "nomes": ["Lula"],
    "inicio": "2023-01-01",
    "fim": null,
    "agendaBase": "https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/agenda-do-presidente-da-republica-lula/agenda-do-presidente-da-republica"
  }
]
```

`src/config.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { MandatoSchema, type Mandato } from './shared/schema';

export async function carregarMandatos(caminho = 'config/mandatos.json'): Promise<Mandato[]> {
  return MandatoSchema.array().parse(JSON.parse(await readFile(caminho, 'utf8')));
}

export function mandatoVigente(mandatos: Mandato[], hoje: string): Mandato {
  const m = mandatos.find((x) => x.inicio <= hoje && (x.fim === null || hoje <= x.fim));
  if (!m) throw new Error(`Nenhum mandato configurado cobre ${hoje}`);
  return m;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cliente HTTP com retry e configuração de mandatos"
```

---

### Task 3: Coletor da Agenda do Presidente

**Files:**
- Create: `src/collectors/agenda.ts`, `scripts/fetch-fixtures.sh`
- Create (fixtures, commitadas): `tests/fixtures/agenda/2025-03-10.html`, `tests/fixtures/agenda/2023-01-02.html`, `tests/fixtures/agenda/2026-10-04.404.html`
- Test: `tests/collectors/agenda.test.ts`

**Interfaces:**
- Consumes: `Evento` (Task 1), `limparEspacos` (Task 1).
- Produces:
  `class LayoutError extends Error`
  `interface ResultadoAgenda { eventos: Evento[]; diaPublicado: boolean }`
  `urlAgendaDia(base: string, data: string): string`
  `parseAgenda(corpo: string, status: number, data: string, coletadoEm: string, urlPagina: string): ResultadoAgenda`
  Contrato: 404 + página com título "Agenda do Presidente" → `{ eventos: [], diaPublicado: false }`; 200 com `.list-compromissos` → eventos (status provisório `agendado`), `diaPublicado: true`; qualquer outra coisa → `LayoutError`.

- [ ] **Step 1: Baixar as fixtures reais (uma única vez) e commitá-las**

`scripts/fetch-fixtures.sh`:

```bash
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
```

```bash
mkdir -p tests/collectors scripts && bash scripts/fetch-fixtures.sh
grep -c 'class="compromisso-titulo"' tests/fixtures/agenda/2025-03-10.html tests/fixtures/agenda/2023-01-02.html
```

Expected: `2025-03-10.html:4` e `2023-01-02.html:10`. Se os números forem outros, a página mudou: pare e reavalie os valores esperados do teste.

- [ ] **Step 2: Escrever os testes que falham**

`tests/collectors/agenda.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LayoutError, parseAgenda, urlAgendaDia } from '../../src/collectors/agenda';

const ler = (nome: string) => readFileSync(new URL(`../fixtures/agenda/${nome}`, import.meta.url), 'utf8');
const COLETA = '2026-10-08T12:00:00.000Z';
const TITULO = '<title>Agenda do Presidente da República — Planalto</title>';

describe('urlAgendaDia', () => {
  it('concatena base e data', () => {
    expect(urlAgendaDia('https://x.test/base', '2025-03-10')).toBe('https://x.test/base/2025-03-10');
  });
});

describe('parseAgenda', () => {
  it('lê os 4 compromissos reais de 2025-03-10', () => {
    const r = parseAgenda(ler('2025-03-10.html'), 200, '2025-03-10', COLETA, 'https://x.test/p');
    expect(r.diaPublicado).toBe(true);
    expect(r.eventos).toHaveLength(4);
    const [primeiro, , terceiro] = r.eventos;
    expect(primeiro).toMatchObject({
      id: 'agenda:2025-03-10:09:00:1', tipo: 'agenda', data: '2025-03-10', hora: '09:00',
      local: 'Palácio do Planalto', status: 'agendado',
    });
    expect(primeiro.titulo.startsWith('Ministro da Secretaria de Comunicação Social, Sidônio Palmeira')).toBe(true);
    expect(terceiro.hora).toBe('15:00');
    expect(terceiro.titulo.startsWith('Cerimônia de transmissões de cargos')).toBe(true);
    expect(primeiro.fontes[0]).toMatchObject({ nome: 'agenda-planalto', rotulo: 'Planalto (governo)', url: 'https://x.test/p' });
  });

  it('lê os 10 compromissos de 2023-01-02 (início do mandato)', () => {
    const r = parseAgenda(ler('2023-01-02.html'), 200, '2023-01-02', COLETA, 'https://x.test/p');
    expect(r.eventos).toHaveLength(10);
  });

  it('404 com a página padrão é dia sem agenda, não erro', () => {
    const r = parseAgenda(ler('2026-10-04.404.html'), 404, '2026-10-04', COLETA, 'https://x.test/p');
    expect(r).toEqual({ eventos: [], diaPublicado: false });
  });

  it('200 sem o contêiner de compromissos é LayoutError', () => {
    const html = `<html><head>${TITULO}</head><body></body></html>`;
    expect(() => parseAgenda(html, 200, '2025-03-10', COLETA, 'https://x.test/p')).toThrow(LayoutError);
  });

  it('página que não é a agenda é LayoutError (ex.: JSON de erro)', () => {
    expect(() => parseAgenda('{"error_type": "NotFound"}', 404, '2025-03-10', COLETA, 'https://x.test/p'))
      .toThrow(LayoutError);
  });

  it('status inesperado (302, 403) é LayoutError', () => {
    const html = `<html><head>${TITULO}</head><body></body></html>`;
    expect(() => parseAgenda(html, 403, '2025-03-10', COLETA, 'https://x.test/p')).toThrow(LayoutError);
  });

  it('mesmo horário vira ids com sequência 1 e 2', () => {
    const item = (t: string) =>
      `<div class="item-compromisso"><span class="compromisso-inicio">10h00</span><span class="compromisso-titulo">${t}</span></div>`;
    const html = `<html><head>${TITULO}</head><body><div class="list-compromissos">${item('A')}${item('B')}</div></body></html>`;
    const r = parseAgenda(html, 200, '2025-03-10', COLETA, 'https://x.test/p');
    expect(r.eventos.map((e) => e.id)).toEqual(['agenda:2025-03-10:10:00:1', 'agenda:2025-03-10:10:00:2']);
    expect(r.eventos[0].local).toBeUndefined();
  });

  it('compromisso sem horário usa "sem-hora" no id e não define hora', () => {
    const html = `<html><head>${TITULO}</head><body><div class="list-compromissos"><div class="item-compromisso"><span class="compromisso-titulo">Dia todo</span></div></div></body></html>`;
    const r = parseAgenda(html, 200, '2025-03-10', COLETA, 'https://x.test/p');
    expect(r.eventos[0].id).toBe('agenda:2025-03-10:sem-hora:1');
    expect(r.eventos[0].hora).toBeUndefined();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/collectors/agenda.test.ts`
Expected: FAIL — `Cannot find module '../../src/collectors/agenda'`.

- [ ] **Step 4: Implementar**

`src/collectors/agenda.ts`:

```ts
import * as cheerio from 'cheerio';
import type { Evento } from '../shared/schema';
import { limparEspacos } from '../shared/text';

export class LayoutError extends Error {}

export interface ResultadoAgenda {
  eventos: Evento[];
  diaPublicado: boolean;
}

export function urlAgendaDia(base: string, data: string): string {
  return `${base}/${data}`;
}

function extrairHora(txt: string): string | undefined {
  const m = txt.match(/(\d{1,2})\s*h\s*(\d{2})?/i);
  if (!m) return undefined;
  return `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`;
}

export function parseAgenda(
  corpo: string, status: number, data: string, coletadoEm: string, urlPagina: string,
): ResultadoAgenda {
  const $ = cheerio.load(corpo);
  if (!/agenda do presidente/i.test($('title').first().text())) {
    throw new LayoutError(`Página inesperada (HTTP ${status}) para ${data}`);
  }
  // Dia sem agenda publicada: o servidor responde 404 com a página padrão.
  if (status === 404) return { eventos: [], diaPublicado: false };
  if (status !== 200) throw new LayoutError(`HTTP ${status} inesperado para ${data}`);

  const lista = $('.list-compromissos');
  if (lista.length === 0) throw new LayoutError(`Contêiner .list-compromissos ausente em ${data}`);

  const contagem = new Map<string, number>();
  const eventos: Evento[] = [];
  lista.find('.item-compromisso').each((_, el) => {
    const item = $(el);
    const titulo = limparEspacos(item.find('.compromisso-titulo').text());
    if (!titulo) return;
    const hora = extrairHora(item.find('.compromisso-inicio').text());
    const local = limparEspacos(item.find('.compromisso-local').text()) || undefined;
    const chave = hora ?? 'sem-hora';
    const n = (contagem.get(chave) ?? 0) + 1;
    contagem.set(chave, n);
    eventos.push({
      id: `agenda:${data}:${chave}:${n}`,
      tipo: 'agenda',
      data,
      hora,
      titulo,
      local,
      status: 'agendado',
      fontes: [{ nome: 'agenda-planalto', rotulo: 'Planalto (governo)', url: urlPagina, coletadoEm }],
      confirmadoPor: [],
      historico: [],
    });
  });
  return { eventos, diaPublicado: true };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/collectors/agenda.test.ts && npm run typecheck`
Expected: PASS (8 testes).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: coletor da agenda do presidente com fixtures reais"
```

---

### Task 4: Coletor do Diário Oficial da União (atos)

**Files:**
- Create: `src/collectors/dou.ts`
- Test: `tests/collectors/dou.test.ts`

**Interfaces:**
- Consumes: `Evento` (Task 1), `parseDataExtenso`, `limparEspacos` (Task 1).
- Produces:
  `class DouLayoutError extends Error`
  `urlDouEdicao(data: string): string` — `https://www.in.gov.br/leiturajornal?data=DD-MM-AAAA&secao=do1`
  `parseDou(html: string, data: string, coletadoEm: string): Evento[]` — `data` é a data de publicação; devolve só decretos numerados, leis e medidas provisórias do Poder Executivo/Legislativo, com `tipo: 'ato'`, `status: 'publicado'`, `datasAto`, `ementa`, fonte "Diário Oficial da União".
  `urlTextoPlanalto(titulo: string, assinatura: string | undefined): string | null` — monta a URL do texto no Planalto para `DECRETO Nº` e `LEI Nº` (null para os demais).

- [ ] **Step 1: Escrever os testes que falham**

`tests/collectors/dou.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DouLayoutError, parseDou, urlDouEdicao, urlTextoPlanalto } from '../../src/collectors/dou';

const COLETA = '2026-10-08T12:00:00.000Z';
const item = (o: Record<string, string>) => ({
  pubName: 'DO1', pubDate: '07/10/2026', content: '', artType: 'Decreto numerado',
  hierarchyStr: 'Atos do Poder Executivo', ...o,
});
const html = (itens: object[]) =>
  `<html><body><script id="params" type="application/json">${JSON.stringify({ jsonArray: itens })}</script></body></html>`;

const DECRETO = item({
  title: 'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026',
  urlTitle: 'decreto-n-13.132-de-6-de-outubro-de-2026-736937325',
  content: 'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026 Autoriza o ingresso e a permanência temporária de forças militares no território nacional. O PRESIDENTE DA REPÚBLICA, no uso da atribuição que lhe confere o art. 84',
});
const LEI = item({
  title: 'LEI Nº 15.999, DE 6 DE OUTUBRO DE 2026', urlTitle: 'lei-n-15.999-de-6-de-outubro-de-2026-700000001',
  artType: 'Lei', hierarchyStr: 'Atos do Poder Legislativo',
  content: 'LEI Nº 15.999, DE 6 DE OUTUBRO DE 2026 Dispõe sobre algo. O PRESIDENTE DA REPÚBLICA Faço saber que o Congresso Nacional decreta',
});
const RESOLUCAO = item({
  title: 'RESOLUÇÃO GECEX Nº 971, DE 6 DE OUTUBRO DE 2026', urlTitle: 'resolucao-gecex-n-971-736952867',
  artType: 'Resolução', hierarchyStr: 'Presidência da República/Câmara de Comércio Exterior',
});
const DECRETO_LEGISLATIVO = item({
  title: 'DECRETO LEGISLATIVO Nº 12, DE 5 DE OUTUBRO DE 2026', urlTitle: 'dl-12-700000002',
  hierarchyStr: 'Atos do Poder Legislativo',
});
const DECRETO_SEM_NUMERO = item({
  title: 'DECRETO DE 6 DE OUTUBRO DE 2026', urlTitle: 'decreto-de-6-700000003',
  artType: 'Decreto não numerado',
});

describe('urlDouEdicao', () => {
  it('formata a data como DD-MM-AAAA', () => {
    expect(urlDouEdicao('2026-10-07')).toBe('https://www.in.gov.br/leiturajornal?data=07-10-2026&secao=do1');
  });
});

describe('parseDou', () => {
  it('mantém só decretos numerados, leis e MPs; descarta o resto', () => {
    const r = parseDou(html([DECRETO, LEI, RESOLUCAO, DECRETO_LEGISLATIVO, DECRETO_SEM_NUMERO]), '2026-10-07', COLETA);
    expect(r.map((e) => e.titulo)).toEqual([
      'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026',
      'LEI Nº 15.999, DE 6 DE OUTUBRO DE 2026',
    ]);
  });

  it('preenche id, datas, ementa, status e fonte do decreto', () => {
    const [d] = parseDou(html([DECRETO]), '2026-10-07', COLETA);
    expect(d).toMatchObject({
      id: 'dou:decreto-n-13.132-de-6-de-outubro-de-2026-736937325',
      tipo: 'ato', data: '2026-10-07', status: 'publicado',
      datasAto: { assinatura: '2026-10-06', publicacao: '2026-10-07' },
    });
    expect(d.ementa).toBe('Autoriza o ingresso e a permanência temporária de forças militares no território nacional.');
    expect(d.fontes[0]).toMatchObject({
      nome: 'dou', rotulo: 'Diário Oficial da União',
      url: 'https://www.in.gov.br/web/dou/-/decreto-n-13.132-de-6-de-outubro-de-2026-736937325',
    });
  });

  it('lança DouLayoutError quando o JSON embutido não existe ou não é lista', () => {
    expect(() => parseDou('<html></html>', '2026-10-07', COLETA)).toThrow(DouLayoutError);
    expect(() => parseDou('<script id="params">{"jsonArray": 5}</script>', '2026-10-07', COLETA)).toThrow(DouLayoutError);
  });

  it('edição sem atos devolve lista vazia', () => {
    expect(parseDou(html([]), '2026-10-07', COLETA)).toEqual([]);
  });
});

describe('urlTextoPlanalto', () => {
  it('monta a URL do decreto (padrão verificado em 2023)', () => {
    expect(urlTextoPlanalto('DECRETO Nº 11.369, DE 1º DE JANEIRO DE 2023', '2023-01-01'))
      .toBe('https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/decreto/D11369.htm');
  });
  it('monta a URL da lei', () => {
    expect(urlTextoPlanalto('LEI Nº 14.663, DE 28 DE AGOSTO DE 2023', '2023-08-28'))
      .toBe('https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/L14663.htm');
  });
  it('usa a legislatura certa a partir de 2027', () => {
    expect(urlTextoPlanalto('DECRETO Nº 20.000, DE 2 DE JANEIRO DE 2027', '2027-01-02'))
      .toBe('https://www.planalto.gov.br/ccivil_03/_ato2027-2030/2027/decreto/D20000.htm');
  });
  it('devolve null para lei complementar, MP e sem data', () => {
    expect(urlTextoPlanalto('LEI COMPLEMENTAR Nº 200, DE 1 DE JANEIRO DE 2023', '2023-01-01')).toBeNull();
    expect(urlTextoPlanalto('MEDIDA PROVISÓRIA Nº 1.333, DE 7 DE JANEIRO DE 2026', '2026-01-07')).toBeNull();
    expect(urlTextoPlanalto('DECRETO Nº 1, DE 1 DE JANEIRO', undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/collectors/dou.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/collectors/dou.ts`:

```ts
import * as cheerio from 'cheerio';
import type { Evento } from '../shared/schema';
import { limparEspacos, parseDataExtenso } from '../shared/text';

export class DouLayoutError extends Error {}

interface ItemDou {
  title?: string;
  urlTitle?: string;
  content?: string;
  hierarchyStr?: string;
}

const ATO = /^(DECRETO|LEI|MEDIDA PROVISÓRIA)\b/i;
const NUMERADO = /\bN[ºo°]\s*[\d.]+/i;
const DECRETO_LEGISLATIVO = /^DECRETO LEGISLATIVO\b/i;

export function urlDouEdicao(data: string): string {
  const [a, m, d] = data.split('-');
  return `https://www.in.gov.br/leiturajornal?data=${d}-${m}-${a}&secao=do1`;
}

function extrairEmenta(titulo: string, content: string): string | undefined {
  const semTitulo = content.startsWith(titulo) ? content.slice(titulo.length) : content;
  const corte = semTitulo.search(/\sO\s+PRESIDENTE\s+DA\s+REP[ÚU]BLICA/i);
  const ementa = limparEspacos(corte >= 0 ? semTitulo.slice(0, corte) : semTitulo);
  return ementa || undefined;
}

export function parseDou(html: string, data: string, coletadoEm: string): Evento[] {
  const $ = cheerio.load(html);
  let json: { jsonArray?: unknown };
  try {
    json = JSON.parse($('script#params').first().text());
  } catch {
    throw new DouLayoutError('JSON "params" ausente ou inválido na página do DOU');
  }
  if (!Array.isArray(json.jsonArray)) throw new DouLayoutError('"jsonArray" ausente na página do DOU');

  const eventos: Evento[] = [];
  for (const bruto of json.jsonArray as ItemDou[]) {
    const titulo = limparEspacos(bruto.title ?? '');
    const urlTitle = bruto.urlTitle ?? '';
    if (!titulo || !urlTitle) continue;
    if (!(bruto.hierarchyStr ?? '').startsWith('Atos do Poder')) continue;
    if (!ATO.test(titulo) || DECRETO_LEGISLATIVO.test(titulo) || !NUMERADO.test(titulo)) continue;
    eventos.push({
      id: `dou:${urlTitle}`,
      tipo: 'ato',
      data,
      titulo,
      status: 'publicado',
      ementa: extrairEmenta(titulo, bruto.content ?? ''),
      datasAto: { assinatura: parseDataExtenso(titulo) ?? undefined, publicacao: data },
      fontes: [{
        nome: 'dou', rotulo: 'Diário Oficial da União',
        url: `https://www.in.gov.br/web/dou/-/${urlTitle}`, coletadoEm,
      }],
      confirmadoPor: [],
      historico: [],
    });
  }
  return eventos;
}

export function urlTextoPlanalto(titulo: string, assinatura: string | undefined): string | null {
  const m = titulo.match(/^(DECRETO|LEI)\s+N[ºo°]\s*([\d.]+)/i);
  if (!m || !assinatura) return null;
  const ano = Number(assinatura.slice(0, 4));
  const inicio = 2019 + 4 * Math.floor((ano - 2019) / 4);
  const numero = m[2].replace(/\./g, '');
  const decreto = m[1].toUpperCase() === 'DECRETO';
  return `https://www.planalto.gov.br/ccivil_03/_ato${inicio}-${inicio + 3}/${ano}/${decreto ? 'decreto' : 'lei'}/${decreto ? 'D' : 'L'}${numero}.htm`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/collectors/dou.test.ts && npm run typecheck`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: coletor do Diário Oficial (decretos, leis, MPs) e URL do texto no Planalto"
```

---

### Task 5: Coletor dos comunicados do Planalto e regra de relevância

**Files:**
- Create: `src/collectors/planalto.ts`
- Test: `tests/collectors/planalto.test.ts`

**Interfaces:**
- Consumes: `Mandato` (Task 1), `normalizar`, `urlHttpsSegura`, `dataSaoPaulo`, `limparEspacos` (Task 1).
- Produces:
  `URL_FEED_PLANALTO = 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/RSS'`
  `interface Comunicado { id: string; data: string; titulo: string; resumo: string; url: string; coletadoEm: string }`
  `parsePlanaltoFeed(xml: string, coletadoEm: string): Comunicado[]` (aceita RSS 1.0/RDF — o formato real — e RSS 2.0)
  `citaPresidente(texto: string, mandato: Mandato): boolean`

- [ ] **Step 1: Escrever os testes que falham**

`tests/collectors/planalto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { citaPresidente, parsePlanaltoFeed } from '../../src/collectors/planalto';
import type { Mandato } from '../../src/shared/schema';

const COLETA = '2026-10-08T12:00:00.000Z';
const MANDATO: Mandato = {
  presidente: 'Luiz Inácio Lula da Silva', nomes: ['Lula'], inicio: '2023-01-01', fim: null,
  agendaBase: 'https://www.gov.br/x',
};

const RDF = `<?xml version="1.0" encoding="utf-8" ?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns="http://purl.org/rss/1.0/">
<channel rdf:about="https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/RSS"><title>Notícias</title></channel>
<item rdf:about="https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/2026/09/presidente-visita-hospital-em-barretos">
  <title>Presidente visita o Hospital de Amor, em Barretos (SP)</title>
  <link>https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/2026/09/presidente-visita-hospital-em-barretos</link>
  <description>&lt;p&gt;O presidente esteve em &lt;b&gt;Barretos&lt;/b&gt;.&lt;/p&gt;</description>
  <dc:date>2026-09-08T17:22:00-03:00</dc:date>
</item>
<item rdf:about="http://inseguro.test/x">
  <title>Item com link http</title><link>http://inseguro.test/x</link><description></description>
  <dc:date>2026-09-08T10:00:00-03:00</dc:date>
</item>
</rdf:RDF>`;

describe('parsePlanaltoFeed', () => {
  it('lê itens RDF, limpa HTML da descrição e usa a data de São Paulo', () => {
    const r = parsePlanaltoFeed(RDF, COLETA);
    expect(r).toHaveLength(1); // o item com link http é descartado
    expect(r[0]).toEqual({
      id: 'planalto:presidente-visita-hospital-em-barretos',
      data: '2026-09-08',
      titulo: 'Presidente visita o Hospital de Amor, em Barretos (SP)',
      resumo: 'O presidente esteve em Barretos.',
      url: 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/2026/09/presidente-visita-hospital-em-barretos',
      coletadoEm: COLETA,
    });
  });

  it('aceita RSS 2.0 com pubDate', () => {
    const rss = `<rss version="2.0"><channel><item><title>Presidente recebe ministro</title>
      <link>https://www.gov.br/planalto/n/presidente-recebe</link><description>x</description>
      <pubDate>Tue, 08 Sep 2026 23:30:00 -0300</pubDate></item></channel></rss>`;
    const r = parsePlanaltoFeed(rss, COLETA);
    expect(r[0].data).toBe('2026-09-08');
    expect(r[0].id).toBe('planalto:presidente-recebe');
  });

  it('feed vazio devolve lista vazia', () => {
    expect(parsePlanaltoFeed('<rdf:RDF xmlns:rdf="x"></rdf:RDF>', COLETA)).toEqual([]);
  });
});

describe('citaPresidente', () => {
  it.each([
    ['Presidente da República visita as obras do Cinturão das Águas', true],
    ['Presidente visita o Diretório de Reabilitação Moderna (DREAM)', true],
    ['Presidente Lula inaugura escola', true],
    ['Lula e o presidente do BNDES assinam contrato', true],
  ])('%s -> %s', (texto, esperado) => {
    expect(citaPresidente(texto, MANDATO)).toBe(esperado);
  });

  it.each([
    'Presidente do Senado recebe ministros',
    'Presidente da Câmara anuncia pauta',
    'Presidente da Petrobras anuncia investimento',
    'Vice-Presidente participa de cerimônia',
    'Governo federal apresenta nova etapa do Plano Brasil Soberano',
    'Visita presencial ao Centro Industrial Nuclear de Aramar, em Iperó (SP)',
  ])('não considera relevante: %s', (texto) => {
    expect(citaPresidente(texto, MANDATO)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/collectors/planalto.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/collectors/planalto.ts`:

```ts
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import type { Mandato } from '../shared/schema';
import { dataSaoPaulo, limparEspacos, normalizar, urlHttpsSegura } from '../shared/text';

export const URL_FEED_PLANALTO = 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/RSS';

export interface Comunicado {
  id: string;
  data: string;
  titulo: string;
  resumo: string;
  url: string;
  coletadoEm: string;
}

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, trimValues: true });

function listar(x: unknown): Record<string, unknown>[] {
  if (x === undefined || x === null || x === '') return [];
  return (Array.isArray(x) ? x : [x]) as Record<string, unknown>[];
}

function textoSimples(x: unknown): string {
  return limparEspacos(cheerio.load(`<div>${String(x ?? '')}</div>`)('div').text());
}

function dataDoItem(bruto: unknown): string | null {
  const s = String(bruto ?? '');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : dataSaoPaulo(d);
}

export function parsePlanaltoFeed(xml: string, coletadoEm: string): Comunicado[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const itens = listar(doc['rdf:RDF']?.item ?? doc.rss?.channel?.item);
  const saida: Comunicado[] = [];
  for (const it of itens) {
    const url = urlHttpsSegura(String(it.link ?? ''));
    const titulo = textoSimples(it.title);
    const data = dataDoItem(it['dc:date'] ?? it.pubDate);
    if (!url || !titulo || !data) continue;
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? url;
    saida.push({ id: `planalto:${slug}`, data, titulo, resumo: textoSimples(it.description), url, coletadoEm });
  }
  return saida;
}

// "Presidente" conta; "Presidente do/da/de X" (Senado, Câmara, empresa) não, exceto "da República".
const PRESIDENTE = /\bpresidente\b(?!\s+d[aoe]s?\s+(?!republica))/;

export function citaPresidente(texto: string, mandato: Mandato): boolean {
  const t = normalizar(texto).replace(/vice[- ]?presidente/g, ' ');
  if (PRESIDENTE.test(t)) return true;
  return mandato.nomes.some((n) => new RegExp(`\\b${normalizar(n)}\\b`).test(t));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/collectors/planalto.test.ts && npm run typecheck`
Expected: PASS. (Se o item RDF vier sem `link` como texto — por exemplo, só como atributo `rdf:about` — o teste do feed falha; nesse caso use `it['@_rdf:about']` com `ignoreAttributes: false` e registre a diferença no commit.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: coletor de comunicados do Planalto e regra de relevância"
```

---

### Task 6: Coletor de notícias (aba Notícias)

**Files:**
- Create: `src/collectors/noticias.ts`
- Test: `tests/collectors/noticias.test.ts`

**Interfaces:**
- Consumes: `Noticia`, `Mandato` (Task 1); `citaPresidente` (Task 5); `urlHttpsSegura` (Task 1).
- Produces:
  `URL_AGENCIA_BRASIL = 'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml'`
  `urlBuscaGoogleNews(nome: string): string`
  `parseNoticias(xml: string, origem: 'google-news' | 'agencia-brasil'): Noticia[]`
  `filtrarRelevantes(noticias: Noticia[], mandato: Mandato): Noticia[]` (só filtra a origem `agencia-brasil`)

- [ ] **Step 1: Escrever os testes que falham**

`tests/collectors/noticias.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filtrarRelevantes, parseNoticias, urlBuscaGoogleNews } from '../../src/collectors/noticias';
import type { Mandato } from '../../src/shared/schema';

const MANDATO: Mandato = {
  presidente: 'Luiz Inácio Lula da Silva', nomes: ['Lula'], inicio: '2023-01-01', fim: null,
  agendaBase: 'https://www.gov.br/x',
};

const GOOGLE = `<rss version="2.0"><channel>
<item><title>Bolsa Família: o que Lula propõe - BBC</title><link>https://news.google.com/rss/articles/abc</link>
<pubDate>Thu, 08 Oct 2026 08:54:57 GMT</pubDate><source url="https://www.bbc.com">BBC</source></item>
<item><title>Sem link seguro</title><link>http://x.test/a</link><pubDate>Thu, 08 Oct 2026 08:00:00 GMT</pubDate></item>
<item><title>Data inválida - Folha</title><link>https://news.google.com/rss/articles/def</link><pubDate>ontem</pubDate><source url="https://f.com">Folha</source></item>
</channel></rss>`;

const AGENCIA = `<rss version="2.0"><channel>
<item><title>Presidente sanciona lei</title><link>https://agenciabrasil.ebc.com.br/politica/noticia/1</link><pubDate>Thu, 08 Oct 2026 09:00:00 -0300</pubDate></item>
<item><title>Senado aprova projeto</title><link>https://agenciabrasil.ebc.com.br/politica/noticia/2</link><pubDate>Thu, 08 Oct 2026 09:10:00 -0300</pubDate></item>
</channel></rss>`;

describe('parseNoticias', () => {
  it('lê o Google News: remove o veículo do título e converte a data', () => {
    const r = parseNoticias(GOOGLE, 'google-news');
    expect(r).toHaveLength(1); // descarta link http e data inválida
    expect(r[0]).toMatchObject({
      titulo: 'Bolsa Família: o que Lula propõe', veiculo: 'BBC', origem: 'google-news',
      data: '2026-10-08T08:54:57.000Z', url: 'https://news.google.com/rss/articles/abc',
    });
    expect(r[0].id).toMatch(/^google-news:[0-9a-f]{12}$/);
  });
  it('ids são estáveis entre leituras', () => {
    expect(parseNoticias(GOOGLE, 'google-news')[0].id).toBe(parseNoticias(GOOGLE, 'google-news')[0].id);
  });
  it('Agência Brasil usa o nome da agência como veículo', () => {
    const r = parseNoticias(AGENCIA, 'agencia-brasil');
    expect(r.map((n) => n.veiculo)).toEqual(['Agência Brasil', 'Agência Brasil']);
  });
});

describe('filtrarRelevantes', () => {
  it('na Agência Brasil mantém só o que cita o presidente', () => {
    const r = filtrarRelevantes(parseNoticias(AGENCIA, 'agencia-brasil'), MANDATO);
    expect(r.map((n) => n.titulo)).toEqual(['Presidente sanciona lei']);
  });
  it('no Google News mantém tudo (a busca já é sobre o presidente)', () => {
    const g = parseNoticias(GOOGLE, 'google-news');
    expect(filtrarRelevantes(g, MANDATO)).toEqual(g);
  });
});

describe('urlBuscaGoogleNews', () => {
  it('codifica a consulta e fixa português do Brasil', () => {
    const u = urlBuscaGoogleNews('Lula');
    expect(u).toContain('news.google.com/rss/search?q=Presidente%20Lula%20when%3A7d');
    expect(u).toContain('hl=pt-BR');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/collectors/noticias.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/collectors/noticias.ts`:

```ts
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import type { Mandato, Noticia } from '../shared/schema';
import { limparEspacos, urlHttpsSegura } from '../shared/text';
import { citaPresidente } from './planalto';

export const URL_AGENCIA_BRASIL = 'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml';

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, trimValues: true });

export function urlBuscaGoogleNews(nome: string): string {
  const q = encodeURIComponent(`Presidente ${nome} when:7d`);
  return `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}

export function parseNoticias(xml: string, origem: Noticia['origem']): Noticia[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const bruto = doc.rss?.channel?.item;
  const itens: Record<string, unknown>[] = bruto === undefined ? [] : Array.isArray(bruto) ? bruto : [bruto];
  const saida: Noticia[] = [];
  for (const it of itens) {
    const url = urlHttpsSegura(String(it.link ?? ''));
    const data = new Date(String(it.pubDate ?? ''));
    let titulo = limparEspacos(String(it.title ?? ''));
    const veiculo = limparEspacos(String(it.source ?? '')) || (origem === 'agencia-brasil' ? 'Agência Brasil' : '');
    if (!url || !titulo || !veiculo || Number.isNaN(data.getTime())) continue;
    if (titulo.endsWith(` - ${veiculo}`)) titulo = titulo.slice(0, -(veiculo.length + 3));
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 12);
    saida.push({ id: `${origem}:${hash}`, titulo, veiculo, data: data.toISOString(), url, origem });
  }
  return saida;
}

export function filtrarRelevantes(noticias: Noticia[], mandato: Mandato): Noticia[] {
  return noticias.filter((n) => n.origem !== 'agencia-brasil' || citaPresidente(n.titulo, mandato));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/collectors/noticias.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: coletor de notícias (Google News e Agência Brasil)"
```

---

### Task 7: Mesclagem e cálculo de status

**Files:**
- Create: `src/pipeline/merge.ts`
- Test: `tests/pipeline/merge.test.ts`

**Interfaces:**
- Consumes: `Evento`, `Status` (Task 1).
- Produces:
  `calcularStatus(ev: Evento, hoje: string): Status`
  `aplicarStatus(eventos: Evento[], hoje: string): Evento[]`
  `mesclar(existentes: Evento[], coletados: Evento[], diasCompletos: ReadonlySet<string>, agora: string): Evento[]`
  Regras: id novo entra; id existente mantém `fontes[].coletadoEm` originais e une fontes por URL e `confirmadoPor`; mudança de `titulo`/`local` empilha a versão anterior em `historico`; agenda de um dia em `diasCompletos` que sumiu recebe `removidoEm`; reaparecer limpa `removidoEm`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/pipeline/merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aplicarStatus, calcularStatus, mesclar } from '../../src/pipeline/merge';
import type { Evento } from '../../src/shared/schema';

const T1 = '2026-10-08T12:00:00.000Z';
const T2 = '2026-10-08T12:10:00.000Z';

function agenda(sobre: Partial<Evento> = {}): Evento {
  return {
    id: 'agenda:2026-10-08:10:00:1', tipo: 'agenda', data: '2026-10-08', hora: '10:00',
    titulo: 'Reunião', local: 'Palácio do Planalto', status: 'agendado',
    fontes: [{ nome: 'agenda-planalto', rotulo: 'Planalto (governo)', url: 'https://x.test/a', coletadoEm: T1 }],
    confirmadoPor: [], historico: [], ...sobre,
  };
}

describe('calcularStatus', () => {
  it('agenda futura ou de hoje sem confirmação é "agendado"', () => {
    expect(calcularStatus(agenda(), '2026-10-08')).toBe('agendado');
    expect(calcularStatus(agenda({ data: '2026-10-09' }), '2026-10-08')).toBe('agendado');
  });
  it('agenda de dia passado sem confirmação é "consta_na_agenda" (o tempo não prova nada)', () => {
    expect(calcularStatus(agenda(), '2026-10-09')).toBe('consta_na_agenda');
  });
  it('confirmada por comunicado é "realizado"', () => {
    expect(calcularStatus(agenda({ confirmadoPor: ['planalto:x'] }), '2026-10-09')).toBe('realizado');
  });
  it('alterada (com histórico) é "alterado"; removida é "removido" e vence as demais', () => {
    const h = [{ titulo: 'Antigo', registradoEm: T1 }];
    expect(calcularStatus(agenda({ historico: h }), '2026-10-08')).toBe('alterado');
    expect(calcularStatus(agenda({ historico: h, removidoEm: T2 }), '2026-10-08')).toBe('removido');
    expect(calcularStatus(agenda({ confirmadoPor: ['x'], removidoEm: T2 }), '2026-10-08')).toBe('removido');
  });
  it('ato é "publicado" e comunicado é "realizado"', () => {
    expect(calcularStatus(agenda({ tipo: 'ato' }), '2026-10-08')).toBe('publicado');
    expect(calcularStatus(agenda({ tipo: 'comunicado' }), '2026-10-08')).toBe('realizado');
  });
});

describe('mesclar', () => {
  const dias = new Set(['2026-10-08']);

  it('adiciona eventos novos', () => {
    expect(mesclar([], [agenda()], dias, T1)).toHaveLength(1);
  });

  it('é idempotente: mesclar o mesmo conteúdo de novo não muda nada', () => {
    const uma = mesclar([], [agenda()], dias, T1);
    const duas = mesclar(uma, [agenda({ fontes: [{ ...agenda().fontes[0], coletadoEm: T2 }] })], dias, T2);
    expect(duas).toEqual(uma); // coletadoEm original preservado
  });

  it('mudança de título no mesmo horário empilha o histórico', () => {
    const antes = mesclar([], [agenda()], dias, T1);
    const depois = mesclar(antes, [agenda({ titulo: 'Reunião com ministros' })], dias, T2);
    expect(depois[0].titulo).toBe('Reunião com ministros');
    expect(depois[0].historico).toEqual([
      { titulo: 'Reunião', hora: '10:00', local: 'Palácio do Planalto', registradoEm: T2 },
    ]);
  });

  it('compromisso que sumiu de um dia completo é marcado removido', () => {
    const antes = mesclar([], [agenda()], dias, T1);
    const depois = mesclar(antes, [], dias, T2);
    expect(depois[0].removidoEm).toBe(T2);
  });

  it('compromisso que sumiu de um dia NÃO completo (404/erro) é preservado', () => {
    const antes = mesclar([], [agenda()], dias, T1);
    const depois = mesclar(antes, [], new Set(), T2);
    expect(depois[0].removidoEm).toBeUndefined();
  });

  it('se reaparecer, a remoção é desfeita', () => {
    const removido = mesclar(mesclar([], [agenda()], dias, T1), [], dias, T2);
    const volta = mesclar(removido, [agenda()], dias, '2026-10-08T12:20:00.000Z');
    expect(volta[0].removidoEm).toBeUndefined();
  });

  it('une fontes por URL e confirmadoPor sem duplicar', () => {
    const antes = mesclar([], [agenda()], dias, T1);
    const novaFonte = { nome: 'comunicado-planalto', rotulo: 'Planalto (governo)', url: 'https://x.test/c', coletadoEm: T2 };
    const depois = mesclar(antes, [agenda({ fontes: [novaFonte], confirmadoPor: ['planalto:c'] })], dias, T2);
    expect(depois[0].fontes.map((f) => f.url)).toEqual(['https://x.test/a', 'https://x.test/c']);
    const outra = mesclar(depois, [agenda({ fontes: [novaFonte], confirmadoPor: ['planalto:c'] })], dias, T2);
    expect(outra[0].confirmadoPor).toEqual(['planalto:c']);
  });

  it('eventos que não vieram na coleta (ex.: atos antigos) permanecem', () => {
    const ato = agenda({ id: 'dou:1', tipo: 'ato', data: '2026-09-01' });
    expect(mesclar([ato], [], dias, T1)).toHaveLength(1);
  });
});

describe('aplicarStatus', () => {
  it('recalcula o status de todos', () => {
    const r = aplicarStatus([agenda()], '2026-10-09');
    expect(r[0].status).toBe('consta_na_agenda');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pipeline/merge.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/pipeline/merge.ts`:

```ts
import type { Evento, Fonte, Status } from '../shared/schema';

export function calcularStatus(ev: Evento, hoje: string): Status {
  if (ev.tipo === 'ato') return 'publicado';
  if (ev.tipo === 'comunicado') return 'realizado';
  if (ev.removidoEm) return 'removido';
  if (ev.confirmadoPor.length > 0) return 'realizado';
  if (ev.historico.length > 0) return 'alterado';
  return ev.data >= hoje ? 'agendado' : 'consta_na_agenda';
}

export function aplicarStatus(eventos: Evento[], hoje: string): Evento[] {
  return eventos.map((e) => ({ ...e, status: calcularStatus(e, hoje) }));
}

function unirFontes(atuais: Fonte[], novas: Fonte[]): Fonte[] {
  const urls = new Set(atuais.map((f) => f.url));
  return [...atuais, ...novas.filter((f) => !urls.has(f.url))];
}

function unir(a: string[], b: string[]): string[] {
  return [...a, ...b.filter((x) => !a.includes(x))];
}

export function mesclar(
  existentes: Evento[], coletados: Evento[], diasCompletos: ReadonlySet<string>, agora: string,
): Evento[] {
  const mapa = new Map(existentes.map((e) => [e.id, e]));
  const vistos = new Set<string>();

  for (const c of coletados) {
    vistos.add(c.id);
    const e = mapa.get(c.id);
    if (!e) {
      mapa.set(c.id, c);
      continue;
    }
    const mudou = e.titulo !== c.titulo || e.local !== c.local;
    mapa.set(c.id, {
      ...e,
      titulo: c.titulo,
      local: c.local,
      ementa: c.ementa ?? e.ementa,
      historico: mudou
        ? [...e.historico, { titulo: e.titulo, hora: e.hora, local: e.local, registradoEm: agora }]
        : e.historico,
      fontes: unirFontes(e.fontes, c.fontes),
      confirmadoPor: unir(e.confirmadoPor, c.confirmadoPor),
      removidoEm: undefined,
    });
  }

  for (const e of [...mapa.values()]) {
    if (e.tipo === 'agenda' && !e.removidoEm && !vistos.has(e.id) && diasCompletos.has(e.data)) {
      mapa.set(e.id, { ...e, removidoEm: agora });
    }
  }
  return [...mapa.values()];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/pipeline/merge.test.ts && npm run typecheck`
Expected: PASS (13 testes).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: mesclagem idempotente de eventos e cálculo de status"
```

---

### Task 8: Ligação entre comunicados e compromissos da agenda

**Files:**
- Create: `src/pipeline/link.ts`
- Test: `tests/pipeline/link.test.ts`

**Interfaces:**
- Consumes: `Evento`, `Mandato`, `Fonte` (Task 1); `Comunicado`, `citaPresidente` (Task 5); `normalizar` (Task 1).
- Produces: `ligarComunicados(eventos: Evento[], comunicados: Comunicado[], mandato: Mandato): Evento[]`
  Regras: um comunicado liga a um compromisso de agenda (não removido) **só se** tiver a mesma data e houver **exatamente um** candidato cujo `local` (sem sufixo de UF, ≥ 4 caracteres) apareça no título/resumo; ao ligar, soma o id em `confirmadoPor` e a fonte do comunicado em `fontes`, e **não** cria item próprio. Sem ligação: vira item `comunicado` só se `citaPresidente`; se o id já existir na lista, é ignorado.

- [ ] **Step 1: Escrever os testes que falham**

`tests/pipeline/link.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Comunicado } from '../../src/collectors/planalto';
import { ligarComunicados } from '../../src/pipeline/link';
import type { Evento, Mandato } from '../../src/shared/schema';

const T = '2026-09-08T20:00:00.000Z';
const MANDATO: Mandato = {
  presidente: 'Luiz Inácio Lula da Silva', nomes: ['Lula'], inicio: '2023-01-01', fim: null,
  agendaBase: 'https://www.gov.br/x',
};

const agenda = (id: string, local: string, sobre: Partial<Evento> = {}): Evento => ({
  id, tipo: 'agenda', data: '2026-09-08', hora: '09:00', titulo: 'Visita', local, status: 'agendado',
  fontes: [{ nome: 'agenda-planalto', rotulo: 'Planalto (governo)', url: `https://x.test/${id}`, coletadoEm: T }],
  confirmadoPor: [], historico: [], ...sobre,
});

const comunicado = (sobre: Partial<Comunicado> = {}): Comunicado => ({
  id: 'planalto:visita-barretos', data: '2026-09-08',
  titulo: 'Presidente visita o Hospital de Amor, em Barretos (SP)', resumo: '',
  url: 'https://www.gov.br/planalto/n/visita-barretos', coletadoEm: T, ...sobre,
});

describe('ligarComunicados', () => {
  it('liga ao único compromisso do mesmo dia e local e soma a fonte', () => {
    const r = ligarComunicados([agenda('a1', 'Barretos - SP')], [comunicado()], MANDATO);
    expect(r).toHaveLength(1);
    expect(r[0].confirmadoPor).toEqual(['planalto:visita-barretos']);
    expect(r[0].fontes.map((f) => f.nome)).toEqual(['agenda-planalto', 'comunicado-planalto']);
  });

  it('é idempotente ao rodar duas vezes', () => {
    const uma = ligarComunicados([agenda('a1', 'Barretos - SP')], [comunicado()], MANDATO);
    const duas = ligarComunicados(uma, [comunicado()], MANDATO);
    expect(duas).toEqual(uma);
  });

  it('com dois compromissos candidatos NÃO liga e cria item próprio (cita o presidente)', () => {
    const r = ligarComunicados(
      [agenda('a1', 'Barretos - SP'), agenda('a2', 'Barretos (SP)', { hora: '15:00' })],
      [comunicado()], MANDATO,
    );
    expect(r.filter((e) => e.confirmadoPor.length > 0)).toHaveLength(0);
    const proprio = r.find((e) => e.tipo === 'comunicado');
    expect(proprio).toMatchObject({ id: 'planalto:visita-barretos', status: 'realizado', data: '2026-09-08' });
    expect(proprio?.fontes[0].url).toBe('https://www.gov.br/planalto/n/visita-barretos');
  });

  it('data diferente não liga', () => {
    const r = ligarComunicados([agenda('a1', 'Barretos - SP', { data: '2026-09-09' })], [comunicado()], MANDATO);
    expect(r.find((e) => e.id === 'a1')?.confirmadoPor).toEqual([]);
  });

  it('compromisso removido não é candidato', () => {
    const r = ligarComunicados([agenda('a1', 'Barretos - SP', { removidoEm: T })], [comunicado()], MANDATO);
    expect(r.find((e) => e.id === 'a1')?.confirmadoPor).toEqual([]);
  });

  it('comunicado ambíguo que não liga e não cita o presidente é descartado', () => {
    const c = comunicado({ id: 'planalto:aramar', titulo: 'Visita presencial ao Centro Industrial Nuclear de Aramar, em Iperó (SP)' });
    const r = ligarComunicados([agenda('a1', 'Palácio do Planalto')], [c], MANDATO);
    expect(r).toHaveLength(1);
  });

  it('comunicado ambíguo que liga a um compromisso confirma-o', () => {
    const c = comunicado({ id: 'planalto:aramar', titulo: 'Visita presencial ao Centro Industrial Nuclear de Aramar, em Iperó (SP)' });
    const r = ligarComunicados([agenda('a1', 'Iperó - SP')], [c], MANDATO);
    expect(r[0].confirmadoPor).toEqual(['planalto:aramar']);
  });

  it('"Presidente do Senado" não vira item do presidente', () => {
    const c = comunicado({ id: 'planalto:senado', titulo: 'Presidente do Senado recebe ministros' });
    expect(ligarComunicados([], [c], MANDATO)).toEqual([]);
  });

  it('não duplica comunicado que já existe como item próprio', () => {
    const uma = ligarComunicados([], [comunicado()], MANDATO);
    const duas = ligarComunicados(uma, [comunicado()], MANDATO);
    expect(duas).toHaveLength(1);
  });

  it('local curto demais (< 4 caracteres) nunca casa', () => {
    const r = ligarComunicados([agenda('a1', 'SP')], [comunicado()], MANDATO);
    expect(r.find((e) => e.id === 'a1')?.confirmadoPor).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pipeline/link.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/pipeline/link.ts`:

```ts
import { citaPresidente, type Comunicado } from '../collectors/planalto';
import type { Evento, Fonte, Mandato } from '../shared/schema';
import { normalizar } from '../shared/text';

function chaveLocal(local: string): string {
  return normalizar(local).replace(/\s*[-–/,(]\s*[a-z]{2}\)?$/, '').trim();
}

function fonteDe(c: Comunicado): Fonte {
  return { nome: 'comunicado-planalto', rotulo: 'Planalto (governo)', url: c.url, coletadoEm: c.coletadoEm };
}

function eventoDe(c: Comunicado): Evento {
  return {
    id: c.id, tipo: 'comunicado', data: c.data, titulo: c.titulo, status: 'realizado',
    ementa: c.resumo || undefined, fontes: [fonteDe(c)], confirmadoPor: [], historico: [],
  };
}

export function ligarComunicados(eventos: Evento[], comunicados: Comunicado[], mandato: Mandato): Evento[] {
  const saida = eventos.map((e) => ({ ...e, fontes: [...e.fontes], confirmadoPor: [...e.confirmadoPor] }));
  const novos: Evento[] = [];

  for (const c of comunicados) {
    if (saida.some((e) => e.id === c.id)) continue;
    const texto = normalizar(`${c.titulo} ${c.resumo}`);
    const candidatos = saida.filter((e) => {
      if (e.tipo !== 'agenda' || e.removidoEm || e.data !== c.data || !e.local) return false;
      const chave = chaveLocal(e.local);
      return chave.length >= 4 && texto.includes(chave);
    });

    if (candidatos.length === 1) {
      const alvo = candidatos[0];
      if (!alvo.confirmadoPor.includes(c.id)) alvo.confirmadoPor.push(c.id);
      if (!alvo.fontes.some((f) => f.url === c.url)) alvo.fontes.push(fonteDe(c));
    } else if (citaPresidente(`${c.titulo} ${c.resumo}`, mandato)) {
      novos.push(eventoDe(c));
    }
  }
  return [...saida, ...novos];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/pipeline/link.test.ts && npm run typecheck`
Expected: PASS (10 testes).

Nota de idempotência: o teste "é idempotente" depende de o comunicado já estar em `confirmadoPor` e a fonte já estar em `fontes` — por isso o `if` antes do `push` e a checagem `saida.some((e) => e.id === c.id)` só para itens próprios.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ligação conservadora entre comunicados do Planalto e a agenda"
```

---

### Task 9: Armazenamento, orquestrador `atualizar`/`retroagir` e CLI

**Files:**
- Create: `src/pipeline/store.ts`, `src/pipeline/run.ts`, `src/pipeline/cli.ts`
- Create: `tests/helpers.ts`
- Test: `tests/pipeline/store.test.ts`, `tests/pipeline/run.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1–8.
- Produces (`store.ts`):
  `lerEventos(dir: string): Promise<Evento[]>` · `gravarEventos(dir: string, eventos: Evento[]): Promise<number>` (valida tudo antes de gravar; devolve nº de arquivos alterados, incluindo `meses.json`)
  `lerNoticias(dir): Promise<Noticia[]>` · `gravarNoticias(dir, novas: Noticia[], hoje: string, retencaoDias?: number): Promise<boolean>`
  `lerEstado(dir): Promise<EstadoFontes>` · `gravarEstado(dir, estado: EstadoFontes): Promise<boolean>`
- Produces (`run.ts`):
  `interface Deps { buscar: (url: string, accept: string) => Promise<Resposta>; agora: () => Date; dataDir: string; mandatos: Mandato[] }`
  `interface ResumoAtualizacao { arquivosEscritos: number; falhasPersistentes: string[] }`
  `atualizar(deps: Deps): Promise<ResumoAtualizacao>` · `retroagir(deps: Deps, de: string, ate: string, aoProgredir?: (dia: string) => void): Promise<string[]>` (devolve os dias que falharam)

- [ ] **Step 1: Escrever helpers de teste e os testes de `store`**

`tests/helpers.ts`:

```ts
export const TITULO_AGENDA = '<title>Agenda do Presidente da República — Planalto</title>';
export const PAGINA_404 = `<html><head>${TITULO_AGENDA}</head><body></body></html>`;

export function htmlAgenda(itens: { hora: string; titulo: string; local?: string }[]): string {
  const corpo = itens
    .map((i) => `<div class="item-compromisso"><span class="compromisso-inicio">${i.hora}</span><span class="compromisso-titulo">${i.titulo}</span>${i.local ? `<span class="compromisso-local">${i.local}</span>` : ''}</div>`)
    .join('');
  return `<html><head>${TITULO_AGENDA}</head><body><div class="list-compromissos">${corpo}</div></body></html>`;
}

export function htmlDou(itens: object[]): string {
  return `<html><body><script id="params" type="application/json">${JSON.stringify({ jsonArray: itens })}</script></body></html>`;
}

export const DECRETO_DOU = {
  title: 'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026',
  urlTitle: 'decreto-n-13.132-de-6-de-outubro-de-2026-736937325',
  artType: 'Decreto numerado', hierarchyStr: 'Atos do Poder Executivo',
  content: 'DECRETO Nº 13.132, DE 6 DE OUTUBRO DE 2026 Autoriza algo. O PRESIDENTE DA REPÚBLICA, no uso',
};

export function rdfPlanalto(itens: { slug: string; titulo: string; data: string }[]): string {
  const xs = itens.map((i) => `<item><title>${i.titulo}</title><link>https://www.gov.br/planalto/n/${i.slug}</link><description></description><dc:date>${i.data}</dc:date></item>`).join('');
  return `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">${xs}</rdf:RDF>`;
}

export function rssVazio(): string {
  return '<rss version="2.0"><channel></channel></rss>';
}

export function rssGoogle(): string {
  return `<rss version="2.0"><channel><item><title>Notícia - BBC</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Mon, 10 Mar 2025 14:00:00 GMT</pubDate><source url="https://www.bbc.com">BBC</source></item></channel></rss>`;
}
```

`tests/pipeline/store.test.ts`:

```ts
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gravarEventos, gravarEstado, gravarNoticias, lerEventos, lerEstado, lerNoticias } from '../../src/pipeline/store';
import type { Evento, Noticia } from '../../src/shared/schema';

const T = '2026-10-08T12:00:00.000Z';
const ev = (id: string, data: string, hora?: string): Evento => ({
  id, tipo: 'agenda', data, hora, titulo: id, status: 'agendado',
  fontes: [{ nome: 'n', rotulo: 'r', url: 'https://x.test/a', coletadoEm: T }], confirmadoPor: [], historico: [],
});
const dir = () => mkdtemp(join(tmpdir(), 'rp-'));

describe('eventos', () => {
  it('grava um arquivo por mês, ordenado, mais meses.json em ordem decrescente', async () => {
    const d = await dir();
    await gravarEventos(d, [ev('b', '2026-10-08', '10:00'), ev('a', '2026-10-08', '09:00'), ev('c', '2026-09-30')]);
    expect((await readdir(join(d, 'eventos'))).sort()).toEqual(['2026-09.json', '2026-10.json']);
    expect(JSON.parse(await readFile(join(d, 'meses.json'), 'utf8'))).toEqual(['2026-10', '2026-09']);
    const out = JSON.parse(await readFile(join(d, 'eventos', '2026-10.json'), 'utf8')) as Evento[];
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
  });
  it('ida e volta preserva os eventos', async () => {
    const d = await dir();
    const lista = [ev('a', '2026-10-08', '09:00')];
    await gravarEventos(d, lista);
    expect(await lerEventos(d)).toEqual(lista);
  });
  it('segunda gravação idêntica não altera nenhum arquivo', async () => {
    const d = await dir();
    const lista = [ev('a', '2026-10-08', '09:00')];
    expect(await gravarEventos(d, lista)).toBeGreaterThan(0);
    expect(await gravarEventos(d, lista)).toBe(0);
  });
  it('recusa dados inválidos e não grava nada', async () => {
    const d = await dir();
    const ruim = { ...ev('a', '2026-10-08'), fontes: [] };
    await expect(gravarEventos(d, [ruim as Evento])).rejects.toThrow();
    expect(await lerEventos(d)).toEqual([]);
  });
  it('lerEventos devolve [] quando a pasta não existe', async () => {
    expect(await lerEventos(join(await dir(), 'nada'))).toEqual([]);
  });
});

describe('notícias', () => {
  const n = (id: string, data: string): Noticia => ({
    id, titulo: id, veiculo: 'BBC', data, url: 'https://x.test/n', origem: 'google-news',
  });
  it('mescla por id, descarta as mais velhas que 14 dias e ordena por data desc', async () => {
    const d = await dir();
    await gravarNoticias(d, [n('a', '2026-10-07T10:00:00.000Z'), n('velha', '2026-09-01T10:00:00.000Z')], '2026-10-08');
    await gravarNoticias(d, [n('b', '2026-10-08T09:00:00.000Z'), n('a', '2026-10-07T10:00:00.000Z')], '2026-10-08');
    expect((await lerNoticias(d)).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('devolve false quando nada mudou', async () => {
    const d = await dir();
    await gravarNoticias(d, [n('a', '2026-10-07T10:00:00.000Z')], '2026-10-08');
    expect(await gravarNoticias(d, [n('a', '2026-10-07T10:00:00.000Z')], '2026-10-08')).toBe(false);
  });
});

describe('estado', () => {
  it('ida e volta, e padrão vazio quando não existe', async () => {
    const d = await dir();
    expect(await lerEstado(d)).toEqual({ fontes: {} });
    const estado = { fontes: { agenda: { ok: true, desde: T } }, ultimaNovidadeEm: T };
    expect(await gravarEstado(d, estado)).toBe(true);
    expect(await gravarEstado(d, estado)).toBe(false);
    expect(await lerEstado(d)).toEqual(estado);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pipeline/store.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `store.ts`**

`src/pipeline/store.ts`:

```ts
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  EstadoFontesSchema, EventoSchema, NoticiaSchema,
  type EstadoFontes, type Evento, type Noticia,
} from '../shared/schema';
import { somarDias } from '../shared/text';

const json = (x: unknown) => `${JSON.stringify(x, null, 2)}\n`;

async function lerSeExiste(arquivo: string): Promise<string | null> {
  try {
    return await readFile(arquivo, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

async function gravarSeMudou(arquivo: string, conteudo: string): Promise<boolean> {
  if ((await lerSeExiste(arquivo)) === conteudo) return false;
  await mkdir(dirname(arquivo), { recursive: true });
  await writeFile(arquivo, conteudo, 'utf8');
  return true;
}

export async function lerEventos(dir: string): Promise<Evento[]> {
  let arquivos: string[];
  try {
    arquivos = await readdir(join(dir, 'eventos'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const saida: Evento[] = [];
  for (const nome of arquivos.filter((a) => /^\d{4}-\d{2}\.json$/.test(a)).sort()) {
    const bruto = await readFile(join(dir, 'eventos', nome), 'utf8');
    saida.push(...EventoSchema.array().parse(JSON.parse(bruto)));
  }
  return saida;
}

export async function gravarEventos(dir: string, eventos: Evento[]): Promise<number> {
  const validos = EventoSchema.array().parse(eventos); // lança antes de gravar qualquer coisa
  const porMes = new Map<string, Evento[]>();
  for (const e of validos) {
    const mes = e.data.slice(0, 7);
    porMes.set(mes, [...(porMes.get(mes) ?? []), e]);
  }
  let alterados = 0;
  for (const [mes, lista] of porMes) {
    lista.sort((a, b) =>
      a.data.localeCompare(b.data) || (a.hora ?? '').localeCompare(b.hora ?? '') || a.id.localeCompare(b.id));
    if (await gravarSeMudou(join(dir, 'eventos', `${mes}.json`), json(lista))) alterados++;
  }
  const meses = [...porMes.keys()].sort().reverse();
  if (await gravarSeMudou(join(dir, 'meses.json'), json(meses))) alterados++;
  return alterados;
}

export async function lerNoticias(dir: string): Promise<Noticia[]> {
  const bruto = await lerSeExiste(join(dir, 'noticias.json'));
  return bruto ? NoticiaSchema.array().parse(JSON.parse(bruto)) : [];
}

export async function gravarNoticias(
  dir: string, novas: Noticia[], hoje: string, retencaoDias = 14,
): Promise<boolean> {
  const corte = somarDias(hoje, -retencaoDias);
  const mapa = new Map((await lerNoticias(dir)).map((n) => [n.id, n]));
  for (const n of novas) if (!mapa.has(n.id)) mapa.set(n.id, n);
  const lista = [...mapa.values()]
    .filter((n) => n.data.slice(0, 10) >= corte)
    .sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id));
  return gravarSeMudou(join(dir, 'noticias.json'), json(NoticiaSchema.array().parse(lista)));
}

export async function lerEstado(dir: string): Promise<EstadoFontes> {
  const bruto = await lerSeExiste(join(dir, 'status.json'));
  return bruto ? EstadoFontesSchema.parse(JSON.parse(bruto)) : { fontes: {} };
}

export async function gravarEstado(dir: string, estado: EstadoFontes): Promise<boolean> {
  return gravarSeMudou(join(dir, 'status.json'), json(EstadoFontesSchema.parse(estado)));
}
```

- [ ] **Step 4: Rodar `store` e ver passar**

Run: `npx vitest run tests/pipeline/store.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Escrever os testes do orquestrador**

`tests/pipeline/run.test.ts`:

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { URL_AGENCIA_BRASIL } from '../../src/collectors/noticias';
import { URL_FEED_PLANALTO } from '../../src/collectors/planalto';
import { lerEstado, lerEventos, lerNoticias } from '../../src/pipeline/store';
import { atualizar, retroagir, type Deps } from '../../src/pipeline/run';
import type { Mandato } from '../../src/shared/schema';
import {
  DECRETO_DOU, PAGINA_404, htmlAgenda, htmlDou, rdfPlanalto, rssGoogle, rssVazio,
} from '../helpers';

const MANDATO: Mandato = {
  presidente: 'Luiz Inácio Lula da Silva', nomes: ['Lula'], inicio: '2023-01-01', fim: null,
  agendaBase: 'https://gov.test/agenda-do-presidente-da-republica',
};
const HOJE = '2025-03-10';

const cfg = {
  agenda: {} as Record<string, string>, // data -> html (200). Ausente => 404.
  falhaAgenda: false,
  comunicados: rdfPlanalto([]),
  textoPlanalto: 404,
};

async function buscar(url: string) {
  if (url.includes('/agenda-do-presidente-da-republica/')) {
    if (cfg.falhaAgenda) throw new Error('rede caiu');
    const corpo = cfg.agenda[url.slice(-10)];
    return corpo ? { status: 200, corpo, url } : { status: 404, corpo: PAGINA_404, url };
  }
  if (url.includes('leiturajornal')) {
    const comDecreto = url.includes('data=10-03-2025');
    return { status: 200, corpo: htmlDou(comDecreto ? [DECRETO_DOU] : []), url };
  }
  if (url === URL_FEED_PLANALTO) return { status: 200, corpo: cfg.comunicados, url };
  if (url.startsWith('https://news.google.com')) return { status: 200, corpo: rssGoogle(), url };
  if (url === URL_AGENCIA_BRASIL) return { status: 200, corpo: rssVazio(), url };
  if (url.includes('planalto.gov.br/ccivil_03')) return { status: cfg.textoPlanalto, corpo: '', url };
  throw new Error(`URL inesperada no teste: ${url}`);
}

async function novoDeps(): Promise<Deps> {
  return {
    buscar,
    agora: () => new Date('2025-03-10T15:00:00Z'),
    dataDir: await mkdtemp(join(tmpdir(), 'rp-run-')),
    mandatos: [MANDATO],
  };
}

beforeEach(() => {
  cfg.agenda = {
    [HOJE]: htmlAgenda([
      { hora: '09h00', titulo: 'Reunião A', local: 'Palácio do Planalto' },
      { hora: '15h00', titulo: 'Visita ao hospital', local: 'Barretos - SP' },
    ]),
  };
  cfg.falhaAgenda = false;
  cfg.comunicados = rdfPlanalto([]);
  cfg.textoPlanalto = 404;
});

describe('atualizar', () => {
  it('primeira execução grava agenda, ato, notícias e estado; a segunda não altera nada', async () => {
    const deps = await novoDeps();
    const r1 = await atualizar(deps);
    expect(r1.arquivosEscritos).toBeGreaterThan(0);

    const eventos = await lerEventos(deps.dataDir);
    expect(eventos.filter((e) => e.tipo === 'agenda')).toHaveLength(2);
    expect(eventos.filter((e) => e.tipo === 'ato')).toHaveLength(1);
    expect((await lerNoticias(deps.dataDir)).length).toBe(1);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(true);

    const r2 = await atualizar(deps);
    expect(r2.arquivosEscritos).toBe(0);
  });

  it('adiciona o texto do ato no Planalto só quando a URL responde 200', async () => {
    cfg.textoPlanalto = 200;
    const deps = await novoDeps();
    await atualizar(deps);
    const ato = (await lerEventos(deps.dataDir)).find((e) => e.tipo === 'ato')!;
    expect(ato.fontes.map((f) => f.nome)).toEqual(['dou', 'texto-planalto']);
    expect(ato.fontes[1].url).toContain('/decreto/D13132.htm');
  });

  it('comunicado que casa com o compromisso (data + local) o marca como realizado', async () => {
    cfg.comunicados = rdfPlanalto([
      { slug: 'visita-barretos', titulo: 'Presidente visita o hospital, em Barretos (SP)', data: '2025-03-10T18:00:00-03:00' },
    ]);
    const deps = await novoDeps();
    await atualizar(deps);
    const eventos = await lerEventos(deps.dataDir);
    const visita = eventos.find((e) => e.titulo === 'Visita ao hospital')!;
    expect(visita.status).toBe('realizado');
    expect(visita.fontes).toHaveLength(2);
    expect(eventos.some((e) => e.tipo === 'comunicado')).toBe(false);
  });

  it('fonte fora do ar: mantém os dados, registra ok:false, e só vira falha persistente na 2ª seguida', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    const antes = await lerEventos(deps.dataDir);

    cfg.falhaAgenda = true;
    const r2 = await atualizar(deps);
    expect(r2.falhasPersistentes).toEqual([]);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(false);
    expect(await lerEventos(deps.dataDir)).toEqual(antes);

    const r3 = await atualizar(deps);
    expect(r3.falhasPersistentes).toEqual(['agenda']);
    expect(r3.arquivosEscritos).toBe(0); // estado idêntico não gera commit

    cfg.falhaAgenda = false;
    await atualizar(deps);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(true);
  });

  it('dia com 404 nunca remove compromissos já gravados', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    cfg.agenda = {}; // agora hoje responde 404
    await atualizar(deps);
    const agenda = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'agenda');
    expect(agenda).toHaveLength(2);
    expect(agenda.every((e) => !e.removidoEm)).toBe(true);
  });

  it('dia com 200 em que um compromisso sumiu o marca como removido', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    cfg.agenda = { [HOJE]: htmlAgenda([{ hora: '09h00', titulo: 'Reunião A', local: 'Palácio do Planalto' }]) };
    await atualizar(deps);
    const removido = (await lerEventos(deps.dataDir)).find((e) => e.titulo === 'Visita ao hospital')!;
    expect(removido.status).toBe('removido');
  });

  it('layout inesperado da agenda é falha, não "dia vazio": nada é removido', async () => {
    const deps = await novoDeps();
    await atualizar(deps);
    cfg.agenda = { [HOJE]: '<html><head><title>Agenda do Presidente da República — Planalto</title></head><body>novo layout</body></html>' };
    await atualizar(deps);
    expect((await lerEstado(deps.dataDir)).fontes.agenda.ok).toBe(false);
    const agenda = (await lerEventos(deps.dataDir)).filter((e) => e.tipo === 'agenda');
    expect(agenda.every((e) => !e.removidoEm)).toBe(true);
  });
});

describe('retroagir', () => {
  it('percorre o intervalo, grava e devolve os dias com falha', async () => {
    const deps = await novoDeps();
    const progresso: string[] = [];
    const falhas = await retroagir(deps, '2025-03-09', '2025-03-10', (d) => progresso.push(d));
    expect(falhas).toEqual([]);
    expect(progresso).toEqual(['2025-03-10']);
    const eventos = await lerEventos(deps.dataDir);
    expect(eventos.filter((e) => e.tipo === 'agenda')).toHaveLength(2);
    expect(eventos.filter((e) => e.tipo === 'ato')).toHaveLength(1);
  });
  it('falha de um dia é reportada e não interrompe os demais', async () => {
    cfg.falhaAgenda = true;
    const deps = await novoDeps();
    const falhas = await retroagir(deps, '2025-03-09', '2025-03-10');
    expect(falhas).toEqual(['2025-03-09', '2025-03-10']);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run tests/pipeline/run.test.ts`
Expected: FAIL — `Cannot find module '../../src/pipeline/run'`.

- [ ] **Step 7: Implementar `run.ts`**

`src/pipeline/run.ts`:

```ts
import { LayoutError, parseAgenda, urlAgendaDia } from '../collectors/agenda';
import { parseDou, urlDouEdicao, urlTextoPlanalto } from '../collectors/dou';
import { URL_AGENCIA_BRASIL, filtrarRelevantes, parseNoticias, urlBuscaGoogleNews } from '../collectors/noticias';
import { URL_FEED_PLANALTO, parsePlanaltoFeed, type Comunicado } from '../collectors/planalto';
import { mandatoVigente } from '../config';
import { ACCEPT_HTML, ACCEPT_XML, type Resposta } from '../shared/http';
import type { EstadoFontes, Evento, Mandato, Noticia } from '../shared/schema';
import { dataSaoPaulo, somarDias } from '../shared/text';
import { ligarComunicados } from './link';
import { aplicarStatus, mesclar } from './merge';
import {
  gravarEstado, gravarEventos, gravarNoticias, lerEstado, lerEventos,
} from './store';

export interface Deps {
  buscar: (url: string, accept: string) => Promise<Resposta>;
  agora: () => Date;
  dataDir: string;
  mandatos: Mandato[];
}

export interface ResumoAtualizacao {
  arquivosEscritos: number;
  falhasPersistentes: string[];
}

interface Coleta {
  eventos: Evento[];
  diasCompletos: Set<string>;
  erros: string[];
}

const janela = (hoje: string, de: number, ate: number) =>
  Array.from({ length: ate - de + 1 }, (_, i) => somarDias(hoje, de + i));

async function coletarAgenda(deps: Deps, mandato: Mandato, dias: string[], coletadoEm: string): Promise<Coleta> {
  const c: Coleta = { eventos: [], diasCompletos: new Set(), erros: [] };
  for (const d of dias) {
    const url = urlAgendaDia(mandato.agendaBase, d);
    try {
      const r = await deps.buscar(url, ACCEPT_HTML);
      const p = parseAgenda(r.corpo, r.status, d, coletadoEm, url);
      c.eventos.push(...p.eventos);
      if (p.diaPublicado) c.diasCompletos.add(d);
    } catch (e) {
      c.erros.push(`${d}: ${e instanceof LayoutError ? e.message : String(e)}`);
    }
  }
  return c;
}

async function coletarDou(deps: Deps, dias: string[], coletadoEm: string): Promise<Coleta> {
  const c: Coleta = { eventos: [], diasCompletos: new Set(), erros: [] };
  for (const d of dias) {
    try {
      const r = await deps.buscar(urlDouEdicao(d), ACCEPT_HTML);
      if (r.status === 404) continue; // sem edição nesse dia
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      c.eventos.push(...parseDou(r.corpo, d, coletadoEm));
    } catch (e) {
      c.erros.push(`${d}: ${String(e)}`);
    }
  }
  return c;
}

async function adicionarTextoPlanalto(deps: Deps, ev: Evento, coletadoEm: string): Promise<void> {
  const url = urlTextoPlanalto(ev.titulo, ev.datasAto?.assinatura);
  if (!url) return;
  try {
    const r = await deps.buscar(url, ACCEPT_HTML);
    if (r.status === 200) {
      ev.fontes.push({ nome: 'texto-planalto', rotulo: 'Planalto (texto do ato)', url, coletadoEm });
    }
  } catch {
    // sem o texto no Planalto, fica só o link do DOU
  }
}

export async function atualizar(deps: Deps): Promise<ResumoAtualizacao> {
  const agora = deps.agora();
  const agoraIso = agora.toISOString();
  const hoje = dataSaoPaulo(agora);
  const mandato = mandatoVigente(deps.mandatos, hoje);
  const existentes = await lerEventos(deps.dataDir);
  const anterior = await lerEstado(deps.dataDir);
  const estado: EstadoFontes = { fontes: {}, ultimaNovidadeEm: anterior.ultimaNovidadeEm };

  const marcar = (nome: string, erro?: string) => {
    const ant = anterior.fontes[nome];
    const ok = erro === undefined;
    const mensagem = erro?.slice(0, 300);
    estado.fontes[nome] = ant && ant.ok === ok && (ok || ant.mensagem === mensagem)
      ? ant
      : { ok, desde: agoraIso, ...(ok ? {} : { mensagem }) };
  };

  const agenda = await coletarAgenda(deps, mandato, janela(hoje, -3, 7), agoraIso);
  marcar('agenda', agenda.erros.length ? agenda.erros.join('; ') : undefined);

  const dou = await coletarDou(deps, [somarDias(hoje, -1), hoje], agoraIso);
  marcar('dou', dou.erros.length ? dou.erros.join('; ') : undefined);

  let comunicados: Comunicado[] = [];
  try {
    const r = await deps.buscar(URL_FEED_PLANALTO, ACCEPT_XML);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    comunicados = parsePlanaltoFeed(r.corpo, agoraIso);
    marcar('planalto');
  } catch (e) {
    marcar('planalto', String(e));
  }

  const idsExistentes = new Set(existentes.map((e) => e.id));
  for (const ato of dou.eventos.filter((e) => !idsExistentes.has(e.id))) {
    await adicionarTextoPlanalto(deps, ato, agoraIso);
  }

  let eventos = mesclar(existentes, [...agenda.eventos, ...dou.eventos], agenda.diasCompletos, agoraIso);
  eventos = ligarComunicados(eventos, comunicados, mandato);
  eventos = aplicarStatus(eventos, hoje);
  let escritos = await gravarEventos(deps.dataDir, eventos);

  const noticias: Noticia[] = [];
  const fontesNoticias: [string, string, Noticia['origem']][] = [
    ['noticias-google', urlBuscaGoogleNews(mandato.nomes[0]), 'google-news'],
    ['noticias-agencia-brasil', URL_AGENCIA_BRASIL, 'agencia-brasil'],
  ];
  for (const [nome, url, origem] of fontesNoticias) {
    try {
      const r = await deps.buscar(url, ACCEPT_XML);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      noticias.push(...filtrarRelevantes(parseNoticias(r.corpo, origem), mandato));
      marcar(nome);
    } catch (e) {
      marcar(nome, String(e));
    }
  }
  if (await gravarNoticias(deps.dataDir, noticias, hoje)) escritos++;

  if (escritos > 0) estado.ultimaNovidadeEm = agoraIso;
  if (await gravarEstado(deps.dataDir, estado)) escritos++;

  const falhasPersistentes = Object.entries(estado.fontes)
    .filter(([nome, s]) => !s.ok && anterior.fontes[nome]?.ok === false)
    .map(([nome]) => nome);
  return { arquivosEscritos: escritos, falhasPersistentes };
}

export async function retroagir(
  deps: Deps, de: string, ate: string, aoProgredir?: (dia: string) => void,
): Promise<string[]> {
  const agoraIso = deps.agora().toISOString();
  let eventos = await lerEventos(deps.dataDir);
  const falhas: string[] = [];
  const gravar = async (dia: string) => {
    await gravarEventos(deps.dataDir, aplicarStatus(eventos, dataSaoPaulo(deps.agora())));
    aoProgredir?.(dia);
  };

  let contador = 0;
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    let mandato: Mandato;
    try {
      mandato = mandatoVigente(deps.mandatos, d);
    } catch {
      continue; // dia fora de qualquer mandato configurado
    }
    const agenda = await coletarAgenda(deps, mandato, [d], agoraIso);
    const dou = await coletarDou(deps, [d], agoraIso);
    if (agenda.erros.length || dou.erros.length) falhas.push(d);

    const idsExistentes = new Set(eventos.map((e) => e.id));
    for (const ato of dou.eventos.filter((e) => !idsExistentes.has(e.id))) {
      await adicionarTextoPlanalto(deps, ato, agoraIso);
    }
    eventos = mesclar(eventos, [...agenda.eventos, ...dou.eventos], agenda.diasCompletos, agoraIso);
    if (++contador % 15 === 0) await gravar(d);
  }
  await gravar(ate);
  return falhas;
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run tests/pipeline && npm run typecheck`
Expected: PASS. Se "primeira execução ... segunda não altera nada" falhar com `arquivosEscritos > 0` na segunda, inspecione qual arquivo mudou (diferença entre as duas execuções no JSON gravado): a causa mais provável é um campo regenerado a cada execução (por exemplo `coletadoEm`) — corrija em `mesclar`/`ligarComunicados`, não no teste.

- [ ] **Step 9: Implementar o CLI**

`src/pipeline/cli.ts`:

```ts
import { join } from 'node:path';
import { carregarMandatos } from '../config';
import { buscarTexto } from '../shared/http';
import { dataSaoPaulo } from '../shared/text';
import { atualizar, retroagir, type Deps } from './run';

async function main(): Promise<void> {
  const [comando, a, b] = process.argv.slice(2);
  const deps: Deps = {
    buscar: (url, accept) => buscarTexto(url, accept, { pausaMs: 1000, contato: process.env.CONTATO_URL }),
    agora: () => new Date(),
    dataDir: join(process.cwd(), 'data'),
    mandatos: await carregarMandatos(),
  };

  if (comando === 'update') {
    const r = await atualizar(deps);
    console.log(`Atualização concluída: ${r.arquivosEscritos} arquivo(s) alterado(s).`);
    if (r.falhasPersistentes.length > 0) {
      console.error(`Fontes com falha em execuções seguidas: ${r.falhasPersistentes.join(', ')}`);
      process.exit(1);
    }
  } else if (comando === 'backfill') {
    const de = a ?? '2023-01-01';
    const ate = b ?? dataSaoPaulo(new Date());
    console.log(`Carga histórica de ${de} até ${ate} (1 requisição por segundo; pode demorar).`);
    const falhas = await retroagir(deps, de, ate, (d) => console.log(`  gravado até ${d}`));
    if (falhas.length > 0) console.error(`Dias com falha (rode de novo para eles): ${falhas.join(', ')}`);
  } else {
    console.error('Uso: cli.ts update | backfill [AAAA-MM-DD de] [AAAA-MM-DD até]');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Run: `npm run typecheck && npx vitest run`
Expected: PASS em tudo.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: armazenamento, orquestrador de atualização/carga histórica e CLI"
```

---

### Task 10: Lógica do site — parâmetros, filtros e carregamento de dados

**Files:**
- Create: `site/src/params.ts`, `site/src/filtrar.ts`, `site/src/dados.ts`
- Test: `tests/site/params.test.ts`, `tests/site/filtrar.test.ts`

**Interfaces:**
- Consumes: `Evento`, `Noticia`, `EstadoFontes`, `TipoEvento`, `Status` e schemas (Task 1).
- Produces (`params.ts`):
  `interface Filtros { aba: 'linha' | 'noticias'; tipo?: TipoEvento; status?: Status; de?: string; ate?: string }`
  `lerFiltros(search: string): Filtros` (valida tudo; valor inválido é ignorado)
- Produces (`filtrar.ts`):
  `filtrarEventos(evs: Evento[], f: Filtros): Evento[]` · `agruparPorDia(evs: Evento[]): { data: string; itens: Evento[] }[]` (dias do mais novo ao mais antigo; itens por hora crescente) · `ultimoRegistro(evs: Evento[], hoje: string): Evento | undefined` · `proximos(evs: Evento[]): Evento[]`
- Produces (`dados.ts`): `interface Dados { eventos: Evento[]; noticias: Noticia[]; estado: EstadoFontes }` · `carregarDados(f: Filtros): Promise<Dados>`

- [ ] **Step 1: Escrever os testes que falham**

`tests/site/params.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerFiltros } from '../../site/src/params';

describe('lerFiltros', () => {
  it('padrão: aba linha e nenhum filtro', () => {
    expect(lerFiltros('')).toEqual({ aba: 'linha' });
  });
  it('lê valores válidos', () => {
    expect(lerFiltros('?aba=noticias&tipo=ato&status=publicado&de=2026-09-01&ate=2026-09-30'))
      .toEqual({ aba: 'noticias', tipo: 'ato', status: 'publicado', de: '2026-09-01', ate: '2026-09-30' });
  });
  it('campos vazios do formulário viram "sem filtro"', () => {
    expect(lerFiltros('?aba=linha&de=&ate=&tipo=&status=')).toEqual({ aba: 'linha' });
  });
  it('ignora valores inválidos ou maliciosos', () => {
    expect(lerFiltros('?aba=<script>&tipo=hack&status=%27%3B&de=2026-13-45&ate=ontem'))
      .toEqual({ aba: 'linha' });
  });
  it('recusa data impossível mesmo com formato correto', () => {
    expect(lerFiltros('?de=2026-02-30')).toEqual({ aba: 'linha' });
  });
});
```

`tests/site/filtrar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { agruparPorDia, filtrarEventos, proximos, ultimoRegistro } from '../../site/src/filtrar';
import type { Evento } from '../../src/shared/schema';

const T = '2026-10-08T12:00:00.000Z';
const ev = (id: string, data: string, sobre: Partial<Evento> = {}): Evento => ({
  id, tipo: 'agenda', data, titulo: id, status: 'consta_na_agenda',
  fontes: [{ nome: 'n', rotulo: 'r', url: 'https://x.test/a', coletadoEm: T }],
  confirmadoPor: [], historico: [], ...sobre,
});

const LISTA = [
  ev('a', '2026-10-06', { hora: '10:00' }),
  ev('b', '2026-10-07', { tipo: 'ato', status: 'publicado' }),
  ev('c', '2026-10-07', { hora: '09:00', status: 'realizado' }),
  ev('d', '2026-10-09', { hora: '10:00', status: 'agendado' }),
  ev('e', '2026-10-08', { hora: '15:00', status: 'agendado' }),
];

describe('filtrarEventos', () => {
  it('sem filtros devolve tudo', () => {
    expect(filtrarEventos(LISTA, { aba: 'linha' })).toHaveLength(5);
  });
  it('filtra por tipo, status e intervalo de datas (inclusivo)', () => {
    expect(filtrarEventos(LISTA, { aba: 'linha', tipo: 'ato' }).map((e) => e.id)).toEqual(['b']);
    expect(filtrarEventos(LISTA, { aba: 'linha', status: 'agendado' }).map((e) => e.id)).toEqual(['d', 'e']);
    expect(filtrarEventos(LISTA, { aba: 'linha', de: '2026-10-07', ate: '2026-10-08' }).map((e) => e.id).sort())
      .toEqual(['b', 'c', 'e']);
  });
});

describe('agruparPorDia', () => {
  it('ordena dias do mais novo ao mais antigo e itens por hora', () => {
    const g = agruparPorDia(LISTA.filter((e) => e.status !== 'agendado'));
    expect(g.map((x) => x.data)).toEqual(['2026-10-07', '2026-10-06']);
    expect(g[0].itens.map((e) => e.id)).toEqual(['b', 'c']); // sem hora vem antes
  });
});

describe('ultimoRegistro', () => {
  it('é o realizado/publicado mais recente até hoje (mesmo dia: o de hora maior)', () => {
    expect(ultimoRegistro(LISTA, '2026-10-08')?.id).toBe('c'); // 07/10 09:00 vence o ato sem hora
  });
  it('ignora itens futuros e quem só "consta na agenda"', () => {
    expect(ultimoRegistro([ev('x', '2026-10-06')], '2026-10-08')).toBeUndefined();
    expect(ultimoRegistro([ev('f', '2026-10-20', { status: 'realizado' })], '2026-10-08')).toBeUndefined();
  });
});

describe('proximos', () => {
  it('só agenda "agendado", em ordem crescente de data e hora', () => {
    expect(proximos(LISTA).map((e) => e.id)).toEqual(['e', 'd']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/site`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Implementar**

`site/src/params.ts`:

```ts
import { StatusSchema, TipoEventoSchema, type Status, type TipoEvento } from '../../src/shared/schema';

export interface Filtros {
  aba: 'linha' | 'noticias';
  tipo?: TipoEvento;
  status?: Status;
  de?: string;
  ate?: string;
}

function dataValida(s: string | null): string | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : undefined;
}

export function lerFiltros(search: string): Filtros {
  const p = new URLSearchParams(search);
  const tipo = TipoEventoSchema.safeParse(p.get('tipo'));
  const status = StatusSchema.safeParse(p.get('status'));
  const f: Filtros = { aba: p.get('aba') === 'noticias' ? 'noticias' : 'linha' };
  if (tipo.success) f.tipo = tipo.data;
  if (status.success) f.status = status.data;
  const de = dataValida(p.get('de'));
  const ate = dataValida(p.get('ate'));
  if (de) f.de = de;
  if (ate) f.ate = ate;
  return f;
}
```

`site/src/filtrar.ts`:

```ts
import type { Evento } from '../../src/shared/schema';
import type { Filtros } from './params';

export function filtrarEventos(evs: Evento[], f: Filtros): Evento[] {
  return evs.filter((e) =>
    (!f.tipo || e.tipo === f.tipo) &&
    (!f.status || e.status === f.status) &&
    (!f.de || e.data >= f.de) &&
    (!f.ate || e.data <= f.ate));
}

const chave = (e: Evento) => `${e.data} ${e.hora ?? '00:00'}`;

export function agruparPorDia(evs: Evento[]): { data: string; itens: Evento[] }[] {
  const mapa = new Map<string, Evento[]>();
  for (const e of evs) mapa.set(e.data, [...(mapa.get(e.data) ?? []), e]);
  return [...mapa.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([data, itens]) => ({
      data,
      itens: [...itens].sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? '') || a.id.localeCompare(b.id)),
    }));
}

export function ultimoRegistro(evs: Evento[], hoje: string): Evento | undefined {
  return evs
    .filter((e) => (e.status === 'realizado' || e.status === 'publicado') && e.data <= hoje)
    .sort((a, b) => chave(b).localeCompare(chave(a)))[0];
}

export function proximos(evs: Evento[]): Evento[] {
  return evs
    .filter((e) => e.tipo === 'agenda' && e.status === 'agendado')
    .sort((a, b) => chave(a).localeCompare(chave(b)));
}
```

`site/src/dados.ts`:

```ts
import { z } from 'zod';
import {
  EstadoFontesSchema, EventoSchema, NoticiaSchema,
  type EstadoFontes, type Evento, type Noticia,
} from '../../src/shared/schema';
import type { Filtros } from './params';

export interface Dados {
  eventos: Evento[];
  noticias: Noticia[];
  estado: EstadoFontes;
}

async function lerJson(caminho: string): Promise<unknown> {
  const r = await fetch(caminho, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
  return r.json();
}

// Valida item a item: um registro inválido não derruba o mês inteiro.
function validos<T>(schema: z.ZodType<T>, bruto: unknown): T[] {
  return Array.isArray(bruto) ? bruto.flatMap((x) => {
    const p = schema.safeParse(x);
    return p.success ? [p.data] : [];
  }) : [];
}

async function tentar<T>(fn: () => Promise<T>, padrao: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return padrao;
  }
}

export async function carregarDados(f: Filtros): Promise<Dados> {
  const meses = await tentar(async () =>
    z.string().regex(/^\d{4}-\d{2}$/).array().parse(await lerJson('data/meses.json')), [] as string[]);
  const escolhidos = f.de || f.ate
    ? meses.filter((m) => m >= (f.de?.slice(0, 7) ?? '0000-00') && m <= (f.ate?.slice(0, 7) ?? '9999-99'))
    : meses.slice(0, 2); // mês atual e o anterior
  const eventos = (await Promise.all(escolhidos.map((m) =>
    tentar(async () => validos(EventoSchema, await lerJson(`data/eventos/${m}.json`)), [] as Evento[])))).flat();
  const noticias = f.aba === 'noticias'
    ? await tentar(async () => validos(NoticiaSchema, await lerJson('data/noticias.json')), [] as Noticia[])
    : [];
  const estado = await tentar(
    async () => EstadoFontesSchema.parse(await lerJson('data/status.json')), { fontes: {} } as EstadoFontes);
  return { eventos, noticias, estado };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/site && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(site): parâmetros de URL, filtros e carregamento de dados"
```

---

### Task 11: Renderização e montagem da página (com teste de XSS e acessibilidade)

**Files:**
- Create: `site/src/render.ts`, `site/src/app.ts`, `site/src/main.ts`, `site/index.html`, `site/style.css`
- Test: `tests/site/render.test.ts`, `tests/site/app.test.ts`

**Interfaces:**
- Consumes: Task 10 (`Filtros`, `filtrar*`, `Dados`), schemas (Task 1), `urlHttpsSegura` (Task 1).
- Produces (`render.ts`): `el(doc, tag, atributos?, ...filhos): HTMLElement` · `ROTULO_STATUS` · `ROTULO_TIPO` · `formatarDataLonga(data: string): string` · `formatarDataCurta(data: string): string` · `renderFontes(doc, fontes: Fonte[]): HTMLElement` · `renderEvento(doc, ev: Evento, nivelTitulo?: number): HTMLElement` · `renderNoticia(doc, n: Noticia): HTMLElement`
- Produces (`app.ts`): `montar(doc: Document, dados: Dados, f: Filtros, hoje: string, agora: Date): void`
- Contrato do `index.html` (ids usados por `montar`): `ultima-novidade`, `aviso-fontes`, `aba-linha`, `aba-noticias`, `painel-linha`, `painel-noticias`, `filtros` (form com `name=de|ate|tipo|status`), `bloco-ultimo`, `ultimo-registro`, `bloco-proximos`, `proximos`, `linha-do-tempo`, `lista-noticias`.

- [ ] **Step 1: Escrever os testes de renderização que falham**

`tests/site/render.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formatarDataCurta, formatarDataLonga, renderEvento, renderFontes, renderNoticia } from '../../site/src/render';
import type { Evento, Noticia } from '../../src/shared/schema';

const T = '2026-10-08T12:00:00.000Z';
const fonte = (nome: string, url: string, rotulo = 'Planalto (governo)') => ({ nome, rotulo, url, coletadoEm: T });
const base: Evento = {
  id: 'agenda:2026-10-08:10:00:1', tipo: 'agenda', data: '2026-10-08', hora: '10:00',
  titulo: 'Reunião', local: 'Palácio do Planalto', status: 'consta_na_agenda',
  fontes: [fonte('agenda-planalto', 'https://www.gov.br/a')], confirmadoPor: [], historico: [],
};

describe('formatação de datas', () => {
  it('formata por extenso e em curto', () => {
    expect(formatarDataLonga('2026-10-08')).toMatch(/quinta-feira, 8 de outubro de 2026/);
    expect(formatarDataCurta('2026-10-08')).toBe('08/10/2026');
  });
});

describe('renderFontes', () => {
  it('uma fonte -> "Fonte única" com link https', () => {
    const e = renderFontes(document, base.fontes);
    expect(e.textContent).toContain('Fonte única');
    const a = e.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://www.gov.br/a');
    expect(a.getAttribute('rel')).toContain('noopener');
  });
  it('duas fontes distintas -> "Confirmado por 2 fontes"', () => {
    const e = renderFontes(document, [...base.fontes, fonte('comunicado-planalto', 'https://www.gov.br/c')]);
    expect(e.textContent).toContain('Confirmado por 2 fontes');
    expect(e.querySelectorAll('a')).toHaveLength(2);
  });
  it('URL insegura nunca vira link', () => {
    const e = renderFontes(document, [fonte('x', 'javascript:alert(1)')]);
    expect(e.querySelector('a')).toBeNull();
  });
});

describe('renderEvento', () => {
  it('mostra hora, tipo, status com ícone aria-hidden, título e local', () => {
    const li = renderEvento(document, base);
    expect(li.querySelector('time')!.getAttribute('datetime')).toBe('2026-10-08T10:00');
    expect(li.textContent).toContain('Consta na agenda');
    expect(li.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(li.querySelector('h4')!.textContent).toBe('Reunião');
    expect(li.textContent).toContain('Palácio do Planalto');
  });
  it('nivelTitulo muda a tag do título', () => {
    expect(renderEvento(document, base, 3).querySelector('h3')).not.toBeNull();
  });
  it('texto malicioso da fonte aparece como texto, sem criar elementos', () => {
    const ruim = { ...base, titulo: '<img src=x onerror=alert(1)><script>alert(2)</script>', local: '<b>x</b>' };
    const li = renderEvento(document, ruim);
    expect(li.querySelector('img')).toBeNull();
    expect(li.querySelector('script')).toBeNull();
    expect(li.querySelector('b')).toBeNull();
    expect(li.querySelector('h4')!.textContent).toBe('<img src=x onerror=alert(1)><script>alert(2)</script>');
  });
  it('ato mostra datas de assinatura e publicação', () => {
    const ato: Evento = { ...base, tipo: 'ato', hora: undefined, status: 'publicado', datasAto: { assinatura: '2026-10-06', publicacao: '2026-10-07' } };
    expect(renderEvento(document, ato).textContent).toContain('Assinado em 06/10/2026 · Publicado em 07/10/2026');
  });
  it('compromisso alterado lista as versões anteriores', () => {
    const alt: Evento = { ...base, status: 'alterado', historico: [{ titulo: 'Título antigo', registradoEm: T }] };
    const li = renderEvento(document, alt);
    expect(li.querySelector('details')!.textContent).toContain('Título antigo');
  });
  it('id do elemento é seguro para âncora', () => {
    expect(renderEvento(document, base).id).toBe('ev-agenda-2026-10-08-10-00-1');
  });
});

describe('renderNoticia', () => {
  const n: Noticia = {
    id: 'google-news:abc', titulo: 'Manchete', veiculo: 'BBC', data: '2026-10-08T11:00:00.000Z',
    url: 'https://news.google.com/x', origem: 'google-news',
  };
  it('mostra título como link, veículo e data', () => {
    const li = renderNoticia(document, n);
    expect(li.querySelector('a')!.getAttribute('href')).toBe('https://news.google.com/x');
    expect(li.textContent).toContain('BBC');
  });
  it('URL insegura vira texto puro', () => {
    expect(renderNoticia(document, { ...n, url: 'javascript:alert(1)' }).querySelector('a')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/site/render.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `render.ts`**

`site/src/render.ts`:

```ts
import type { Evento, Fonte, Noticia, Status, TipoEvento } from '../../src/shared/schema';
import { urlHttpsSegura } from '../../src/shared/text';

type Filho = Node | string | null | undefined | false;

export function el(doc: Document, tag: string, atributos: Record<string, string> = {}, ...filhos: Filho[]): HTMLElement {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, v);
  for (const f of filhos) if (f) e.append(f); // string vira nó de texto, nunca HTML
  return e;
}

export const ROTULO_STATUS: Record<Status, { icone: string; texto: string }> = {
  agendado: { icone: '🕐', texto: 'Agendado' },
  consta_na_agenda: { icone: '📋', texto: 'Consta na agenda' },
  realizado: { icone: '✅', texto: 'Realizado' },
  publicado: { icone: '📜', texto: 'Publicado no Diário Oficial' },
  alterado: { icone: '⚠️', texto: 'Alterado na agenda' },
  removido: { icone: '⚠️', texto: 'Removido da agenda' },
};

export const ROTULO_TIPO: Record<TipoEvento, string> = {
  agenda: 'Agenda',
  ato: 'Ato oficial',
  comunicado: 'Comunicado do Planalto',
};

const TEXTO_LINK: Record<string, string> = {
  'agenda-planalto': 'Agenda do dia',
  'comunicado-planalto': 'Comunicado',
  dou: 'Ato publicado',
  'texto-planalto': 'Texto do ato',
};

export function formatarDataLonga(data: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(`${data}T12:00:00Z`));
}

export function formatarDataCurta(data: string): string {
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}

function linkOuTexto(doc: Document, url: string, texto: string): HTMLElement {
  const href = urlHttpsSegura(url);
  return href ? el(doc, 'a', { href, rel: 'noopener noreferrer', target: '_blank' }, texto) : el(doc, 'span', {}, texto);
}

export function renderFontes(doc: Document, fontes: Fonte[]): HTMLElement {
  const n = new Set(fontes.map((f) => f.url)).size;
  const lista = el(doc, 'ul', { class: 'fontes' });
  for (const f of fontes) {
    lista.append(el(doc, 'li', {}, linkOuTexto(doc, f.url, `${TEXTO_LINK[f.nome] ?? 'Fonte'} — ${f.rotulo}`)));
  }
  return el(doc, 'div', { class: 'bloco-fontes' },
    el(doc, 'p', { class: 'selo' }, n >= 2 ? `Confirmado por ${n} fontes` : 'Fonte única'), lista);
}

export function renderEvento(doc: Document, ev: Evento, nivelTitulo = 4): HTMLElement {
  const st = ROTULO_STATUS[ev.status];
  const li = el(doc, 'li', {
    class: `evento tipo-${ev.tipo} status-${ev.status}`,
    id: `ev-${ev.id.replace(/[^a-zA-Z0-9._-]/g, '-')}`,
  });
  li.append(el(doc, 'p', { class: 'evento-meta' },
    ev.hora && el(doc, 'time', { datetime: `${ev.data}T${ev.hora}` }, ev.hora),
    el(doc, 'span', { class: 'tipo' }, ROTULO_TIPO[ev.tipo]),
    el(doc, 'span', { class: 'status' }, el(doc, 'span', { 'aria-hidden': 'true' }, st.icone), ` ${st.texto}`)));
  li.append(el(doc, `h${nivelTitulo}`, { class: 'evento-titulo' }, ev.titulo));
  if (ev.local) li.append(el(doc, 'p', { class: 'local' }, ev.local));
  if (ev.ementa) li.append(el(doc, 'p', { class: 'ementa' }, ev.ementa));
  if (ev.datasAto) {
    li.append(el(doc, 'p', { class: 'datas-ato' },
      ev.datasAto.assinatura ? `Assinado em ${formatarDataCurta(ev.datasAto.assinatura)} · ` : '',
      `Publicado em ${formatarDataCurta(ev.datasAto.publicacao)}`));
  }
  if (ev.historico.length > 0) {
    const versoes = el(doc, 'ul');
    for (const v of ev.historico) {
      versoes.append(el(doc, 'li', {}, [v.hora, v.titulo, v.local].filter(Boolean).join(' · ')));
    }
    li.append(el(doc, 'details', {}, el(doc, 'summary', {}, `Versões anteriores (${ev.historico.length})`), versoes));
  }
  li.append(renderFontes(doc, ev.fontes));
  return li;
}

export function renderNoticia(doc: Document, n: Noticia): HTMLElement {
  const quando = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(n.data));
  return el(doc, 'li', { class: 'noticia' },
    el(doc, 'h3', { class: 'evento-titulo' }, linkOuTexto(doc, n.url, n.titulo)),
    el(doc, 'p', { class: 'local' }, `${n.veiculo} · ${quando}`));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/site/render.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Escrever o teste da página montada (inclui axe)**

`tests/site/app.test.ts`:

```ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { montar } from '../../site/src/app';
import type { Dados } from '../../site/src/dados';
import type { Evento, Noticia } from '../../src/shared/schema';

const T = '2026-10-08T12:00:00.000Z';
const HOJE = '2026-10-08';
const AGORA = new Date('2026-10-08T15:00:00Z');
const f = (nome: string, url: string) => ({ nome, rotulo: 'Planalto (governo)', url, coletadoEm: T });
const ev = (id: string, data: string, sobre: Partial<Evento> = {}): Evento => ({
  id, tipo: 'agenda', data, hora: '10:00', titulo: `Compromisso ${id}`, local: 'Palácio do Planalto',
  status: 'consta_na_agenda', fontes: [f('agenda-planalto', `https://www.gov.br/${id}`)],
  confirmadoPor: [], historico: [], ...sobre,
});

const noticia: Noticia = {
  id: 'google-news:abc', titulo: 'Manchete', veiculo: 'BBC', data: '2026-10-08T11:00:00.000Z',
  url: 'https://news.google.com/x', origem: 'google-news',
};
const DADOS: Dados = {
  eventos: [
    ev('a', '2026-10-06'),
    ev('b', '2026-10-07', { status: 'realizado', confirmadoPor: ['planalto:b'], fontes: [f('agenda-planalto', 'https://www.gov.br/b'), f('comunicado-planalto', 'https://www.gov.br/cb')] }),
    ev('c', '2026-10-07', { tipo: 'ato', hora: undefined, status: 'publicado', datasAto: { assinatura: '2026-10-06', publicacao: '2026-10-07' } }),
    ev('d', '2026-10-09', { status: 'agendado' }),
  ],
  noticias: [noticia],
  estado: { fontes: { agenda: { ok: true, desde: T }, dou: { ok: false, desde: T, mensagem: 'x' } }, ultimaNovidadeEm: '2026-10-08T14:30:00.000Z' },
};

beforeEach(() => {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.innerHTML = readFileSync(new URL('../../site/index.html', import.meta.url), 'utf8');
});

describe('montar', () => {
  it('mostra último registro, próximos compromissos e a linha do tempo agrupada por dia', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('ultimo-registro')!.textContent).toContain('Compromisso b'); // 07/10 10:00 vence o ato sem hora
    expect(document.getElementById('proximos')!.textContent).toContain('Compromisso d');
    const timeline = document.getElementById('linha-do-tempo')!;
    expect(timeline.textContent).not.toContain('Compromisso d'); // agendado só na faixa de próximos
    expect(timeline.querySelectorAll('section.dia')).toHaveLength(2);
    expect(timeline.querySelector('section.dia h3')!.textContent).toContain('quarta-feira, 7 de outubro de 2026');
  });

  it('mostra "última novidade" e avisa quando uma fonte está com falha', () => {
    montar(document, DADOS, { aba: 'linha' }, HOJE, AGORA);
    expect(document.getElementById('ultima-novidade')!.textContent).toContain('há 30 min');
    const aviso = document.getElementById('aviso-fontes')!;
    expect(aviso.hidden).toBe(false);
    expect(aviso.textContent).toContain('Diário Oficial');
  });

  it('com filtro ativo esconde próximos/último e aplica o filtro', () => {
    montar(document, DADOS, { aba: 'linha', tipo: 'ato' }, HOJE, AGORA);
    expect(document.getElementById('bloco-proximos')!.hidden).toBe(true);
    expect(document.getElementById('bloco-ultimo')!.hidden).toBe(true);
    expect(document.getElementById('linha-do-tempo')!.querySelectorAll('li.evento')).toHaveLength(1);
  });

  it('sem resultados mostra mensagem clara', () => {
    montar(document, DADOS, { aba: 'linha', de: '2030-01-01' }, HOJE, AGORA);
    expect(document.getElementById('linha-do-tempo')!.textContent).toContain('Nenhum registro');
  });

  it('aba Notícias mostra notícias e esconde a linha do tempo', () => {
    montar(document, DADOS, { aba: 'noticias' }, HOJE, AGORA);
    expect(document.getElementById('painel-linha')!.hidden).toBe(true);
    expect(document.getElementById('painel-noticias')!.hidden).toBe(false);
    expect(document.getElementById('lista-noticias')!.textContent).toContain('Manchete');
    expect(document.getElementById('aba-noticias')!.getAttribute('aria-current')).toBe('page');
  });

  it('preenche o formulário com os filtros da URL', () => {
    montar(document, DADOS, { aba: 'linha', tipo: 'ato', de: '2026-10-01' }, HOJE, AGORA);
    expect((document.querySelector('#filtros [name=tipo]') as HTMLSelectElement).value).toBe('ato');
    expect((document.querySelector('#filtros [name=de]') as HTMLInputElement).value).toBe('2026-10-01');
  });

  it('não tem violações de acessibilidade detectáveis pelo axe (linha do tempo e notícias)', async () => {
    for (const aba of ['linha', 'noticias'] as const) {
      document.documentElement.innerHTML = readFileSync(new URL('../../site/index.html', import.meta.url), 'utf8');
      montar(document, DADOS, { aba }, HOJE, AGORA);
      const r = await axe.run(document.documentElement, { rules: { 'color-contrast': { enabled: false } } });
      expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
    }
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run tests/site/app.test.ts`
Expected: FAIL — `index.html` / `app` não existem.

- [ ] **Step 7: Criar `index.html`**

`site/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rastreador do Presidente</title>
  <meta name="description" content="O que o Presidente da República fez e o que consta na agenda oficial, com a fonte pública de cada item.">
  <link rel="stylesheet" href="./style.css">
  <script type="module" src="./src/main.ts"></script>
</head>
<body>
  <a class="pular" href="#conteudo">Pular para o conteúdo</a>
  <header class="topo">
    <h1>Rastreador do Presidente</h1>
    <p id="ultima-novidade" class="discreto"></p>
    <p id="aviso-fontes" class="aviso" role="status" hidden></p>
    <nav aria-label="Seções do site" class="abas">
      <a id="aba-linha" href="?aba=linha">Linha do tempo</a>
      <a id="aba-noticias" href="?aba=noticias">Notícias</a>
      <a href="sobre.html">Sobre e metodologia</a>
    </nav>
  </header>

  <main id="conteudo">
    <div id="painel-linha">
      <form id="filtros" class="filtros" method="get" action="">
        <input type="hidden" name="aba" value="linha">
        <label>De <input type="date" name="de"></label>
        <label>Até <input type="date" name="ate"></label>
        <label>Tipo
          <select name="tipo">
            <option value="">Todos</option>
            <option value="agenda">Agenda</option>
            <option value="ato">Atos oficiais</option>
            <option value="comunicado">Comunicados do Planalto</option>
          </select>
        </label>
        <label>Status
          <select name="status">
            <option value="">Todos</option>
            <option value="agendado">Agendado</option>
            <option value="consta_na_agenda">Consta na agenda</option>
            <option value="realizado">Realizado</option>
            <option value="publicado">Publicado</option>
            <option value="alterado">Alterado</option>
            <option value="removido">Removido</option>
          </select>
        </label>
        <button type="submit">Filtrar</button>
        <a href="?aba=linha">Limpar filtros</a>
      </form>

      <section id="bloco-ultimo" aria-labelledby="t-ultimo">
        <h2 id="t-ultimo">Último registro</h2>
        <div id="ultimo-registro"></div>
      </section>
      <section id="bloco-proximos" aria-labelledby="t-proximos">
        <h2 id="t-proximos">Próximos compromissos</h2>
        <ol id="proximos" class="lista"></ol>
      </section>
      <section aria-labelledby="t-linha">
        <h2 id="t-linha">Linha do tempo</h2>
        <div id="linha-do-tempo"></div>
      </section>
    </div>

    <div id="painel-noticias" hidden>
      <h2>Notícias</h2>
      <p class="aviso-imprensa">Aqui está o que a imprensa publica sobre o presidente. Não são registros oficiais do que ele fez.</p>
      <ul id="lista-noticias" class="lista"></ul>
    </div>
  </main>

  <footer class="rodape">
    <p>Projeto independente, sem vínculo com o governo. Todos os dados vêm de fontes públicas, linkadas em cada item. <a href="sobre.html">Como funciona</a>.</p>
  </footer>
</body>
</html>
```

- [ ] **Step 8: Implementar `app.ts` e `main.ts`**

`site/src/app.ts`:

```ts
import type { EstadoFontes } from '../../src/shared/schema';
import type { Dados } from './dados';
import { agruparPorDia, filtrarEventos, proximos, ultimoRegistro } from './filtrar';
import type { Filtros } from './params';
import { el, formatarDataLonga, renderEvento, renderNoticia } from './render';

const NOME_FONTE: Record<string, string> = {
  agenda: 'Agenda do Planalto',
  dou: 'Diário Oficial',
  planalto: 'Comunicados do Planalto',
  'noticias-google': 'Google Notícias',
  'noticias-agencia-brasil': 'Agência Brasil',
};

function haQuanto(iso: string, agora: Date): string {
  const min = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)} h`;
  return `há ${Math.floor(min / 1440)} dia(s)`;
}

function limpar(e: HTMLElement): void {
  e.replaceChildren();
}

function textoAviso(estado: EstadoFontes): string | null {
  const falhas = Object.entries(estado.fontes).filter(([, s]) => !s.ok).map(([n]) => NOME_FONTE[n] ?? n);
  return falhas.length ? `Atenção: sem atualizar agora — ${falhas.join(', ')}. Os dados já exibidos continuam valendo.` : null;
}

export function montar(doc: Document, dados: Dados, f: Filtros, hoje: string, agora: Date): void {
  const $ = (id: string) => doc.getElementById(id) as HTMLElement;
  const linha = f.aba === 'linha';

  $('painel-linha').hidden = !linha;
  $('painel-noticias').hidden = linha;
  $(linha ? 'aba-linha' : 'aba-noticias').setAttribute('aria-current', 'page');
  $(linha ? 'aba-noticias' : 'aba-linha').removeAttribute('aria-current');

  $('ultima-novidade').textContent = dados.estado.ultimaNovidadeEm
    ? `Última novidade ${haQuanto(dados.estado.ultimaNovidadeEm, agora)}`
    : '';
  const aviso = textoAviso(dados.estado);
  $('aviso-fontes').hidden = aviso === null;
  $('aviso-fontes').textContent = aviso ?? '';

  for (const nome of ['de', 'ate', 'tipo', 'status'] as const) {
    const campo = doc.querySelector<HTMLInputElement | HTMLSelectElement>(`#filtros [name=${nome}]`);
    if (campo) campo.value = f[nome] ?? '';
  }

  const lista = $('lista-noticias');
  limpar(lista);
  for (const n of dados.noticias) lista.append(renderNoticia(doc, n));
  if (!linha) return;

  const filtrando = Boolean(f.tipo || f.status || f.de || f.ate);
  const ultimo = filtrando ? undefined : ultimoRegistro(dados.eventos, hoje);
  const prox = filtrando ? [] : proximos(dados.eventos);

  $('bloco-ultimo').hidden = !ultimo;
  limpar($('ultimo-registro'));
  if (ultimo) $('ultimo-registro').append(el(doc, 'ul', { class: 'lista' }, renderEvento(doc, ultimo, 3)));

  $('bloco-proximos').hidden = prox.length === 0;
  limpar($('proximos'));
  for (const e of prox) $('proximos').append(renderEvento(doc, e, 3));

  const base = filtrando ? dados.eventos : dados.eventos.filter((e) => !(e.tipo === 'agenda' && e.status === 'agendado'));
  const grupos = agruparPorDia(filtrarEventos(base, f));
  const destino = $('linha-do-tempo');
  limpar(destino);
  if (grupos.length === 0) {
    destino.append(el(doc, 'p', { class: 'vazio' }, 'Nenhum registro encontrado para estes filtros.'));
    return;
  }
  for (const g of grupos) {
    destino.append(el(doc, 'section', { class: 'dia' },
      el(doc, 'h3', {}, el(doc, 'time', { datetime: g.data }, formatarDataLonga(g.data))),
      el(doc, 'ol', { class: 'lista' }, ...g.itens.map((e) => renderEvento(doc, e, 4)))));
  }
}
```

`site/src/main.ts`:

```ts
import { dataSaoPaulo } from '../../src/shared/text';
import { montar } from './app';
import { carregarDados } from './dados';
import { lerFiltros } from './params';

async function iniciar(): Promise<void> {
  const filtros = lerFiltros(window.location.search);
  const agora = new Date();
  montar(document, await carregarDados(filtros), filtros, dataSaoPaulo(agora), agora);
}

iniciar().catch(() => {
  const aviso = document.getElementById('aviso-fontes');
  if (aviso) {
    aviso.textContent = 'Não foi possível carregar os dados agora. Tente novamente em instantes.';
    aviso.hidden = false;
  }
});
```

- [ ] **Step 9: Criar o CSS**

`site/style.css`:

```css
:root {
  --fundo: #fbfaf7; --texto: #1c1b19; --suave: #5b574f; --linha: #d9d4c8;
  --cartao: #ffffff; --link: #0b4f9c; --aviso-bg: #fff3cd; --aviso-tx: #5c4400;
  --agenda: #0b6b4f; --ato: #7a2e8e; --comunicado: #0b4f9c;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fundo: #14130f; --texto: #f1eee6; --suave: #b9b3a5; --linha: #3a372f;
    --cartao: #1d1c17; --link: #8ec1ff; --aviso-bg: #3a2f08; --aviso-tx: #ffe9a8;
    --agenda: #6fd4b0; --ato: #d9a8ea; --comunicado: #8ec1ff;
  }
}
* { box-sizing: border-box; }
html { font-size: 112.5%; }
body { margin: 0; background: var(--fundo); color: var(--texto); font-family: Georgia, 'Times New Roman', serif; line-height: 1.55; }
h1, h2, h3, h4, nav, label, button, select, input, .selo, .evento-meta { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
a { color: var(--link); }
a:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible, summary:focus-visible {
  outline: 3px solid var(--link); outline-offset: 2px;
}
.pular { position: absolute; left: -999px; }
.pular:focus { left: 8px; top: 8px; background: var(--cartao); padding: 8px; z-index: 10; }

.topo, main, .rodape { max-width: 46rem; margin: 0 auto; padding: 0 16px; }
.topo { padding-top: 20px; }
.topo h1 { margin: 0 0 4px; font-size: 1.6rem; }
.discreto { margin: 0; color: var(--suave); font-size: 0.9rem; }
.aviso { background: var(--aviso-bg); color: var(--aviso-tx); padding: 8px 12px; border-radius: 6px; margin: 8px 0; }
.abas { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 12px 0 8px; padding-bottom: 8px; border-bottom: 1px solid var(--linha); }
.abas a { text-decoration: none; padding: 6px 2px; border-bottom: 3px solid transparent; font-weight: 600; }
.abas a[aria-current='page'] { border-bottom-color: var(--link); }

.filtros { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: end; margin: 12px 0 20px; font-size: 0.9rem; }
.filtros label { display: flex; flex-direction: column; gap: 2px; }
.filtros input, .filtros select, .filtros button { font-size: 1rem; padding: 6px 8px; min-height: 44px; border: 1px solid var(--linha); border-radius: 6px; background: var(--cartao); color: var(--texto); }
.filtros button { font-weight: 700; cursor: pointer; }

h2 { font-size: 1.25rem; margin: 28px 0 8px; }
.lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.dia h3 { font-size: 1rem; margin: 24px 0 8px; color: var(--suave); text-transform: capitalize; }
.evento, .noticia { background: var(--cartao); border: 1px solid var(--linha); border-left: 5px solid var(--linha); border-radius: 8px; padding: 12px 14px; }
.tipo-agenda { border-left-color: var(--agenda); }
.tipo-ato { border-left-color: var(--ato); }
.tipo-comunicado { border-left-color: var(--comunicado); }
.status-removido .evento-titulo { text-decoration: line-through; }
.evento-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0 0 4px; font-size: 0.85rem; color: var(--suave); }
.evento-titulo { margin: 0 0 4px; font-size: 1.05rem; line-height: 1.35; }
.local, .ementa, .datas-ato { margin: 2px 0; font-size: 0.95rem; }
.datas-ato { color: var(--suave); }
.bloco-fontes { margin-top: 8px; font-size: 0.88rem; }
.selo { display: inline-block; margin: 0 0 2px; font-weight: 700; font-size: 0.8rem; color: var(--suave); }
.fontes { margin: 0; padding-left: 18px; }
.vazio, .aviso-imprensa { color: var(--suave); }
details { margin-top: 6px; font-size: 0.9rem; }
.rodape { color: var(--suave); font-size: 0.85rem; padding-bottom: 32px; margin-top: 32px; }

@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
```

- [ ] **Step 10: Rodar e ver passar**

Run: `npx vitest run tests/site && npm run typecheck`
Expected: PASS. Se o axe apontar violação, corrija o HTML/`app.ts` (não desligue a regra); exceção já aceita: `color-contrast`, que o jsdom não calcula e é verificado manualmente na Task 14.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(site): renderização segura, página montada e testes de acessibilidade"
```

---

### Task 12: Página "Sobre e metodologia", build com CSP e cópia de dados

**Files:**
- Create: `site/sobre.html`, `vite.config.ts`, `scripts/copy-data.mjs`
- Test: `tests/site/build.test.ts`

**Interfaces:**
- Consumes: `site/index.html`, `site/style.css` (Task 11).
- Produces: `npm run build` gera `dist/index.html`, `dist/sobre.html` (ambos com `<meta http-equiv="Content-Security-Policy">`), assets e `dist/data/` (cópia de `data/`).

- [ ] **Step 1: Criar a página Sobre**

`site/sobre.html`:

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sobre e metodologia — Rastreador do Presidente</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <a class="pular" href="#conteudo">Pular para o conteúdo</a>
  <header class="topo">
    <h1>Sobre e metodologia</h1>
    <nav aria-label="Seções do site" class="abas">
      <a href="./">Voltar à linha do tempo</a>
    </nav>
  </header>
  <main id="conteudo">
    <h2>O que é</h2>
    <p>Um registro público e somente de leitura do que o Presidente da República fez e do que consta na sua agenda oficial. O site não tem login, comentários nem qualquer campo em que alguém possa inserir dados. É um projeto independente, sem vínculo com o governo.</p>

    <h2>De onde vêm os dados</h2>
    <ul>
      <li><strong>Agenda do Presidente</strong> (Planalto): compromissos publicados pelo governo, desde 01/01/2023.</li>
      <li><strong>Diário Oficial da União</strong>: decretos numerados, leis e medidas provisórias, desde 01/01/2023.</li>
      <li><strong>Comunicados do Planalto</strong>: textos publicados pelo governo depois dos fatos. O histórico existe a partir do início da nossa coleta.</li>
      <li><strong>Notícias</strong> (aba separada): títulos e links de Google Notícias e Agência Brasil. É o que a imprensa publica, não um registro oficial.</li>
    </ul>
    <p>Todo item tem link para o dado de origem. Item sem fonte pública não é publicado.</p>

    <h2>O que cada status significa</h2>
    <ul>
      <li><strong>Agendado</strong>: consta na agenda oficial e ainda vai acontecer.</li>
      <li><strong>Consta na agenda</strong>: estava na agenda e o dia já passou, mas não há registro oficial que confirme. O passar do tempo, sozinho, não prova que aconteceu.</li>
      <li><strong>Realizado</strong>: um comunicado oficial do Planalto confirma o compromisso (mesmo dia e mesmo local).</li>
      <li><strong>Publicado no Diário Oficial</strong>: o ato foi publicado. Mostramos a data de assinatura e a de publicação.</li>
      <li><strong>Alterado / Removido</strong>: o compromisso mudou ou saiu da agenda. Guardamos a versão anterior e nada some sem aviso.</li>
    </ul>

    <h2>Limites que você precisa saber</h2>
    <ul>
      <li>Agenda e comunicados são do próprio governo: "confirmado por 2 fontes" significa dois documentos, mas não duas fontes independentes entre si.</li>
      <li>O governo publica o que quer publicar. Reuniões de rotina muitas vezes ficam sem confirmação.</li>
      <li>Um comunicado só confirma um compromisso do mesmo dia. Em caso de dúvida, preferimos não ligar os dois.</li>
      <li>Se o horário de um compromisso muda, o horário antigo aparece como removido e o novo como um item novo.</li>
      <li>O site atualiza sozinho a cada poucos minutos; fontes públicas podem demorar a publicar.</li>
      <li>Não resumimos nem reescrevemos o que as fontes dizem: mostramos o texto oficial.</li>
    </ul>
  </main>
  <footer class="rodape"><p>O código e os dados são abertos para conferência.</p></footer>
</body>
</html>
```

- [ ] **Step 2: Escrever o teste do build que falha**

`tests/site/build.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('build de produção', () => {
  it('gera as páginas com CSP, sem scripts inline, e copia os dados', () => {
    execSync('npm run build', { stdio: 'pipe' });
    for (const pagina of ['dist/index.html', 'dist/sobre.html']) {
      const html = readFileSync(pagina, 'utf8');
      expect(html).toContain('http-equiv="Content-Security-Policy"');
      expect(html).toContain("default-src 'none'");
      expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/); // nenhum script inline
    }
    expect(existsSync('dist/data') || !existsSync('data')).toBe(true);
  }, 120_000);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/site/build.test.ts`
Expected: FAIL — `vite.config.ts` e `scripts/copy-data.mjs` não existem.

- [ ] **Step 4: Implementar a configuração do build**

`vite.config.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'";

function csp(): Plugin {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">`),
    },
  };
}

// No `npm run dev`, serve ./data em /data (no build, scripts/copy-data.mjs copia para dist/).
function dadosDev(): Plugin {
  return {
    name: 'dados-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/data', async (req, res, next) => {
        try {
          const raiz = resolve('data');
          const arquivo = resolve(raiz, `.${(req.url ?? '').split('?')[0]}`);
          if (!arquivo.startsWith(raiz)) return next();
          res.setHeader('Content-Type', 'application/json');
          res.end(await readFile(arquivo));
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  root: 'site',
  base: './',
  plugins: [csp(), dadosDev()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve('site/index.html'), sobre: resolve('site/sobre.html') } },
  },
});
```

`scripts/copy-data.mjs`:

```js
import { cpSync, existsSync } from 'node:fs';

if (existsSync('data')) cpSync('data', 'dist/data', { recursive: true });
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/site/build.test.ts && npm run typecheck`
Expected: PASS. Se a regex de script inline reclamar do `<script type="module" crossorigin src=...>`, confirme que o `src` está presente (o lookahead só barra scripts sem `src`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(site): página Sobre, build com CSP e cópia dos dados"
```

---

### Task 13: Workflows do GitHub Actions e publicação

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/update.yml`
- Test: validação sintática com `actionlint` (se disponível) ou `node -e` de parse YAML — ver Step 3

**Interfaces:**
- Consumes: scripts `test`, `typecheck`, `update`, `build` (Task 1/9/12).
- Produces: execução a cada 10 min que coleta, commita `data/` só se mudou e republica no GitHub Pages.

- [ ] **Step 1: Criar o workflow de CI**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
    paths-ignore: ['data/**']
jobs:
  testar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 2: Criar o workflow de atualização e publicação**

`.github/workflows/update.yml`:

```yaml
name: Atualizar dados e publicar
on:
  schedule:
    - cron: '*/10 * * * *'
  workflow_dispatch:
  push:
    branches: [main]
    paths-ignore: ['data/**', 'docs/**']

concurrency:
  group: atualizar
  cancel-in-progress: false

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  atualizar:
    runs-on: ubuntu-latest
    outputs:
      mudou: ${{ steps.commit.outputs.mudou }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: Coletar fontes
        id: coletar
        run: npm run update
        continue-on-error: true
        env:
          CONTATO_URL: ${{ github.server_url }}/${{ github.repository }}
      - name: Commitar dados se mudaram
        id: commit
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data
          if git diff --cached --quiet; then
            echo "mudou=false" >> "$GITHUB_OUTPUT"
          else
            git commit -m "dados: atualização automática"
            git pull --rebase origin "${{ github.ref_name }}"
            git push
            echo "mudou=true" >> "$GITHUB_OUTPUT"
          fi
      - name: Falhar se uma fonte falhou em execuções seguidas
        if: steps.coletar.outcome == 'failure'
        run: exit 1

  publicar:
    needs: atualizar
    if: ${{ always() && (needs.atualizar.outputs.mudou == 'true' || github.event_name != 'schedule') }}
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.repository.default_branch }}
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Validar a sintaxe dos workflows**

Run:

```bash
npx --yes yaml-lint .github/workflows/ci.yml .github/workflows/update.yml
```

Expected: sem erros. (Alternativa se não houver rede: `node -e "const y=require('node:fs');for(const f of ['ci','update'])console.log(f,y.readFileSync('.github/workflows/'+f+'.yml','utf8').length)"` apenas confirma que os arquivos existem; nesse caso valide no GitHub no passo seguinte.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "ci: testes, coleta agendada a cada 10 min e publicação no GitHub Pages"
```

- [ ] **Step 5: Passos manuais do dono do repositório (o agente deve pedir e esperar confirmação)**

1. Criar um repositório **público** no GitHub (ex.: `rastreador-presidente`) e rodar:

```bash
git remote add origin git@github.com:<usuario>/rastreador-presidente.git
git push -u origin main
```

2. No GitHub: *Settings → Pages → Build and deployment → Source: GitHub Actions*.
3. *Settings → Actions → General → Workflow permissions: Read and write permissions*.
4. Rodar o workflow manualmente (*Actions → Atualizar dados e publicar → Run workflow*) depois da Task 14 (precisa de dados). Notificações de falha chegam por e-mail do GitHub para quem editou o cron.
5. Aviso: o GitHub desativa workflows agendados após 60 dias sem atividade no repositório; os commits diários de dados contam como atividade, mas confira se o agendamento continua ativo ao fim de períodos longos sem dados novos.

---

### Task 14: Verificação com as fontes reais, carga histórica e conferência visual

**Files:**
- Modify (se a verificação revelar diferença): o coletor correspondente em `src/collectors/` **e** seu teste/fixture
- Create (dados gerados e commitados): `data/**`

**Interfaces:**
- Consumes: todo o sistema.
- Produces: `data/` populado e uma lista do que foi conferido contra a realidade.

- [ ] **Step 1: Rodar uma atualização real e inspecionar**

```bash
CONTATO_URL="https://github.com/<usuario>/rastreador-presidente" npm run update
cat data/status.json
ls data data/eventos
```

Expected: `status.json` com `ok: true` em `agenda`, `dou`, `planalto`, `noticias-google`, `noticias-agencia-brasil`. Se alguma estiver `ok:false`, leia a `mensagem` e corrija o coletor correspondente **com um teste que reproduza o problema** antes de seguir. Pontos de atenção conhecidos a conferir:
- DOU: se a edição do dia ainda não existe de manhã cedo, confirme se a resposta é 404 (tratada como vazio) ou 200 sem `params` (viraria `DouLayoutError`; nesse caso trate como "sem edição" em `coletarDou`).
- Feed do Planalto: confirme que `parsePlanaltoFeed` devolve ~30 itens (se devolver 0, o item RDF usa outra estrutura — ajuste o parser e acrescente um trecho real do feed ao teste).
- Agenda de hoje: confira com a página no navegador que os horários e locais batem.

- [ ] **Step 2: Conferir a regra de ligação com dados reais**

```bash
node -e '
const fs=require("fs");const m=JSON.parse(fs.readFileSync("data/meses.json","utf8"))[0];
const ev=JSON.parse(fs.readFileSync(`data/eventos/${m}.json`,"utf8"));
const c=ev.filter(e=>e.tipo==="comunicado"), r=ev.filter(e=>e.tipo==="agenda"&&e.status==="realizado");
console.log("comunicados próprios:",c.length,"| compromissos confirmados:",r.length);
for(const e of r.slice(0,5)) console.log("-",e.data,e.titulo.slice(0,60),"|",e.local,"|",e.fontes.length,"fontes");
for(const e of c.slice(0,5)) console.log("*",e.data,e.titulo.slice(0,80));
'
```

Expected: itens "confirmados" fazem sentido (mesmo dia e lugar). Se algum casamento parecer errado, **restrinja** a regra em `src/pipeline/link.ts` e adicione o caso ao `tests/pipeline/link.test.ts` — preferir não ligar a ligar errado. Se quase nada liga porque o formato do `local` da agenda difere do texto dos comunicados, registre os exemplos reais no commit e ajuste `chaveLocal` com teste.

- [ ] **Step 3: Carga histórica (uma vez, demorada) — primeiro um mês, depois tudo**

```bash
CONTATO_URL="https://github.com/<usuario>/rastreador-presidente" npm run backfill -- 2026-09-01 2026-09-30
du -sh data && ls data/eventos
```

Expected: `data/eventos/2026-09.json` com agenda e atos; tempo ≈ 1–2 s por dia. Se estiver correto:

```bash
CONTATO_URL="https://github.com/<usuario>/rastreador-presidente" npm run backfill -- 2023-01-01
```

Rode em segundo plano; se terminar com "Dias com falha", repita para esses dias (`npm run backfill -- AAAA-MM-DD AAAA-MM-DD`). Confira o tamanho final de `data/` (esperado: poucos MB; se passar de ~50 MB, reavalie antes de commitar).

- [ ] **Step 4: Conferência visual e de acessibilidade no navegador**

```bash
npm run dev
```

Abrir `http://localhost:5173/` e conferir, em largura de celular (≈ 375 px) e desktop, nos temas claro e escuro:
- "Último registro", "Próximos compromissos" e a linha do tempo aparecem; os links de fonte abrem a página certa.
- Filtros por data/tipo/status funcionam e a URL é compartilhável (`?tipo=ato&de=2026-09-01`).
- Aba Notícias mostra a ressalva de que é imprensa.
- Navegação só por teclado (Tab/Enter) percorre tudo com foco visível; contraste legível (esta é a verificação de contraste que o axe em jsdom não faz).
- Sem erros no console.

Registrar qualquer ajuste de CSS/HTML e rodar `npx vitest run tests/site` de novo.

- [ ] **Step 5: Verificação final**

```bash
npm run typecheck && npm test && npm run build
```

Expected: tudo passa; `dist/` contém `index.html`, `sobre.html`, `data/`.

- [ ] **Step 6: Commit dos dados e envio**

```bash
git add -A
git commit -m "dados: carga histórica inicial e ajustes da verificação com fontes reais"
git push
```

Depois, no GitHub, rodar o workflow *Atualizar dados e publicar* manualmente e abrir a URL do Pages para a conferência final.

---

## Auto-revisão (cobertura do spec)

- Objetivo/critérios (spec §1): item sem fonte não é gravado (Task 1 esquema); último registro e próximos na tela (Tasks 10–11); atualização automática (Task 13); sem entrada de usuário (Tasks 11–12); troca de mandato por config (Task 2).
- Escopo (§2): linha do tempo, aba Notícias, filtros em URL, página Sobre, carga histórica (Tasks 9, 11, 12, 14).
- Fontes (§3): agenda (Task 3), DOU + texto do Planalto (Task 4), feed do Planalto (Task 5), Google News/Agência Brasil (Task 6).
- Arquitetura/armazenamento (§4): coletores isolados (Tasks 3–6, 9), JSON mensal + `meses.json`/`noticias.json`/`status.json` (Task 9).
- Modelo de dados e regras (§5–6): esquema (Task 1); status, relevância, ligação (Tasks 5, 7, 8).
- Interface/acessibilidade (§7): Tasks 11–12 (axe + checagem manual de contraste na Task 14).
- Erros (§8): layout vs. 404, falha persistente, idempotência (Tasks 3, 7, 9, 13).
- Segurança (§9): texto puro, https, parâmetros validados, CSP (Tasks 1, 10, 11, 12).
- Testes (§10) e troca de governo (§11): cobertos; limitações (§12) estão na página Sobre (Task 12).
- Decisões adiadas (§13: nome/domínio, hospedagem): a hospedagem ficou em GitHub Pages (Task 13); nome final e domínio continuam fora deste plano.
