import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Bibliotecas grandes do renderer em arquivos próprios: mudam pouco entre versões e o arquivo principal fica
// menor. Casa pelo caminho no node_modules (vale para Windows e para subpastas como react-dom/client).
// Libs pequenas (zustand) ficam no arquivo principal: um chunk de 1 kB só acrescentaria um pedido.
const VENDOR_CHUNKS: Record<string, RegExp> = {
  react: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
  icons: /[\\/]node_modules[\\/]lucide-react[\\/]/
};

function vendorChunk(id: string): string | undefined {
  for (const [name, pattern] of Object.entries(VENDOR_CHUNKS)) {
    if (pattern.test(id)) return name;
  }
  return undefined;
}

// Main e preload: as dependências de `dependencies` ficam de fora do bundle (externalizeDeps, padrão do
// electron-vite) e são lidas do node_modules empacotado. Sem minificação, para o lazulium.log mostrar
// nomes de função legíveis nos erros.
export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'vite-plugin-dev-csp',
        apply: 'serve',
        transformIndexHtml(html) {
          return html.replace(
            /<meta[\s\S]*?http-equiv=["']Content-Security-Policy["'][\s\S]*?>/i,
            (meta) =>
              meta
                .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
                .replace("connect-src 'self' https:", "connect-src 'self' https: ws:")
          );
        }
      }
    ],
    // Só vale para `electron-vite build`: o modo dev usa o servidor do Vite e ignora este bloco
    build: {
      // O electron-vite desliga a minificação por padrão; no renderer ela reduz o JS e o CSS pela metade
      minify: 'esbuild',
      cssMinify: 'esbuild',
      sourcemap: false,
      // Páginas abertas com React.lazy viram arquivos próprios; o aviso só aparece se um deles passar disto
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        output: {
          manualChunks: vendorChunk
        }
      }
    }
  }
});
