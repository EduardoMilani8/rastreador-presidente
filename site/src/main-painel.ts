import { montarComum } from './comum';
import { carregarDados } from './dados';
import { destinoAntigo } from './redirecionar';

async function iniciar(): Promise<void> {
  // Antes de qualquer coisa: endereços do site de página única (links permanentes já divulgados) seguem valendo.
  const destino = destinoAntigo(window.location.search, window.location.hash);
  if (destino) {
    window.location.replace(destino);
    return;
  }
  montarComum(document, await carregarDados({}), new Date());
}

iniciar().catch((err: unknown) => {
  console.error(err);
  const aviso = document.getElementById('aviso-fontes');
  if (aviso) {
    aviso.textContent = 'Não foi possível carregar os dados agora. Tente novamente em instantes.';
    aviso.hidden = false;
  }
});
