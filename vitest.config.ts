import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup/unit.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/parity/**/*.test.ts',
      'tests/performance/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/domain/**/*.ts', 'src/application/**/*.ts', 'src/storage/**/*.ts'],
      thresholds: {
        branches: 75,
        functions: 90,
        lines: 85,
        statements: 85,
      },
    },
  },
})
