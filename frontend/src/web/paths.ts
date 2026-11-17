// Tarayıcı modunda proje ve dosya yolu kuralları — backend/workspace.py ile aynı (iki mod aynı projeleri kabul eder).

export class PathRejected extends Error {}

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RESERVED = new Set(["con", "prn", "aux", "nul", ...Array.from({ length: 10 }, (_, i) => [`com${i}`, `lpt${i}`]).flat()]);
const USER_DIRS = new Set(["src", "shaders"]);
const EXTENSIONS = new Set([".c", ".cpp", ".h", ".hpp", ".vert", ".frag", ".geom", ".glsl", ".txt"]);
const MAX_DEPTH = 4;

export function validateProjectName(name: string): string {
  if (!NAME.test(name) || RESERVED.has(name.toLowerCase())) throw new PathRejected(`Geçersiz proje adı: '${name}'`);
  return name;
}

export function validateFilePath(rel: string): string {
  if (!rel || rel.length > 255 || rel.includes("\\") || rel.includes(":")) throw new PathRejected(`Geçersiz yol: '${rel}'`);
  const parts = rel.split("/");
  if (parts.length < 2 || parts.length > MAX_DEPTH || !USER_DIRS.has(parts[0])) {
    throw new PathRejected(`Yol src/ veya shaders/ altında olmalı: '${rel}'`);
  }
  for (const seg of parts) {
    if (!SEGMENT.test(seg) || seg.endsWith(".") || RESERVED.has(seg.split(".")[0].toLowerCase())) {
      throw new PathRejected(`Geçersiz yol bileşeni: '${seg}'`);
    }
  }
  const ext = parts.at(-1)!.match(/\.[^.]+$/)?.[0].toLowerCase() ?? "";
  if (!EXTENSIONS.has(ext)) throw new PathRejected(`İzinli olmayan uzantı: '${parts.at(-1)}'`);
  return rel;
}
