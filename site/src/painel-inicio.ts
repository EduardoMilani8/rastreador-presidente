import { montarComum } from './comum';
import { carregarDados } from './dados';
import { montarPainel } from './painel';

/** Data de hoje no horário de Brasília, como AAAA-MM-DD. */
function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

export async function iniciarPainel(): Promise<void> {
  const agora = new Date();
  const dados = await carregarDados({}, { resumo: true });
  montarComum(document, dados, agora);
  montarPainel(document, dados, hojeEmSaoPaulo(agora), agora);
}
