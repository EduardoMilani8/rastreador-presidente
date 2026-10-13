const SVG = 'http://www.w3.org/2000/svg';
const CIRCULO = 'M8 2a6 6 0 1 0 0 12a6 6 0 0 0 0-12z';

export const ICONES = {
  relogio: `${CIRCULO}M8 4.5V8l2.5 1.5`,
  lista: 'M5.5 4.5h7M5.5 8h7M5.5 11.5h7M3 4.5h.01M3 8h.01M3 11.5h.01',
  visto: `${CIRCULO}M5.2 8.2l2 2l3.6-4`,
  documento: 'M4 1.5h5.5L12 4v10.5H4zM9.5 1.5V4H12M6 8h4M6 11h4',
  balao: 'M2.5 3h11v7.5H7l-3 2.5v-2.5H2.5z',
  lapis: 'M3 13l.6-2.8l7-7l2.2 2.2l-7 7zM9.4 4.4l2.2 2.2',
  cortado: `${CIRCULO}M3.8 3.8l8.4 8.4`,
} as const;

export type NomeIcone = keyof typeof ICONES;

// Traço e cor vêm do CSS (.icone): a CSP proíbe o atributo style.
export function icone(doc: Document, nome: NomeIcone): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'icone');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONES[nome]);
  svg.append(path);
  return svg;
}
