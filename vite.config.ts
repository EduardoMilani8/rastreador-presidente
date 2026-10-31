import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { caminhoSeguro } from './scripts/dados-dev.ts';

// form-action 'self' (e não 'none'): o formulário de filtros de registros.html é um GET para a própria
// página; com 'none' o navegador bloquearia o envio. Todo o resto continua fechado.
// Trusted Types sem nenhuma política: o navegador recusa innerHTML, outerHTML, insertAdjacentHTML, document.write e
// afins com texto, então a regra "texto das fontes só por textContent" vale mesmo se um dia o código errar.
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; require-trusted-types-for 'script'; trusted-types 'none'";

function csp(): Plugin {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">`),
    },
  };
}

// No `npm run dev`, serve ./data em /data (no build, scripts/copy-data.mjs copia para dist/).
function dadosDev(): Plugin {
  return {
    name: 'dados-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/data', async (req, res, next) => {
        try {
          const arquivo = caminhoSeguro(resolve('data'), req.url ?? '');
          if (!arquivo) return next();
          const conteudo = await readFile(arquivo);
          res.setHeader('Content-Type', 'application/json');
          res.end(conteudo);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  root: 'site',
  base: './',
  plugins: [csp(), dadosDev()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve('site/index.html'),
        registros: resolve('site/registros.html'),
        noticias: resolve('site/noticias.html'),
        falas: resolve('site/falas.html'),
        sobre: resolve('site/sobre.html'),
      },
    },
  },
});
