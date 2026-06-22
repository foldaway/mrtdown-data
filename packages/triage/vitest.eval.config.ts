import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/eval.test.ts'],
    testTimeout: 120_000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
