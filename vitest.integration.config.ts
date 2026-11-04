import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    // Firefox suites share the Remote Agent port, so files must not run concurrently.
    fileParallelism: false,
    hookTimeout: 30_000,
    sequence: {
      concurrent: false,
    },
  },
})
