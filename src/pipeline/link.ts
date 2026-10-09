import { citaPresidente, type Comunicado } from '../collectors/planalto';
import type { Evento, Fonte, Mandato } from '../shared/schema';
import { normalizar } from '../shared/text';

function chaveLocal(local: string): string {
  return normalizar(local).replace(/\s*[-–/,(]\s*[a-z]{2}\)?$/, '').trim();
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A chave só casa como palavra/expressão inteira: "natal" não casa "natalicio".
function contemChave(texto: string, chave: string): boolean {
  return new RegExp(`(?<![a-z0-9])${escaparRegex(chave)}(?![a-z0-9])`).test(texto);
}

function fonteDe(c: Comunicado): Fonte {
  return { nome: 'comunicado-planalto', rotulo: 'Planalto (governo)', url: c.url, coletadoEm: c.coletadoEm };
}

function eventoDe(c: Comunicado): Evento {
  return {
    id: c.id, tipo: 'comunicado', data: c.data, titulo: c.titulo, status: 'publicado',
    ementa: c.resumo || undefined, fontes: [fonteDe(c)], confirmadoPor: [], historico: [],
  };
}

export interface OpcoesLigacao {
  /**
   * Padrão: false. Verificado com o feed real (set/2026): os 30 itens do feed do Planalto são avisos de pauta
   * ("Agenda será às 14h30..."), publicados 1–2 dias ANTES do evento (dc:date = "Publicado em"). Um aviso não prova
   * que o compromisso aconteceu; ligá-lo marcaria uma previsão como "Realizado". A regra (dia + local) fica
   * implementada e testada para o dia em que houver uma fonte pós-evento, mas desligada.
   */
  ligarNaAgenda?: boolean;
}

export function ligarComunicados(
  eventos: Evento[], comunicados: Comunicado[], mandato: Mandato, opcoes: OpcoesLigacao = {},
): Evento[] {
  const ligarNaAgenda = opcoes.ligarNaAgenda ?? false;
  const saida = eventos.map((e) => ({ ...e, fontes: [...e.fontes], confirmadoPor: [...e.confirmadoPor] }));
  const novos: Evento[] = [];
  const vistos = new Set<string>();

  for (const c of comunicados) {
    // Mesmo id repetido no lote: o primeiro vence (o id do feed é só o último trecho da URL).
    if (vistos.has(c.id)) continue;
    vistos.add(c.id);
    // Já tratado antes: virou item próprio ou já confirma algum compromisso.
    if (saida.some((e) => e.id === c.id || e.confirmadoPor.includes(c.id))) continue;
    const texto = normalizar(`${c.titulo} ${c.resumo}`);
    const candidatos = !ligarNaAgenda ? [] : saida.filter((e) => {
      if (e.tipo !== 'agenda' || e.removidoEm || e.data !== c.data || !e.local) return false;
      const chave = chaveLocal(e.local);
      return chave.length >= 4 && contemChave(texto, chave);
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
