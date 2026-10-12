import { dataSaoPaulo } from '../../src/shared/text';
import { montarComum } from './comum';
import { carregarDados } from './dados';
import { montarPainel } from './painel';

export async function iniciarPainel(): Promise<void> {
  const agora = new Date();
  const dados = await carregarDados({}, { resumo: true });
  montarComum(document, dados, agora);
  montarPainel(document, dados, dataSaoPaulo(agora));
}
