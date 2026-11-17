import { describe, expect, it } from "vitest";
import { browserSupport, supportMessage } from "./support";

const full = {
  WebAssembly: { Suspending: class {}, promising: () => {} },
  Worker: class {},
  OffscreenCanvas: class {},
  HTMLCanvasElement: { prototype: { transferControlToOffscreen() {} } },
  webgl2: true,
};

describe("browserSupport", () => {
  it("tam destekli tarayıcıda eksik yok", () => {
    expect(browserSupport(full)).toEqual({ missing: [], modern: true });
  });

  it("OffscreenCanvas yoksa çalıştırma eksik sayılır", () => {
    const s = browserSupport({ ...full, OffscreenCanvas: undefined });
    expect(s.missing).toEqual(["OffscreenCanvas"]);
  });

  it("canvas aktarımı yoksa da OffscreenCanvas eksik", () => {
    const s = browserSupport({ ...full, HTMLCanvasElement: { prototype: {} } });
    expect(s.missing).toEqual(["OffscreenCanvas"]);
  });

  it("WebGL2 ve WebAssembly eksikleri listelenir", () => {
    const s = browserSupport({ ...full, WebAssembly: undefined, webgl2: false });
    expect(s.missing).toEqual(["WebAssembly", "WebGL2"]);
  });

  it("JSPI yoksa yalnız modern profil kapalı", () => {
    expect(browserSupport({ ...full, WebAssembly: {} })).toEqual({ missing: [], modern: false });
  });
});

describe("supportMessage", () => {
  it("tam destekte mesaj yok", () => {
    expect(supportMessage({ missing: [], modern: true })).toBeNull();
  });
  it("eksikleri ve önerilen tarayıcıları söyler", () => {
    expect(supportMessage({ missing: ["OffscreenCanvas"], modern: true })).toBe(
      "Bu tarayıcı programları çalıştıramaz (eksik: OffscreenCanvas). Güncel Chrome, Edge veya Firefox kullanın.",
    );
  });
  it("yalnız JSPI eksikse modern profil uyarısı", () => {
    expect(supportMessage({ missing: [], modern: false })).toBe(
      "Bu tarayıcıda yalnız Legacy (GLUT) projeleri çalışır; Modern (GLFW) için WebAssembly JSPI gerekir (güncel Chrome, Edge veya Firefox).",
    );
  });
});
