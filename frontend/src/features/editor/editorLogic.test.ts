import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../../lib/types";
import { MarkerSeverity, languageFor, toMarkers } from "./editorLogic";

describe("languageFor", () => {
  it.each([
    ["src/main.c", "oglide-c"],
    ["src/a.cpp", "oglide-cpp"],
    ["src/a.hpp", "oglide-cpp"],
    ["src/a.h", "oglide-cpp"],
    ["shaders/basic.vert", "oglide-glsl"],
    ["shaders/basic.frag", "oglide-glsl"],
    ["shaders/x.geom", "oglide-glsl"],
    ["shaders/x.glsl", "oglide-glsl"],
    ["src/notlar.txt", "plaintext"],
  ])("%s → %s", (path, lang) => expect(languageFor(path)).toBe(lang));
});

describe("toMarkers", () => {
  const diags: Diagnostic[] = [
    { file: "src/main.c", line: 12, col: 5, severity: "error", message: "'x' undeclared" },
    { file: "src/main.c", line: 3, col: 0, severity: "warning", message: "unused" },
    { file: "src/main.c", line: 12, col: 5, severity: "note", message: "each undeclared…" },
    { file: "src/util.h", line: 1, col: 1, severity: "error", message: "başka dosya" },
    { file: "", line: 0, col: 0, severity: "error", message: "ld returned 1 exit status" },
  ];

  it("yalnızca ilgili dosyanın teşhislerini işaretler", () => {
    expect(toMarkers(diags, "src/main.c")).toHaveLength(3);
    expect(toMarkers(diags, "src/util.h")).toHaveLength(1);
  });

  it("şiddeti Monaco seviyesine çevirir", () => {
    const m = toMarkers(diags, "src/main.c");
    expect(m.map((x) => x.severity)).toEqual([MarkerSeverity.Error, MarkerSeverity.Warning, MarkerSeverity.Info]);
  });

  it("sütun varsa o noktadan, yoksa satır başından işaretler", () => {
    const [err, warn] = toMarkers(diags, "src/main.c");
    expect(err).toMatchObject({ startLineNumber: 12, startColumn: 5, endLineNumber: 12, message: "'x' undeclared" });
    expect(err.endColumn).toBeGreaterThan(5);
    expect(warn).toMatchObject({ startLineNumber: 3, startColumn: 1 });
  });

  it("üzerine gelince Türkçe açıklama + özgün ileti gösterir; tanınmayan ileti olduğu gibi kalır", () => {
    const [m] = toMarkers(
      [{ file: "a.c", line: 1, col: 1, severity: "error", message: "use of undeclared identifier 'x'" }],
      "a.c",
    );
    expect(m.message).toBe("Tanımlanmamış ad kullanıldı: 'x'\n(use of undeclared identifier 'x')");
    expect(toMarkers(diags, "src/main.c")[0].message).toBe("'x' undeclared");
  });
});
