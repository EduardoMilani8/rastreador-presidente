import { citaPresidente, type Comunicado } from '../collectors/planalto';
import type { Evento, Fonte, Mandato } from '../shared/schema';
import { normalizar } from '../shared/text';

function chaveLocal(local: string): string {
  return normalizar(local).replace(/\s*[-–/,(]\s*[a-z]{2}\)?$/, '').trim();
}

function fonteDe(c: Comunicado): Fonte {
  return { nome: 'comunicado-planalto', rotulo: 'Planalto (governo)', url: c.url, coletadoEm: c.coletadoEm };
}

function eventoDe(c: Comunicado): Evento {
  return {
    id: c.id, tipo: 'comunicado', data: c.data, titulo: c.titulo, status: 'realizado',
    ementa: c.resumo || undefined, fontes: [fonteDe(c)], confirmadoPor: [], historico: [],
  };
}

export function ligarComunicados(eventos: Evento[], comunicados: Comunicado[], mandato: Mandato): Evento[] {
  const saida = eventos.map((e) => ({ ...e, fontes: [...e.fontes], confirmadoPor: [...e.confirmadoPor] }));
  const novos: Evento[] = [];

  for (const c of comunicados) {
    if (saida.some((e) => e.id === c.id)) continue;
    const texto = normalizar(`${c.titulo} ${c.resumo}`);
    const candidatos = saida.filter((e) => {
      if (e.tipo !== 'agenda' || e.removidoEm || e.data !== c.data || !e.local) return false;
      const chave = chaveLocal(e.local);
      return chave.length >= 4 && texto.includes(chave);
    });

    if (candidatos.length === 1) {
      const alvo = candidatos[0];
      if (!alvo.confirmadoPor.includes(c.id)) alvo.confirmadoPor.push(c.id);
      if (!alvo.fontes.some((f) => f.url === c.url)) alvo.fontes.push(fonteDe(c));
    } else if (citaPresidente(`${c.titulo} ${c.resumo}`, mandato)) {
      novos.push(eventoDe(c));
    }
  }
  return [...saida, ...novos];
}
