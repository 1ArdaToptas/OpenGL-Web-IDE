/// <reference lib="webworker" />
// Programın çalıştığı Worker: WebAssembly + OpenGL/GLUT ya da GLFW taklidi + WASI, OffscreenCanvas üzerinde.
// Ana iş parçacığı (runner.ts) gerektiğinde bu Worker'ı terminate() ile anında öldürür.
import { Glfw } from "./glfw";
import { Glut, type InputEvent, MainLoopStarted } from "./glut";
import { LegacyGL } from "./legacyGL";
import { ModernGL } from "./modernGL";
import { Exit, createWasi } from "./wasi";

declare const self: DedicatedWorkerGlobalScope;

// JSPI (JavaScript Promise Integration): Chrome/Edge 137+. Modern profilde glfwSwapBuffers programı bir kare
// askıya almak için gerekir; tip tanımları henüz TypeScript'te yok.
type Jspi = typeof WebAssembly & {
  Suspending?: new (fn: (...args: never[]) => Promise<unknown>) => unknown;
  promising?: (fn: () => void) => () => Promise<void>;
};
const jspi = WebAssembly as Jspi;

let input: ((e: InputEvent) => void) | null = null;
let stopLoop: (() => void) | null = null;
let done = false;

const post = (m: unknown) => self.postMessage(m);
const out = (type: "stdout" | "stderr") => (text: string) => post({ type, text });

function exit(code: number, reason: "exit" | "error") {
  if (done) return;
  done = true;
  stopLoop?.();
  post({ type: "exit", code, reason });
}

function programError(e: unknown) {
  if (e instanceof Exit) return exit(e.code, "exit");
  if (e instanceof MainLoopStarted) return;
  // Bellek dışı erişim, sıfıra bölme vb. WebAssembly tuzakları
  post({ type: "stderr", text: `\nÇalışma hatası: ${e instanceof Error ? e.message : String(e)}\n` });
  exit(1, "error");
}

interface Start {
  wasm: ArrayBuffer;
  canvas: OffscreenCanvas;
  env: Record<string, string>;
  profile: "legacy" | "modern";
  files: Record<string, string>;
}

async function start({ wasm, canvas, env, profile, files }: Start) {
  let instance: WebAssembly.Instance;
  const exports = () => instance.exports as unknown as {
    memory: WebAssembly.Memory;
    __indirect_function_table: WebAssembly.Table;
    malloc: (n: number) => number;
    _start: () => void;
  };
  const memory = () => exports().memory;
  const table = () => exports().__indirect_function_table;
  const malloc = (n: number) => exports().malloc(n);
  const onTitle = (text: string) => post({ type: "title", text });
  const wasi = createWasi({ args: ["program"], env, stdout: out("stdout"), stderr: out("stderr"), memory, files });

  let env_: Record<string, unknown>;
  let suspending: string[] = [];
  if (profile === "modern") {
    if (!jspi.Suspending || !jspi.promising) {
      throw new Error("Modern (GLFW) profil bu tarayıcıda çalışmıyor: WebAssembly JSPI gerekir (Chrome/Edge 137+).");
    }
    const gl = new ModernGL(canvas, { memory, malloc });
    const glfw = new Glfw(canvas, {
      memory, table, onTitle,
      onResize: (width, height) => {
        gl.resize(width, height);
        post({ type: "size", width, height });
      },
    });
    input = (e) => glfw.input(e);
    env_ = { ...gl.imports(), ...glfw.imports() };
    suspending = ["glfwSwapBuffers"];
  } else {
    let gl: LegacyGL | null = null;
    const glut = new Glut(canvas, {
      memory, table, onTitle,
      onResize: (width, height) => {
        gl?.resize(width, height);
        post({ type: "size", width, height });
      },
      onCallbackError: programError,
      onLeave: () => exit(0, "exit"),
    });
    gl = new LegacyGL(canvas, { memory, malloc, onWarning: (m) => out("stderr")(`uyarı: ${m}\n`) });
    input = (e) => glut.input(e);
    stopLoop = () => glut.stop();
    env_ = { ...gl.imports(), ...glut.imports() };
  }

  const module = await WebAssembly.compile(wasm);
  // Taklit edilmeyen bir fonksiyon çağrılırsa açık hata ver (bağlama başarısız olmasın).
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module === "env" && !(imp.name in env_)) {
      env_[imp.name] = () => {
        throw new Error(`${imp.name} bu ortamda desteklenmiyor`);
      };
    }
  }
  for (const name of suspending) {
    if (name in env_) env_[name] = new jspi.Suspending!(env_[name] as (...a: never[]) => Promise<unknown>);
  }
  instance = await WebAssembly.instantiate(module, { env: env_ as WebAssembly.ModuleImports, wasi_snapshot_preview1: wasi });

  try {
    if (profile === "modern") await jspi.promising!(exports()._start)();
    else exports()._start();
    exit(0, "exit"); // main döndü (GLFW döngüsü bitti ya da GLUT glutMainLoop çağırmadı)
  } catch (e) {
    programError(e);
  }
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data as ({ type: "start" } & Start) | { type: "input"; event: InputEvent };
  if (m.type === "start") {
    start({ ...m, profile: m.profile ?? "legacy", files: m.files ?? {} }).catch((err) => {
      post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    });
  } else if (m.type === "input" && !done) {
    input?.(m.event);
  }
};
