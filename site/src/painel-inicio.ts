import { dataSaoPaulo } from '../../src/shared/text';
import { montarComum } from './comum';
import { carregarDados } from './dados';
import { montarPainel } from './painel';
import { montarViagens } from './viagens';

export async function iniciarPainel(): Promise<void> {
  const agora = new Date();
  const dados = await carregarDados({}, { resumo: true, viagens: true });
  montarComum(document, dados, agora);
  montarPainel(document, dados, dataSaoPaulo(agora));
  // Não bloqueia o resto da página: o contorno do mapa chega depois.
  montarViagens(document, dados.viagens).catch((err: unknown) => console.error(err));
}
