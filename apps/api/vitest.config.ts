import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Integration tests need a DynamoDB Local endpoint; they skip when absent.
    testTimeout: 15000,
  },
})
