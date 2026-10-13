import { dataSaoPaulo } from '../../src/shared/text';
import { avisarFalha } from './avisar-falha';
import { montarHoje } from './comum';
import { carregarDados } from './dados';
import { lerFiltros } from './params';
import { irParaAncora, montarRegistros } from './registros';

async function iniciar(): Promise<void> {
  const filtros = lerFiltros(window.location.search);
  const agora = new Date();
  montarHoje(document, agora);
  montarRegistros(document, await carregarDados(filtros), filtros, dataSaoPaulo(agora), agora);
  // Os itens só existem depois de montar: o navegador já tentou (e não achou) a âncora do endereço.
  irParaAncora(document, window.location.hash);
}

iniciar().catch((err: unknown) => avisarFalha(document, err));
