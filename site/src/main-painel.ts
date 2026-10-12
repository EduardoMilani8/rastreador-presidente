import { avisarFalha } from './avisar-falha';
import { destinoAntigo } from './redirecionar';

// Esta entrada fica minúscula de propósito: o redirecionamento dos endereços antigos não espera o resto do código.
const destino = destinoAntigo(window.location.search, window.location.hash);

if (destino) {
  window.location.replace(destino);
} else {
  import('./painel-inicio')
    .then((m) => m.iniciarPainel())
    .catch((err: unknown) => avisarFalha(document, err));
}
