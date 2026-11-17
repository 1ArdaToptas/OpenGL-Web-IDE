import type { IdeEvent } from "../../lib/types";

type Exited = Extract<IdeEvent, { type: "job.exited" }>;

/** xterm satır sonu olarak \r\n bekler; stderr kırmızı gösterilir. */
export function toTerminalText(text: string, stream: "stdout" | "stderr" = "stdout"): string {
  const normalized = text.replace(/\r?\n/g, "\r\n");
  return stream === "stderr" ? `\x1b[31m${normalized}\x1b[0m` : normalized;
}

export function exitSummary(e: Exited): string {
  const dur = `(${(e.durationMs / 1000).toFixed(1)} sn)`;
  let text: string;
  if (e.kind === "build") {
    text = `Derleme ${e.ok ? "başarılı" : "başarısız"} ${dur}`;
  } else if (e.reason === "timeout") {
    text = `Program zaman aşımıyla durduruldu ${dur}`;
  } else if (e.reason === "killed") {
    text = `Program durduruldu ${dur}`;
  } else if (e.reason === "limit") {
    const what = e.limit === "processes" ? "süreç sayısı" : "bellek";
    text = `Program ${what} sınırını aştığı için sonlandı ${dur}`;
  } else if (e.reason === "error") {
    text = `Program beklenmedik bir hatayla sonlandı ${dur}`;
  } else {
    text = `Program çıkış kodu ${e.code} ile bitti ${dur}`;
  }
  return e.outputTruncated ? `${text} — çıktı sınırı aşıldı, kalan çıktı gösterilmedi` : text;
}
