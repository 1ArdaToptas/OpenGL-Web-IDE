// Spike: tarayıcıda kullanılacak derleyici (@yowasp/clang) ile şablon programını Node'da WebAssembly'ye derler.
// Kullanım: node compile_node.mjs <yowasp_node_modules> <main.c> <çıktı.wasm>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [nodeModules, source, out] = process.argv.slice(2);
const { runClang } = await import(pathToFileURL(join(nodeModules, "@yowasp", "clang", "gen", "bundle.js")).href);

// Sanal dosya sistemi: kaynak + taklit başlıklar (/oglide/include/GL/*.h)
function tree(dir) {
  const t = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    t[e.name] = e.isDirectory() ? tree(join(dir, e.name)) : readFileSync(join(dir, e.name), "utf8");
  }
  return t;
}
const includeDir = fileURLToPath(new URL("./include", import.meta.url));
const files = { "main.c": readFileSync(source, "utf8"), oglide: { include: tree(includeDir) } };

const args = ["clang", "--target=wasm32-wasip1", "-O2", "-std=c17", "-Wall", "-Wextra", "-Ioglide/include",
  "main.c", "-o", "app.wasm",
  "-Wl,--allow-undefined",          // gl*/glut* fonksiyonları JS'ten içe aktarılır
  "-Wl,--export-table",             // geri çağırma (callback) işaretçileri için fonksiyon tablosu
  "-Wl,--export=malloc"];           // glGetString vb. dizeler için bellek ayırma

const t0 = performance.now();
let result;
try {
  result = await runClang(args, files, {
    stderr: (b) => b && process.stderr.write(b),
    fetchProgress: undefined,
  });
} catch (e) {
  console.error("derleme başarısız:", e.code ?? e);
  process.exit(1);
}
const ms = Math.round(performance.now() - t0);
writeFileSync(out, result["app.wasm"]);
const mod = await WebAssembly.compile(result["app.wasm"]);
const imports = WebAssembly.Module.imports(mod);
console.log(`derleme: ${ms} ms, wasm: ${result["app.wasm"].length} bayt`);
console.log("içe aktarımlar:", imports.map((i) => `${i.module}.${i.name}`).join(" "));
console.log("dışa aktarımlar:", WebAssembly.Module.exports(mod).map((e) => e.name).join(" "));
