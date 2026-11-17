/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const BACKEND = "127.0.0.1:8765";

// Geliştirmede /api ve /ws backend'e aktarılır; backend `--dev-origin http://127.0.0.1:5173` ile başlatılmalı.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { allow: [".."] }, // örnek projeler depo kökündeki templates/ altından okunur
    proxy: {
      "/api": { target: `http://${BACKEND}` },
      "/ws": { target: `ws://${BACKEND}`, ws: true },
    },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 5000 },
  // Derleyici (clang WASM) kaynaklarını import.meta.url ile bulur: ön paketlenirse yollar bozulur.
  optimizeDeps: { exclude: ["@yowasp/clang"] },
  worker: { format: "es" },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
