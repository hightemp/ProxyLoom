import { defineConfig } from 'vitest/config'

// PL-144 spike runner: real browsers against local SOCKS5 fixtures. Not part of CI suites.
export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 60_000,
    include: ['spikes/socks5/**/*.spike.ts'],
    sequence: { concurrent: false },
    testTimeout: 120_000,
  },
})
