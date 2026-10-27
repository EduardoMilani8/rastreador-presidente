import { avisarFalha } from './avisar-falha';
import { montarHoje } from './comum';
import { carregarFalas } from './dados';
import { montarPaginaFalas } from './falas';

async function iniciar(): Promise<void> {
  const agora = new Date();
  montarHoje(document, agora);
  montarPaginaFalas(document, await carregarFalas(), agora, location.search);
}

iniciar().catch((err: unknown) => avisarFalha(document, err));
