import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

// Testes automatizados (npm test): banco, categorias, mescla do scanner e filtros da biblioteca.
// Rodam em Node puro, com o Electron trocado por um dublê (tests/helpers/electron-mock.ts);
// nada aqui abre janela nem toca em %APPDATA%\Lazulium.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true
  }
});
