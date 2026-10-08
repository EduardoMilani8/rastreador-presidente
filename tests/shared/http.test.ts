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
  it('descarta o corpo de respostas 5xx antes de repetir', async () => {
    const cancelSpy1 = vi.fn();
    const cancelSpy2 = vi.fn();
    const cancelSpy3 = vi.fn();
    const resp1 = new Response('erro1', { status: 500 });
    const resp2 = new Response('erro2', { status: 500 });
    const resp3 = new Response('ok', { status: 200 });
    resp1.body!.cancel = cancelSpy1;
    resp2.body!.cancel = cancelSpy2;
    resp3.body!.cancel = cancelSpy3;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(resp1)
      .mockResolvedValueOnce(resp2)
      .mockResolvedValueOnce(resp3);
    const r = await buscarTexto('https://x.test/a', 'text/html', { fetchImpl, esperaMs: 0 });
    expect(r.corpo).toBe('ok');
    expect(cancelSpy1).toHaveBeenCalled();
    expect(cancelSpy2).toHaveBeenCalled();
    expect(cancelSpy3).not.toHaveBeenCalled();
  });
});
