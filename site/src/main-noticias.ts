import { avisarFalha } from './avisar-falha';
import { carregarDados } from './dados';
import { montarNoticias } from './noticias';

async function iniciar(): Promise<void> {
  montarNoticias(document, await carregarDados({}, { noticias: true }), new Date());
}

iniciar().catch((err: unknown) => avisarFalha(document, err));
