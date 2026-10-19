import { defineConfig } from 'vitest/config'

// Its own config, so `pnpm test` never runs the bench (it can call the API).
export default defineConfig({
  test: {
    include: ['bench/explainer/**/*.test.ts'],
    environment: 'node',
  },
})
