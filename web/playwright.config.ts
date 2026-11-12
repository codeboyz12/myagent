import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: "list",
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
