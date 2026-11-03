// Contagem de visitas pelo GoatCounter: sem cookies e sem guardar IP. Em vez do script deles (count.js), o site carrega
// só a imagem de contagem, montada aqui. Assim a CSP continua sem nenhum script de fora; basta liberar img-src.
// vite.config.ts importa estas constantes para montar a CSP: mudou o código, a CSP acompanha.
export const CODIGO_GOATCOUNTER = 'rastreadordopresidente';
export const HOST_PRODUCAO = 'rastreadordopresidente.com.br';
export const ORIGEM_CONTAGEM = `https://${CODIGO_GOATCOUNTER}.goatcounter.com`;

interface Local { hostname: string; pathname: string }

// Só o caminho: a busca (filtros) e a âncora ficam de fora. A origem só vai quando vem de outro site; navegar entre
// as páginas daqui não é origem de visita.
export function urlContagem(local: Local, referrer: string): string | null {
  if (local.hostname !== HOST_PRODUCAO) return null;
  const url = new URL('/count', ORIGEM_CONTAGEM);
  url.searchParams.set('p', local.pathname);
  let origem: URL | null = null;
  try { origem = referrer ? new URL(referrer) : null; } catch { origem = null; }
  if (origem && origem.hostname !== HOST_PRODUCAO) url.searchParams.set('r', origem.href);
  // O servidor ignora rnd; serve para navegador ou proxy não reaproveitar a imagem da visita anterior.
  url.searchParams.set('rnd', Math.random().toString(36).slice(2));
  return url.href;
}

export function contarVisita(): void {
  const url = urlContagem(window.location, document.referrer);
  if (url) new Image().src = url;
}
