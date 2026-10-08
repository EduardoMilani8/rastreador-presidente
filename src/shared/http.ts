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
