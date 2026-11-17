// clang ve wasm-ld çıktısından editör işaretleri (backend'deki engine/diagnostics.py'nin tarayıcı karşılığı).
import type { Diagnostic } from "../lib/types";

const COMPILER = /^(.+?):(\d+):(?:(\d+):)? (fatal error|error|warning|note): (.*)$/;
const LINKER = /^wasm-ld: error: (?:.*?: )?(undefined symbol: .*)$/;

export function parseDiagnostics(output: string): Diagnostic[] {
  const result: Diagnostic[] = [];
  for (const raw of output.split("\n")) {
    const line = raw.replace(/\r$/, "");
    let m = COMPILER.exec(line);
    if (m) {
      result.push({
        file: m[1].replace(/\\/g, "/"),
        line: Number(m[2]),
        col: Number(m[3] ?? 0),
        severity: m[4] === "fatal error" ? "error" : (m[4] as Diagnostic["severity"]),
        message: m[5],
      });
      continue;
    }
    m = LINKER.exec(line);
    if (m) result.push({ file: "", line: 0, col: 0, severity: "error", message: m[1] });
  }
  return result;
}
