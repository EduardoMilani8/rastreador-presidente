import { carregarDados } from './dados';
import { montarNoticias } from './noticias';

async function iniciar(): Promise<void> {
  montarNoticias(document, await carregarDados({}, { noticias: true }), new Date());
}

iniciar().catch((err: unknown) => {
  console.error(err);
  const aviso = document.getElementById('aviso-fontes');
  if (aviso) {
    aviso.textContent = 'Não foi possível carregar os dados agora. Tente novamente em instantes.';
    aviso.hidden = false;
  }
});
