export const MESES = [
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

// O DOU às vezes esquece um "DE" ("DE 31 DE MAIO 2023", "DE 15 MAIO DE 2024"): os dois são opcionais. O mês tem de
// existir e o dia tem de caber nele, para um número solto do título não virar data.
export function parseDataExtenso(texto: string): string | null {
  for (const m of normalizar(texto).matchAll(/(\d{1,2})[º°o]? (?:de )?([a-z]+) (?:de )?(\d{4})(?!\d)/g)) {
    const mes = MESES.indexOf(m[2]);
    if (mes < 0) continue;
    const iso = `${m[3]}-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(`${iso}T12:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso) return iso;
  }
  return null;
}

// Na republicação o DOU põe, no lugar do resumo, só a remissão: "(Publicada no DOU de 17/1/2023, edição extra)".
export function ementaEhSoRemissao(ementa: string | undefined): boolean {
  return ementa !== undefined && /^\(Publicad/i.test(ementa);
}

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
