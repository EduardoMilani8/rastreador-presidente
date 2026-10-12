// Gera site/src/mapa-contorno.ts a partir do TopoJSON `land-110m.json` do pacote world-atlas@2.0.2 (Natural Earth).
// Uso: node scripts/gerar-mapa.mjs <caminho para land-110m.json>
// O pacote é obtido à parte (npm pack numa pasta temporária); ele não é dependência do projeto.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LARGURA = 720;
const ALTURA = 276;
const LAT_MAX = 80;
const LAT_MIN = -58;

const entrada = process.argv[2];
if (!entrada) {
  console.error('Uso: node scripts/gerar-mapa.mjs <caminho para land-110m.json>');
  process.exit(1);
}

const topo = JSON.parse(readFileSync(entrada, 'utf8'));
const { scale, translate } = topo.transform;

// Cada arco é uma lista de deltas no espaço quantizado; o primeiro ponto é absoluto.
const arcos = topo.arcs.map((arco) => {
  let x = 0;
  let y = 0;
  return arco.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});

function arcoPorIndice(i) {
  return i >= 0 ? arcos[i] : [...arcos[~i]].reverse();
}

function anel(indices) {
  const pontos = [];
  indices.forEach((i, n) => {
    const arco = arcoPorIndice(i);
    pontos.push(...(n === 0 ? arco : arco.slice(1))); // o último ponto de um arco é o primeiro do seguinte
  });
  return pontos;
}

function geometrias(obj) {
  if (obj.type === 'GeometryCollection') return obj.geometries.flatMap(geometrias);
  return [obj];
}

const aneis = [];
for (const g of geometrias(topo.objects.land)) {
  if (g.type === 'Polygon') aneis.push(...g.arcs.map(anel));
  else if (g.type === 'MultiPolygon') for (const poligono of g.arcs) aneis.push(...poligono.map(anel));
}

const prender = (v, min, max) => Math.min(max, Math.max(min, v));

function projetar([lon, lat]) {
  const x = prender(Math.round((lon + 180) * 2), 0, LARGURA);
  const y = prender(Math.round((LAT_MAX - prender(lat, LAT_MIN, LAT_MAX)) * 2), 0, ALTURA);
  return [x, y];
}

let totalAneis = 0;
let totalPontos = 0;
const partes = [];
for (const bruto of aneis) {
  const pontos = [];
  for (const p of bruto.map(projetar)) {
    const ultimo = pontos[pontos.length - 1];
    if (!ultimo || ultimo[0] !== p[0] || ultimo[1] !== p[1]) pontos.push(p);
  }
  if (pontos.length > 1) {
    const primeiro = pontos[0];
    const ultimo = pontos[pontos.length - 1];
    if (primeiro[0] === ultimo[0] && primeiro[1] === ultimo[1]) pontos.pop(); // o Z já fecha o anel
  }
  if (pontos.length < 4) continue;
  const xs = pontos.map(([x]) => x);
  const ys = pontos.map(([, y]) => y);
  // Anel achatado pelo recorte (a Antártida vira uma linha na borda de baixo) não tem área para pintar.
  if (Math.max(...ys) === Math.min(...ys)) continue;
  // Ilha pequena cortada pela linha de data (Fiji, Wrangel) viraria um risco de um lado ao outro do mapa.
  if (pontos.length < 20 && Math.max(...xs) - Math.min(...xs) > LARGURA / 2) continue;
  totalAneis += 1;
  totalPontos += pontos.length;
  partes.push(`M${pontos.map(([x, y]) => `${x} ${y}`).join('L')}Z`);
}

const saida = `// Arquivo gerado por scripts/gerar-mapa.mjs a partir do pacote world-atlas@2.0.2 (land-110m.json).
// Os dados são do Natural Earth (domínio público). Não edite à mão: rode o script de novo.
// Projeção equirretangular recortada: x = (lon + 180) * 2, y = (80 - lat) * 2, latitudes de 80 a -58.
export const LARGURA = ${LARGURA};
export const ALTURA = ${ALTURA};
export const TERRA = '${partes.join('')}';
`;

writeFileSync(resolve('site/src/mapa-contorno.ts'), saida);
console.log(`${totalAneis} anéis, ${totalPontos} pontos, ${saida.length} bytes`);
