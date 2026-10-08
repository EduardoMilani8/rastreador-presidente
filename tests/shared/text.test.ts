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
    expect(parseDataExtenso('DECRETO Nº 11.369, DE 1º DE JANEIRO DE 2023')).toBe('2023-01-01');
    expect(parseDataExtenso('sem data')).toBeNull();
  });
  it('somarDias cruza meses e anos', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
  });
});
