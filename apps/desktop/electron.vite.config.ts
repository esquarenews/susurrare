import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['ws', 'bufferutil', 'utf-8-validate'],
        output: {
          entryFileNames: '[name].js',
        },
        input: 'src/main/index.ts',
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
        input: {
          index: 'src/preload/index.ts',
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: 'src/renderer',
  },
});
