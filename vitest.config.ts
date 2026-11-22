import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Full timetable reconstruction suites are CPU and memory intensive.
    maxWorkers: 2,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/triage/src/**/eval.test.ts',
    ],
  },
});
