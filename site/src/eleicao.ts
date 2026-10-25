import { dataSaoPaulo, urlHttpsSegura } from '../../src/shared/text';

export interface ResultadoEleicao {
  /** Nome como o TSE divulga o presidente eleito. */
  eleito: string;
  /** Página do TSE (ou outra fonte oficial) que declara o resultado. Sem ela, o nome não aparece no site. */
  fonteUrl: string;
}

export const SEGUNDO_TURNO = '2026-10-25';
export const POSSE = '2027-01-01';
const TSE_RESULTADOS = 'https://resultados.tse.jus.br/';

/**
 * Preencher SÓ depois de o TSE declarar o resultado, com o endereço oficial que o comprova. Enquanto for `null`, o
 * aviso não diz quem ganhou: na dúvida, omitir é melhor do que afirmar.
 */
export const RESULTADO: ResultadoEleicao | null = null;

const dataBr = (iso: string) => iso.split('-').reverse().join('/');

export interface AvisoEleicao { texto: string; linkRotulo: string; linkUrl: string }

/** `hoje` é a data de São Paulo (AAAA-MM-DD). Depois da posse o aviso some. */
export function avisoEleicao(hoje: string, resultado: ResultadoEleicao | null = RESULTADO): AvisoEleicao | null {
  if (hoje >= POSSE) return null;
  const fonte = resultado ? urlHttpsSegura(resultado.fonteUrl) : null;
  if (resultado && fonte) {
    return {
      texto: `Eleição presidencial: ${resultado.eleito} foi eleito(a) no 2º turno, segundo o TSE. `
        + `Até a posse, em ${dataBr(POSSE)}, o rastreador segue o atual presidente; a partir daí, passa a acompanhar ${resultado.eleito}.`,
      linkRotulo: 'Resultado oficial (TSE)',
      linkUrl: fonte,
    };
  }
  const turno = hoje < SEGUNDO_TURNO ? `será em ${dataBr(SEGUNDO_TURNO)}`
    : hoje === SEGUNDO_TURNO ? `é hoje, ${dataBr(SEGUNDO_TURNO)}`
      : `foi em ${dataBr(SEGUNDO_TURNO)}`;
  return {
    texto: `Eleição presidencial: o 2º turno ${turno}. O resultado oficial é divulgado pelo TSE. `
      + `O rastreador segue o atual presidente até a posse, em ${dataBr(POSSE)}; a partir daí, passa a acompanhar o presidente eleito.`,
    linkRotulo: 'Resultado oficial (TSE)',
    linkUrl: TSE_RESULTADOS,
  };
}

export function montarAvisoEleicao(doc: Document, agora: Date): void {
  const el = doc.getElementById('aviso-eleicao');
  if (!el) return;
  const aviso = avisoEleicao(dataSaoPaulo(agora));
  el.replaceChildren();
  el.hidden = aviso === null;
  if (!aviso) return;
  const link = doc.createElement('a');
  link.href = aviso.linkUrl;
  link.rel = 'noopener noreferrer';
  link.textContent = aviso.linkRotulo;
  el.append(`${aviso.texto} `, link);
}
