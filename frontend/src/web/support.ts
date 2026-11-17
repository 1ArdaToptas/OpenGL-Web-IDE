// Tarayıcı modunun ihtiyaç duyduğu özellikler. Eksikse program sessizce boş ekranda kalmasın; açılışta söyle.
export interface Support {
  /** Derleme/çalıştırmayı tümden engelleyen eksikler */
  missing: string[];
  /** Modern (GLFW) profil: while döngüsü JSPI ister */
  modern: boolean;
}

interface Env {
  WebAssembly?: { Suspending?: unknown; promising?: unknown };
  Worker?: unknown;
  OffscreenCanvas?: unknown;
  HTMLCanvasElement?: { prototype: { transferControlToOffscreen?: unknown } };
  webgl2: boolean;
}

export function currentEnv(): Env {
  let webgl2 = false;
  try {
    webgl2 = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    /* yok */
  }
  const g = globalThis as unknown as Env;
  return {
    WebAssembly: g.WebAssembly,
    Worker: g.Worker,
    OffscreenCanvas: g.OffscreenCanvas,
    HTMLCanvasElement: g.HTMLCanvasElement,
    webgl2,
  };
}

export function browserSupport(env: Env = currentEnv()): Support {
  const missing: string[] = [];
  if (!env.WebAssembly) missing.push("WebAssembly");
  if (!env.Worker) missing.push("Web Worker");
  if (!env.OffscreenCanvas || typeof env.HTMLCanvasElement?.prototype.transferControlToOffscreen !== "function") {
    missing.push("OffscreenCanvas");
  }
  if (!env.webgl2) missing.push("WebGL2");
  const modern = !!env.WebAssembly?.Suspending && !!env.WebAssembly?.promising;
  return { missing, modern };
}

export function supportMessage(s: Support): string | null {
  if (s.missing.length > 0) {
    return `Bu tarayıcı programları çalıştıramaz (eksik: ${s.missing.join(", ")}). Güncel Chrome, Edge veya Firefox kullanın.`;
  }
  if (!s.modern) {
    return "Bu tarayıcıda yalnız Legacy (GLUT) projeleri çalışır; Modern (GLFW) için WebAssembly JSPI gerekir (güncel Chrome, Edge veya Firefox).";
  }
  return null;
}
