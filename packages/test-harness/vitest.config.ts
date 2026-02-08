import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: resolve(__dirname, '..', '..'),
  resolve: {
    alias: {
      '@susurrare/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    include: ['packages/test-harness/src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      all: true,
      include: ['packages/test-harness/src/**/*.ts', 'packages/core/src/**/*.ts'],
      exclude: ['packages/test-harness/src/openai.real.spec.ts'],
    },
  },
});
