// Recalcula os arquivos derivados (data/resumo.json etc.) a partir do que já está em data/eventos, sem consultar
// nenhuma fonte. O `npm run update` já faz isso a cada coleta; este script serve para gerar os arquivos uma vez
// depois de mudar uma regra. Uso: npx tsx scripts/gerar-derivados.ts [pasta de dados]
import { gravarDerivados } from '../src/pipeline/derivados';
import { lerEventos } from '../src/pipeline/store';

const dir = process.argv[2] ?? 'data';
const eventos = await lerEventos(dir);
const alterados = await gravarDerivados(dir, eventos);
console.log(`${eventos.length} eventos lidos de ${dir}; ${alterados} arquivo(s) derivado(s) alterado(s).`);
