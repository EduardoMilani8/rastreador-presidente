import { dataSaoPaulo } from '../../src/shared/text';
import { irParaAncora, montar } from './app';
import { carregarDados } from './dados';
import { lerFiltros } from './params';

async function iniciar(): Promise<void> {
  const filtros = lerFiltros(window.location.search);
  const agora = new Date();
  montar(document, await carregarDados(filtros), filtros, dataSaoPaulo(agora), agora);
  // Os itens só existem depois de montar: o navegador já tentou (e não achou) a âncora do endereço.
  irParaAncora(document, window.location.hash);
}

iniciar().catch((err: unknown) => {
  console.error(err);
  const aviso = document.getElementById('aviso-fontes');
  if (aviso) {
    aviso.textContent = 'Não foi possível carregar os dados agora. Tente novamente em instantes.';
    aviso.hidden = false;
  }
});
