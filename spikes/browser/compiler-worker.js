// Derleyici ayrı iş parçacığında: ~100 MB clang/LLVM (WebAssembly) sayfayı dondurmadan yüklenir ve çalışır.
import { runClang } from "./node_modules/@yowasp/clang/gen/bundle.js";

const HEADERS = ["gl.h", "glu.h", "glut.h", "freeglut.h"];
let headers;

async function loadHeaders() {
  if (!headers) {
    const GL = {};
    for (const name of HEADERS) GL[name] = await (await fetch(`./include/GL/${name}`)).text();
    headers = { include: { GL } };
  }
  return headers;
}

self.onmessage = async ({ data: { id, source } }) => {
  const t0 = performance.now();
  let stderr = "";
  const decoder = new TextDecoder();
  try {
    const files = { "main.c": source, oglide: await loadHeaders() };
    const result = await runClang(
      ["clang", "--target=wasm32-wasip1", "-O2", "-std=c17", "-Wall", "-Wextra", "-Ioglide/include", "main.c",
        "-o", "app.wasm", "-Wl,--allow-undefined", "-Wl,--export-table", "-Wl,--export=malloc"],
      files,
      {
        stderr: (b) => b && (stderr += decoder.decode(b, { stream: true })),
        fetchProgress: ({ doneLength, totalLength }) =>
          self.postMessage({ id, progress: totalLength ? doneLength / totalLength : 0 }),
      },
    );
    self.postMessage({ id, ok: true, wasm: result["app.wasm"], stderr, ms: performance.now() - t0 });
  } catch (e) {
    self.postMessage({ id, ok: false, stderr: stderr || String(e), ms: performance.now() - t0 });
  }
};
