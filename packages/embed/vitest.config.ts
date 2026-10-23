import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

/** Vite plugin: load `*.tokens` files as default-exported strings, mirroring
 *  what tsup's `loader: { '.tokens': 'text' }` does at build time. */
function tokensAsTextPlugin() {
  return {
    name: 'tokens-as-text',
    enforce: 'pre' as const,
    load(id: string) {
      if (!id.endsWith('.tokens')) return null;
      const text = fs.readFileSync(id, 'utf8');
      return `export default ${JSON.stringify(text)};`;
    },
  };
}

export default defineConfig({
  plugins: [tokensAsTextPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
