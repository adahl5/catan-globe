import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 15_000,
  // Run tests serially — they share a single server instance and rooms are
  // scoped to WebSocket connections, so parallelism would only add noise.
  fullyParallel: false,
  workers: 1,
  use: {
    headless: true,
    // All WebSocket tests connect here; individual tests can override.
    baseURL: 'http://localhost:3001',
  },
  webServer: {
    // Start the Express/WS server on a dedicated test port so it doesn't
    // collide with a local dev server on 3000.
    command: 'PORT=3001 node server.mjs',
    port: 3001,
    // Re-use a running server in local dev for faster iteration;
    // always start fresh in CI.
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
