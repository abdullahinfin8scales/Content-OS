import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The site's Content-Security-Policy only lets the page talk to its own
 * address. The cloud copy lives at the Supabase project's address, so the
 * build writes that origin into dist/_headers (placeholder: __SUPABASE_ORIGIN__).
 * Taking it from the same setting the app uses means the two can't drift apart.
 */
function supabaseCsp(supabaseUrl: string): Plugin {
  return {
    name: 'supabase-csp',
    apply: 'build',
    closeBundle() {
      const file = resolve(__dirname, 'dist/_headers');
      if (!existsSync(file)) return;
      let origin = '';
      if (supabaseUrl) {
        const url = new URL(supabaseUrl);
        if (url.protocol !== 'https:') throw new Error(`VITE_SUPABASE_URL must be https: ${supabaseUrl}`);
        origin = url.origin;
      }
      const text = readFileSync(file, 'utf8');
      const out = origin ? text.replaceAll('__SUPABASE_ORIGIN__', origin) : text.replaceAll(' __SUPABASE_ORIGIN__', '');
      if (out.includes('__SUPABASE_ORIGIN__')) throw new Error('dist/_headers: Supabase placeholder left over');
      writeFileSync(file, out);
    },
  };
}

// Static SPA with hash routing: the build output in dist/ can be hosted anywhere
// (or opened via `npm run preview`) without server-side rewrites.
//
// `--mode artifact` builds the claude.ai preview: one chunk, every asset inlined
// as a data: URI, so scripts/build-preview.mjs can pack it into a single page.
export default defineConfig(({ mode }) => {
  const preview = mode === 'artifact';
  const env = loadEnv(mode, __dirname, 'VITE_');
  return {
    base: './',
    plugins: [react(), tailwindcss(), ...(preview ? [] : [supabaseCsp(env.VITE_SUPABASE_URL ?? '')])],
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
