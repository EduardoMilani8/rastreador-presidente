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
  it('parseDataExtenso aceita os títulos reais do DOU sem o "DE" antes do ano ou do mês', () => {
    expect(parseDataExtenso('DECRETO Nº 11.539, DE 31 DE MAIO 2023')).toBe('2023-05-31');
    expect(parseDataExtenso('DECRETO Nº 12.704, DE 31 DE OUTUBRO 2025')).toBe('2025-10-31');
    expect(parseDataExtenso('MEDIDA PROVISÓRIA Nº 1.219, DE 15 MAIO DE 2024')).toBe('2024-05-15');
    expect(parseDataExtenso('DECRETO Nº 12.042 DE 5 DE JUNHO DE 2024')).toBe('2024-06-05');
  });
  it('parseDataExtenso não inventa data: mês inexistente, dia impossível ou número solto', () => {
    expect(parseDataExtenso('DECRETO Nº 11 DE 2023')).toBeNull();
    expect(parseDataExtenso('LEI Nº 14.133, DE 31 DE FEVEREIRO DE 2021')).toBeNull();
    expect(parseDataExtenso('PORTARIA 12 GABINETE 2023')).toBeNull();
    expect(parseDataExtenso('DECRETO Nº 12, DE 40 DE MAIO DE 2023')).toBeNull();
  });
  it('somarDias cruza meses e anos', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
  });
});
