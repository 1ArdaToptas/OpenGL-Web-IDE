import { describe, expect, it } from "vitest";
import { exitSummary, toTerminalText } from "./terminalText";

describe("toTerminalText", () => {
  it("tek başına \\n'i \\r\\n yapar, mevcut \\r\\n'i bozmaz", () => {
    expect(toTerminalText("a\nb\r\nc")).toBe("a\r\nb\r\nc");
  });

  it("stderr'i kırmızı ANSI ile sarar", () => {
    expect(toTerminalText("hata\n", "stderr")).toBe("\x1b[31mhata\r\n\x1b[0m");
  });
});

describe("exitSummary", () => {
  const base = { type: "job.exited" as const, jobId: "j", code: 0, durationMs: 1234, outputTruncated: false };

  it("başarılı derleme", () => {
    expect(exitSummary({ ...base, kind: "build", reason: "exit", ok: true })).toBe("Derleme başarılı (1.2 sn)");
  });

  it("başarısız derleme", () => {
    expect(exitSummary({ ...base, kind: "build", reason: "exit", code: 1, ok: false })).toBe("Derleme başarısız (1.2 sn)");
  });

  it("zaman aşımı ve durdurma nedenini söyler", () => {
    expect(exitSummary({ ...base, kind: "run", reason: "timeout", code: 1 })).toBe("Program zaman aşımıyla durduruldu (1.2 sn)");
    expect(exitSummary({ ...base, kind: "run", reason: "killed", code: 1 })).toBe("Program durduruldu (1.2 sn)");
  });

  it("aşılan kaynak sınırını açıkça söyler", () => {
    expect(exitSummary({ ...base, kind: "run", reason: "limit", code: 1, limit: "memory" })).toBe(
      "Program bellek sınırını aştığı için sonlandı (1.2 sn)",
    );
    expect(exitSummary({ ...base, kind: "run", reason: "limit", code: 1, limit: "processes" })).toBe(
      "Program süreç sayısı sınırını aştığı için sonlandı (1.2 sn)",
    );
  });

  it("çıkış kodunu ve kesilen çıktıyı bildirir", () => {
    expect(exitSummary({ ...base, kind: "run", reason: "exit", code: 3, outputTruncated: true })).toBe(
      "Program çıkış kodu 3 ile bitti (1.2 sn) — çıktı sınırı aşıldı, kalan çıktı gösterilmedi",
    );
  });
});
