import { join } from 'node:path';
import { carregarMandatos } from '../config';
import { buscarTexto } from '../shared/http';
import { dataSaoPaulo } from '../shared/text';
import { atualizar, retroagir, LIMITE_FALHA_PERSISTENTE_MS, type Deps } from './run';

async function main(): Promise<void> {
  const [comando, a, b] = process.argv.slice(2);
  const deps: Deps = {
    buscar: (url, accept) => buscarTexto(url, accept, { pausaMs: 1000, contato: process.env.CONTATO_URL }),
    agora: () => new Date(),
    dataDir: join(process.cwd(), 'data'),
    mandatos: await carregarMandatos(),
  };

  if (comando === 'update') {
    const r = await atualizar(deps);
    console.log(`Atualização concluída: ${r.arquivosEscritos} arquivo(s) alterado(s).`);
    for (const [fonte, erro] of Object.entries(r.errosDestaExecucao)) console.error(`Falha em ${fonte}: ${erro}`);
    if (r.falhasPersistentes.length > 0) {
      const horas = LIMITE_FALHA_PERSISTENTE_MS / 3_600_000;
      console.error(`Fontes com falha há mais de ${horas} horas: ${r.falhasPersistentes.join(', ')}`);
      process.exit(1);
    }
  } else if (comando === 'backfill') {
    const de = a ?? '2023-01-01';
    const ate = b ?? dataSaoPaulo(new Date());
    console.log(`Carga histórica de ${de} até ${ate} (1 requisição por segundo; pode demorar).`);
    const falhas = await retroagir(deps, de, ate, (d) => console.log(`  gravado até ${d}`));
    if (falhas.length > 0) console.error(`Dias com falha (rode de novo para eles): ${falhas.join(', ')}`);
  } else {
    console.error('Uso: cli.ts update | backfill [AAAA-MM-DD de] [AAAA-MM-DD até]');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
