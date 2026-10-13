import { copyFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const outputRoot = fileURLToPath(new URL('../_local/monad-standalone/dist/', import.meta.url));

export default defineConfig({
  base: '/monad/',
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'package-monad-portraits',
      closeBundle() {
        const artRoot = join(outputRoot, 'art', 'void-labyrinth');
        mkdirSync(artRoot, { recursive: true });
        for (const role of ['sentinel', 'archer', 'scribe', 'boss']) {
          copyFileSync(join(projectRoot, 'public', 'art', 'void-labyrinth', `${role}-v2.webp`), join(artRoot, `${role}-v2.webp`));
        }
        copyFileSync(join(projectRoot, 'public', 'logo.png'), join(outputRoot, 'logo.png'));
        renameSync(join(outputRoot, 'monad.html'), join(outputRoot, 'index.html'));
      },
    },
  ],
  build: {
    outDir: outputRoot,
    rollupOptions: { input: join(projectRoot, 'monad.html') },
  },
});
