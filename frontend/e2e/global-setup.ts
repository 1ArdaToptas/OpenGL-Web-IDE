import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = "8799"; // kullanıcının 8765'teki servisiyle çakışmasın
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Geçici workspace ile backend'i başlatır, konsoldaki #token URL'sini testlere OGLIDE_E2E_URL olarak verir. */
export default async function globalSetup() {
  if (!existsSync(join(REPO, "frontend", "dist", "index.html"))) {
    throw new Error("Önce `npm run build` (veya `npm run e2e`) çalıştırın.");
  }
  const python = join(REPO, ".venv", "Scripts", "python.exe");
  const workspace = mkdtempSync(join(tmpdir(), "oglide-e2e-"));
  const proc = spawn(python, ["-m", "backend", "--port", PORT, "--workspace", workspace], {
    cwd: REPO,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });

  let log = "";
  const url = await new Promise<string>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error(`Backend 20 sn içinde başlamadı:\n${log}`)), 20_000);
    const onData = (d: Buffer) => {
      log += d.toString();
      const m = log.match(/(http:\/\/127\.0\.0\.1:\d+\/#token=\S+)/);
      if (m && log.includes("Uvicorn running")) {
        clearTimeout(timer);
        ok(m[1]);
      }
    };
    // Borular sürekli boşaltılmalı; dolarsa backend log yazarken bloklanır.
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", (code) => fail(new Error(`Backend çıktı (kod ${code}):\n${log}`)));
  });

  process.env.OGLIDE_E2E_URL = url;
  return async () => {
    proc.kill(); // alt süreçler Job Object (KILL_ON_JOB_CLOSE) ile birlikte ölür
    // Sonlandırılan program exe'si birkaç yüz ms kilitli kalabilir (EBUSY): yeniden dene.
    rmSync(workspace, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  };
}
