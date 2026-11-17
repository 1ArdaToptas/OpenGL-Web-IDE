// Derlenmiş WebAssembly programını sayfadaki <canvas> üzerinde çalıştırır.
import { LegacyGL } from "./gl.js";
import { Glut, MainLoopStarted } from "./glut.js";
import { Exit, createWasi } from "./wasi.js";

/**
 * @returns {Promise<{ stop: () => void, done: Promise<{ code: number, reason: string }> }>}
 */
export async function runProgram({ wasm, canvas, env = {}, stdout, stderr, onTitle }) {
  let instance;
  let finish;
  const done = new Promise((resolve) => (finish = resolve));
  let finished = false;
  const end = (code, reason) => {
    if (finished) return;
    finished = true;
    glut.stop();
    finish({ code, reason });
  };

  const memory = () => instance.exports.memory;
  const table = () => instance.exports.__indirect_function_table;
  const malloc = (n) => instance.exports.malloc(n);

  const onProgramError = (e) => {
    if (e instanceof Exit) return end(e.code, "exit");
    stderr(`\nÇalışma hatası: ${e.message}\n`); // ör. bellek dışı erişim, sıfıra bölme tuzağı
    end(1, "error");
  };
  const glut = new Glut(canvas, { memory, table, onTitle, onCallbackError: onProgramError, onLeave: () => end(0, "exit") });
  const gl = new LegacyGL(canvas, { memory, malloc, onWarning: (m) => stderr(`uyarı: ${m}\n`) });
  const wasi = createWasi({ args: ["program"], env, stdout, stderr, memory });

  const module = await WebAssembly.compile(wasm);
  const env_ = { ...gl.imports(), ...glut.imports() };
  // Taklit edilmeyen bir fonksiyon çağrılırsa açık hata ver (bağlama başarısız olmasın).
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module === "env" && !(imp.name in env_)) {
      env_[imp.name] = () => {
        throw new Error(`${imp.name} bu ortamda desteklenmiyor`);
      };
    }
  }
  instance = await WebAssembly.instantiate(module, { env: env_, wasi_snapshot_preview1: wasi });

  try {
    instance.exports._start();
    end(0, "exit"); // main glutMainLoop çağırmadan döndü
  } catch (e) {
    if (!(e instanceof MainLoopStarted)) onProgramError(e);
  }
  return { stop: () => end(1, "killed"), done };
}
