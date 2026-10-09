import { resolve, sep } from 'node:path';

/**
 * Resolve a URL pedida (já sem o prefixo /data) para um arquivo dentro de `raiz`.
 * Devolve null para qualquer coisa que escape da pasta (../, %2e%2e, byte nulo, irmãos com prefixo parecido).
 */
export function caminhoSeguro(raiz: string, url: string): string | null {
  let relativo: string;
  try {
    relativo = decodeURIComponent(url.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (relativo.includes('\0') || relativo.includes('\\')) return null;
  const base = resolve(raiz);
  const arquivo = resolve(base, `.${relativo.startsWith('/') ? relativo : `/${relativo}`}`);
  if (!arquivo.startsWith(base + sep)) return null;
  return arquivo;
}
