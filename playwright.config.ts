import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    // Atlas/editor regression tests explicitly use the isolated local preview.
    // Landing-page tests override this with an empty storage state.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:5173")
            .origin,
          localStorage: [
            { name: "ms:local-preview", value: "true" },
            { name: "ms:guide:v1", value: "true" },
          ],
        },
      ],
    },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --port 5173",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
      },
  reporter: "list",
});
