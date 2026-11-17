// Tarayıcıda C/C++ → WebAssembly derleme istemcisi. Derleyici (clang, ~19 MB sıkıştırılmış) ayrı bir
// Worker'da çalışır ve yalnızca ilk kullanımda indirilir; sonra tarayıcı önbelleğinden gelir.
import type { BuildSettings, Diagnostic } from "../lib/types";
import { parseDiagnostics } from "./diagnostics";

export interface CompileResult {
  ok: boolean;
  wasm?: Uint8Array;
  output: string;
  diagnostics: Diagnostic[];
  durationMs: number;
}

type Tree = { [name: string]: Tree | string };

const SOURCE = /^src\/.+\.(c|cpp)$/;

/** Derleyici argümanları (yalnızca beyaz listedeki ayarlar; kullanıcı serbest bayrak veremez). */
export function compileArgs(paths: string[], s: BuildSettings): string[] {
  const sources = paths.filter((p) => SOURCE.test(p)).sort();
  const cxx = sources.some((p) => p.endsWith(".cpp"));
  const warnings = s.warnings === "default" ? [] : s.warnings === "all" ? ["-Wall"] : ["-Wall", "-Wextra"];
  return [
    cxx ? "clang++" : "clang",
    "--target=wasm32-wasip1",
    s.config === "Release" ? "-O2" : "-O0",
    cxx ? `-std=c++${s.cxx_std ?? "17"}` : `-std=c${s.c_std ?? "17"}`,
    ...(cxx ? ["-fno-exceptions"] : []),
    ...warnings,
    "-fdiagnostics-color=never",
    "-Ioglide/include",
    "-Isrc",
    ...sources,
    "-o",
    "app.wasm",
    "-Wl,--allow-undefined", // gl*/glut* fonksiyonları JavaScript taklidinden içe aktarılır
    "-Wl,--export-table", // geri çağırma işaretçileri için fonksiyon tablosu
    "-Wl,--export=malloc", // glGetString dizeleri için bellek
  ];
}

function toTree(files: Record<string, string>): Tree {
  const root: Tree = {};
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split("/");
    let node = root;
    for (const dir of parts.slice(0, -1)) node = (node[dir] ??= {}) as Tree;
    node[parts.at(-1)!] = content;
  }
  return root;
}

const defaultWorker = () => new Worker(new URL("./compiler-worker.ts", import.meta.url), { type: "module" });

export class BrowserCompiler {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: CompileResult) => void>();

  constructor(
    private createWorker: () => Worker = defaultWorker,
    private onProgress?: (done: number, total: number) => void,
  ) {}

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = this.createWorker();
      this.worker.onmessage = (e: MessageEvent) => {
        const m = e.data as { id?: number; progress?: { done: number; total: number }; ok?: boolean; wasm?: Uint8Array; output?: string; ms?: number };
        if (m.progress) return this.onProgress?.(m.progress.done, m.progress.total);
        const resolve = this.pending.get(m.id!);
        if (!resolve) return;
        this.pending.delete(m.id!);
        const output = m.output ?? "";
        resolve({ ok: !!m.ok, wasm: m.wasm, output, diagnostics: parseDiagnostics(output), durationMs: Math.round(m.ms ?? 0) });
      };
    }
    return this.worker;
  }

  compile(files: Record<string, string>, settings: BuildSettings): Promise<CompileResult> {
    const id = this.nextId++;
    const args = compileArgs(Object.keys(files), settings);
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ensureWorker().postMessage({ id, files: toTree(files), args });
    });
  }
}
