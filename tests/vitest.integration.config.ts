import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    // Contracts share one local PostgreSQL instance and clean tenant fixtures after each file.
    maxWorkers: 1,
  },
});
