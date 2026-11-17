import { defineConfig } from "@playwright/test";

// Tarayıcı modu E2E (ADR-019): backend YOK — derlenmiş site statik sunulur, derleme/çalıştırma tarayıcıda.
export default defineConfig({
  testDir: "e2e-web",
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  webServer: {
    command: "npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  // Varsayılan Edge; Firefox ve WebKit (Safari motoru) `npm run e2e:web:all` ile.
  projects: [
    { name: "edge", use: { browserName: "chromium", channel: "msedge" } },
    { name: "firefox", use: { browserName: "firefox" } },
    // Playwright'ın Windows WebKit'inde OffscreenCanvas yok (gerçek Safari 17+'da var): yalnız çizim gerektirmeyenler
    { name: "webkit", use: { browserName: "webkit" }, grep: /@tum-tarayicilar/ },
  ],
});
