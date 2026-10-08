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
  const m = normalizar(texto).match(/(\d{1,2})[º°o]? de ([a-z]+) de (\d{4})/);
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
