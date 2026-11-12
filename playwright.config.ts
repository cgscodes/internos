import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: [
    {
      command: "node tests/helpers/supabase-mock.mjs",
      url: "http://127.0.0.1:54329/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run build && npm start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100/login",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_internos_test_only",
      },
    },
  ],
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
