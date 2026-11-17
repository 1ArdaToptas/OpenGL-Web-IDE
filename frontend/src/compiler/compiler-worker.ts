/// <reference lib="webworker" />
// Derleyici Worker'ı: clang/LLD (WebAssembly, @yowasp/clang) sanal dosya sisteminde çalışır.
// Projenin dosyaları + OpenGL/GLUT taklit başlıkları (oglide/include/GL) verilir; çıktı app.wasm.
import * as yowasp from "@yowasp/clang";

declare const self: DedicatedWorkerGlobalScope;

// Paket runClang'i dışa aktarır (README) ama tip tanımında (api.d.ts) yoktur.
type Progress = { doneLength: number; totalLength: number };
const runClang = (yowasp as unknown as {
  runClang: (
    args: string[],
    files: Record<string, unknown>,
    options: { stdout: (b: Uint8Array | null) => void; stderr: (b: Uint8Array | null) => void; fetchProgress: (p: Progress) => void },
  ) => Promise<Record<string, unknown>>;
}).runClang;

// Taklit başlıkları: GL/ (legacy), glad/ ve GLFW/ (modern) — sanal dosya sisteminde oglide/include altına.
const headerFiles = import.meta.glob("./include/**/*.h", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;
type Tree = { [name: string]: Tree | string };
const include: Tree = {};
for (const [path, text] of Object.entries(headerFiles)) {
  const parts = path.replace("./include/", "").split("/");
  let node = include;
  for (const dir of parts.slice(0, -1)) node = (node[dir] ??= {}) as Tree;
  node[parts.at(-1)!] = text;
}

self.onmessage = async (e: MessageEvent<{ id: number; files: Record<string, unknown>; args: string[] }>) => {
  const { id, files, args } = e.data;
  const t0 = performance.now();
  const decoder = new TextDecoder();
  let output = "";
  const collect = (bytes: Uint8Array | null) => {
    if (bytes) output += decoder.decode(bytes, { stream: true });
  };
  try {
    const result = await runClang(args, { ...files, oglide: { include } }, {
      stdout: collect,
      stderr: collect,
      fetchProgress: ({ doneLength, totalLength }) =>
        self.postMessage({ progress: totalLength ? doneLength / totalLength : 0 }),
    });
    const wasm = result["app.wasm"] as Uint8Array;
    self.postMessage({ id, ok: true, wasm, output, ms: performance.now() - t0 }, [wasm.buffer]);
  } catch (err) {
    // Derleme hatası (clang sıfır dışı çıkış) — çıktı teşhisleri içerir
    if (!output) output = err instanceof Error ? err.message : String(err);
    self.postMessage({ id, ok: false, output, ms: performance.now() - t0 });
  }
};
