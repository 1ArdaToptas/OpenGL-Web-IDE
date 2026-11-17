import type { Diagnostic } from "../../lib/types";
import { describeTurkish } from "../problems/turkish";

// monaco.MarkerSeverity değerleri; Monaco'yu yüklemeden test edilebilsin diye burada.
export const MarkerSeverity = { Hint: 1, Info: 2, Warning: 4, Error: 8 } as const;

export interface Marker {
  severity: number;
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  source: string;
}

// Kendi dil kimliklerimiz (monacoSetup.ts): Monaco'nun tembel yüklenen c/cpp tanımı renk kurallarımızı ezmesin.
const EXT_LANG: Record<string, string> = {
  c: "oglide-c",
  cpp: "oglide-cpp",
  hpp: "oglide-cpp",
  h: "oglide-cpp",
  vert: "oglide-glsl",
  frag: "oglide-glsl",
  geom: "oglide-glsl",
  glsl: "oglide-glsl",
};

export function languageFor(path: string): string {
  return EXT_LANG[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? "plaintext";
}

const LINE_END = 1_000_000;
const SEVERITY = { error: MarkerSeverity.Error, warning: MarkerSeverity.Warning, note: MarkerSeverity.Info };

export function toMarkers(diagnostics: Diagnostic[], path: string): Marker[] {
  return diagnostics
    .filter((d) => d.file === path && d.line > 0)
    // GCC yalnızca başlangıç sütununu verir: o noktadan satır sonuna işaretlenir (Monaco satır uzunluğuna kırpar).
    .map((d) => ({
      severity: SEVERITY[d.severity],
      message: describeTurkish(d.message), // üzerine gelince Türkçe + özgün ileti
      startLineNumber: d.line,
      startColumn: Math.max(1, d.col),
      endLineNumber: d.line,
      endColumn: LINE_END,
      source: "gcc",
    }));
}
