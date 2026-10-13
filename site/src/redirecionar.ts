const FILTROS_ANTIGOS = ['aba', 'de', 'ate', 'tipo', 'status'];

/**
 * Para onde vai um endereço do site de página única (`?aba=`, filtros ou âncora de registro na raiz); `null` se o
 * endereço é do painel mesmo. O resultado começa sempre por um nome de arquivo fixo: o que vem do endereço só entra
 * depois do `?` ou do `#`, e por isso nunca leva para fora do site.
 */
export function destinoAntigo(search: string, hash: string): string | null {
  const q = new URLSearchParams(search);
  if (q.get('aba') === 'noticias') return 'noticias.html';
  if (!FILTROS_ANTIGOS.some((nome) => q.has(nome)) && !hash.startsWith('#ev-')) return null;
  q.delete('aba');
  const consulta = q.toString();
  return `registros.html${consulta ? `?${consulta}` : ''}${hash}`;
}
