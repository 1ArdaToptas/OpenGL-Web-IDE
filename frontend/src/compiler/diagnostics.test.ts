import { describe, expect, it } from "vitest";
import { parseDiagnostics } from "./diagnostics";

const CLANG = `src/main.c:12:5: error: use of undeclared identifier 'glBegn'; did you mean 'glBegin'?
   12 |     glBegn(GL_TRIANGLES);
      |     ^~~~~~
src/main.c:12:5: note: 'glBegin' declared here
src/util.h:3:10: warning: unused variable 'x' [-Wunused-variable]
src/main.c:1:10: fatal error: 'GL/glutt.h' file not found
2 errors generated.
`;

describe("parseDiagnostics", () => {
  it("dosya:satır:sütun ve mesajı ayrıştırır", () => {
    expect(parseDiagnostics(CLANG)[0]).toEqual({
      file: "src/main.c",
      line: 12,
      col: 5,
      severity: "error",
      message: "use of undeclared identifier 'glBegn'; did you mean 'glBegin'?",
    });
  });

  it("not / uyarı / ölümcül hata (→ error)", () => {
    const sev = parseDiagnostics(CLANG).map((d) => [d.file, d.line, d.severity]);
    expect(sev).toContainEqual(["src/main.c", 12, "note"]);
    expect(sev).toContainEqual(["src/util.h", 3, "warning"]);
    expect(sev).toContainEqual(["src/main.c", 1, "error"]);
  });

  it("bağlam satırları ve özetler teşhis değildir", () => {
    expect(parseDiagnostics(CLANG)).toHaveLength(4);
  });

  it("wasm-ld tanımsız sembol hatası konumsuz hata olur", () => {
    expect(parseDiagnostics("wasm-ld: error: src/main.o: undefined symbol: kendi_fonksiyonum\n")).toEqual([
      { file: "", line: 0, col: 0, severity: "error", message: "undefined symbol: kendi_fonksiyonum" },
    ]);
  });

  it("CRLF ve ters bölü yolları", () => {
    const d = parseDiagnostics("src\\main.c:7:3: error: expected ';' after expression\r\n")[0];
    expect([d.file, d.line, d.col, d.message]).toEqual(["src/main.c", 7, 3, "expected ';' after expression"]);
  });

  it("sanal kökteki önekli yolları (oglide/include) olduğu gibi bırakır", () => {
    expect(parseDiagnostics("oglide/include/GL/gl.h:5:1: warning: x\n")[0].file).toBe("oglide/include/GL/gl.h");
  });
});
