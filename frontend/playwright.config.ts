import { defineConfig } from "@playwright/test";

// E2E: gerçek backend + gerçek MSYS2 toolchain + GPU. Testler sırayla koşar (tek servis, masaüstü GL pencereleri).
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    channel: "msedge", // sistemde kurulu Edge; ayrı tarayıcı indirilmez
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
});
