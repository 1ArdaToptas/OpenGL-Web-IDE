// Masaüstü GLSL (3.30+ core) → WebGL2 GLSL ES 3.00. Sürüm satırı değişir, varsayılan hassasiyet eklenir;
// "#line" ile öğrencinin dosyasındaki satır numaraları korunur (shader hata mesajları doğru satırı gösterir).

const DESKTOP_VERSION = /^\s*#version\s+(\d+)(?:\s+(core|compatibility))?\s*$/;
const ES_HEADER = "#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;";

export function translateGlsl(source: string): string {
  const lines = source.split("\n");
  if (/^\s*#version\s+300\s+es\b/.test(lines[0] ?? "")) return source;
  if (DESKTOP_VERSION.test(lines[0] ?? "")) {
    return `${ES_HEADER}\n#line 2\n${lines.slice(1).join("\n")}`;
  }
  return `${ES_HEADER}\n#line 1\n${source}`;
}
