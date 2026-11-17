import { describe, expect, it } from "vitest";
import { PathRejected, validateFilePath, validateProjectName } from "./paths";

describe("tarayıcı modu yol kuralları (backend workspace.py ile aynı)", () => {
  it.each(["src/main.c", "src/util/math.h", "shaders/basic.vert", "src/notlar.txt"])("geçerli: %s", (p) => {
    expect(validateFilePath(p)).toBe(p);
  });

  it.each(["", "main.c", "../x.c", "src/../x.c", "src\\a.c", "src/a:b.c", "src/con.c", "src/.gizli.c", "src/a.exe",
    "src/a/b/c/d/e.c", "src/çizim.c", "build/app.wasm"])("geçersiz: %s", (p) => {
    expect(() => validateFilePath(p)).toThrow(PathRejected);
  });

  it.each(["ucgen", "Odev_1", "a-b"])("geçerli proje adı: %s", (n) => expect(validateProjectName(n)).toBe(n));
  it.each(["", "../x", "a b", "CON", "-a", "x".repeat(65)])("geçersiz proje adı: %s", (n) => {
    expect(() => validateProjectName(n)).toThrow(PathRejected);
  });
});
