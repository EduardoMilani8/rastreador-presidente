import './zod-sem-eval';
import { avisarFalha } from './avisar-falha';
import { montarHoje } from './comum';
import { contarVisita } from './contagem';
import { carregarDados } from './dados';
import { montarNoticias } from './noticias';

async function iniciar(): Promise<void> {
  const agora = new Date();
  montarHoje(document, agora);
  montarNoticias(document, await carregarDados({}, { noticias: true }), agora);
}

contarVisita();
iniciar().catch((err: unknown) => avisarFalha(document, err));
