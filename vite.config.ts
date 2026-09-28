import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    {
      name: 'license-notice',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'LICENSE',
          source: readFileSync(new URL('./LICENSE', import.meta.url), 'utf-8'),
        });
      },
    },
  ],
  build: {
    outDir: 'dist'
  }
});
