import { describe, expect, it, vi } from "vitest";
import { BrowserCompiler, compileArgs } from "./compiler";

describe("compileArgs", () => {
  it("C projesi: clang, src altındaki .c dosyaları, WASM hedefi ve taklit başlıkları", () => {
    const args = compileArgs(["src/main.c", "src/util/math.c", "src/util/math.h", "shaders/a.vert"], { config: "Debug" });
    expect(args[0]).toBe("clang");
    expect(args).toEqual(expect.arrayContaining(["--target=wasm32-wasip1", "-std=c17", "-Ioglide/include", "-Isrc",
      "src/main.c", "src/util/math.c", "-o", "app.wasm", "-Wl,--allow-undefined", "-Wl,--export-table", "-Wl,--export=malloc"]));
    expect(args).not.toContain("src/util/math.h");
    expect(args).not.toContain("shaders/a.vert");
    expect(args).toContain("-O0");
  });

  it("C++ dosyası varsa clang++ ve C++ standardı", () => {
    const args = compileArgs(["src/main.cpp"], { config: "Release", cxx_std: "20" });
    expect(args[0]).toBe("clang++");
    expect(args).toContain("-std=c++20");
    expect(args).toContain("-O2");
    expect(args).toContain("-fno-exceptions"); // WASI'de istisna desteği yok
  });

  it("uyarı seviyesi beyaz listeden", () => {
    expect(compileArgs(["src/a.c"], { warnings: "default" })).not.toContain("-Wall");
    expect(compileArgs(["src/a.c"], { warnings: "extra" })).toEqual(expect.arrayContaining(["-Wall", "-Wextra"]));
  });
});

class FakeWorker {
  posted: { id: number; files: Record<string, unknown>; args: string[] }[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(m: { id: number; files: Record<string, unknown>; args: string[] }) {
    this.posted.push(m);
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}

describe("BrowserCompiler", () => {
  it("dosyaları ağaç olarak gönderir; başarılı derlemede wasm ve teşhisleri döner", async () => {
    const worker = new FakeWorker();
    const compiler = new BrowserCompiler(() => worker as unknown as Worker);
    const p = compiler.compile({ "src/main.c": "int main(){}", "src/util/a.h": "" }, {});
    const sent = worker.posted[0];
    expect(sent.files).toMatchObject({ src: { "main.c": "int main(){}", util: { "a.h": "" } } });
    worker.emit({ id: sent.id, ok: true, wasm: new Uint8Array([1, 2]), output: "src/main.c:1:1: warning: x\n" });
    const r = await p;
    expect(r.ok).toBe(true);
    expect(r.wasm).toEqual(new Uint8Array([1, 2]));
    expect(r.diagnostics[0]).toMatchObject({ file: "src/main.c", severity: "warning" });
  });

  it("başarısız derleme ok=false ve hata teşhisi", async () => {
    const worker = new FakeWorker();
    const compiler = new BrowserCompiler(() => worker as unknown as Worker);
    const p = compiler.compile({ "src/main.c": "x" }, {});
    worker.emit({ id: worker.posted[0].id, ok: false, output: "src/main.c:1:1: error: y\n" });
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].severity).toBe("error");
  });

  it("ilerlemeyi bildirir ve eşzamanlı istekleri kimlikle ayırır", async () => {
    const worker = new FakeWorker();
    const progress = vi.fn();
    const compiler = new BrowserCompiler(() => worker as unknown as Worker, progress);
    const a = compiler.compile({ "src/a.c": "" }, {});
    const b = compiler.compile({ "src/b.c": "" }, {});
    worker.emit({ progress: { done: 5_000_000, total: 10_000_000 } });
    worker.emit({ id: worker.posted[1].id, ok: true, wasm: new Uint8Array([2]), output: "" });
    worker.emit({ id: worker.posted[0].id, ok: true, wasm: new Uint8Array([1]), output: "" });
    expect((await a).wasm).toEqual(new Uint8Array([1]));
    expect((await b).wasm).toEqual(new Uint8Array([2]));
    expect(progress).toHaveBeenCalledWith(5_000_000, 10_000_000);
  });
});
