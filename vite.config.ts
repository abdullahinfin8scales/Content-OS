import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Static SPA with hash routing: the build output in dist/ can be hosted anywhere
// (or opened via `npm run preview`) without server-side rewrites.
//
// `--mode artifact` builds the claude.ai preview: one chunk, every asset inlined
// as a data: URI, so scripts/build-preview.mjs can pack it into a single page.
export default defineConfig(({ mode }) => {
  const preview = mode === 'artifact';
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    build: preview
      ? {
          target: 'es2022',
          outDir: 'dist-preview',
          emptyOutDir: true,
          assetsInlineLimit: () => true,
          cssCodeSplit: false,
          modulePreload: false,
          chunkSizeWarningLimit: 5000,
          rollupOptions: { output: { codeSplitting: false } },
        }
      : {
          target: 'es2022',
          chunkSizeWarningLimit: 1200,
        },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});
