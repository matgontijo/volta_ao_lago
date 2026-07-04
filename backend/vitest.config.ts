import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    // Testes de integração compartilham o mesmo banco — nada de paralelismo.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
