import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  // The CSS is hand-written and ships no Tailwind. We use a custom
  // extension and load it as text so tsup's postcss plugin (which
  // matches *.css) and its CSS file resolution are bypassed entirely.
  // esbuild's `text` loader inlines the file contents as a default-
  // exported string at build time.
  loader: { '.tokens': 'text' },
  external: [
    'react',
    'react-dom',
    'react-markdown',
    'remark-gfm',
    'lucide-react',
    '@dicebear/collection',
    '@dicebear/core',
    'clsx',
    'tailwind-merge',
    'class-variance-authority',
    '@radix-ui/react-label',
    '@radix-ui/react-slot',
    'react-hook-form',
    '@hookform/resolvers',
    'zod',
  ],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
