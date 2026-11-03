import { describe, expect, it } from 'vitest';
import { CODIGO_GOATCOUNTER, HOST_PRODUCAO, urlContagem } from '../../site/src/contagem';

const BASE = `https://${CODIGO_GOATCOUNTER}.goatcounter.com/count`;

describe('urlContagem', () => {
  it('não conta fora do domínio de produção (dev, preview, cópias do site)', () => {
    expect(urlContagem({ hostname: 'localhost', pathname: '/' }, '')).toBeNull();
    expect(urlContagem({ hostname: '127.0.0.1', pathname: '/' }, '')).toBeNull();
    expect(urlContagem({ hostname: 'eduardomilani8.github.io', pathname: '/rastreador-presidente/' }, '')).toBeNull();
  });

  it('conta só o caminho da página, sem a busca nem a âncora', () => {
    const url = new URL(urlContagem({ hostname: HOST_PRODUCAO, pathname: '/registros.html' }, '')!);
    expect(`${url.origin}${url.pathname}`).toBe(BASE);
    expect(url.searchParams.get('p')).toBe('/registros.html');
    expect(url.searchParams.has('q')).toBe(false);
    expect(url.searchParams.has('r')).toBe(false);
  });

  it('manda a origem da visita só quando vem de outro site', () => {
    const externo = new URL(urlContagem({ hostname: HOST_PRODUCAO, pathname: '/' }, 'https://www.google.com/')!);
    expect(externo.searchParams.get('r')).toBe('https://www.google.com/');
    const interno = new URL(urlContagem({ hostname: HOST_PRODUCAO, pathname: '/' }, `https://${HOST_PRODUCAO}/sobre.html`)!);
    expect(interno.searchParams.has('r')).toBe(false);
  });

  it('o endereço da contagem é sempre https', () => {
    expect(urlContagem({ hostname: HOST_PRODUCAO, pathname: '/' }, '')).toMatch(/^https:\/\//);
  });
});
