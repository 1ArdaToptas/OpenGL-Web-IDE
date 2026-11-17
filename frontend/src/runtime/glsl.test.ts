import { describe, expect, it } from "vitest";
import { translateGlsl } from "./glsl";

const VS = "#version 330 core\nlayout(location = 0) in vec3 aPos;\nvoid main() { gl_Position = vec4(aPos, 1.0); }\n";

describe("translateGlsl", () => {
  it("masaüstü #version 330 core → #version 300 es + varsayılan hassasiyet", () => {
    const out = translateGlsl(VS);
    expect(out.split("\n")[0]).toBe("#version 300 es");
    expect(out).toContain("precision highp float;");
    expect(out).toContain("precision highp int;");
  });

  it("satır numaraları korunur (#line ile): hata mesajı öğrencinin satırını gösterir", () => {
    const lines = translateGlsl(VS).split("\n");
    const lineDirective = lines.findIndex((l) => l === "#line 2");
    expect(lineDirective).toBeGreaterThan(0);
    expect(lines[lineDirective + 1]).toBe("layout(location = 0) in vec3 aPos;");
  });

  it.each(["#version 330", "#version 410 core", "#version 450 core", "  #version 330 core"])("%s da çevrilir", (v) => {
    expect(translateGlsl(`${v}\nvoid main(){}\n`).startsWith("#version 300 es\n")).toBe(true);
  });

  it("#version yoksa eklenir, satır 1'den başlar", () => {
    const out = translateGlsl("void main(){}\n").split("\n");
    expect(out[0]).toBe("#version 300 es");
    expect(out[out.indexOf("#line 1") + 1]).toBe("void main(){}");
  });

  it("zaten ES 3.00 olan shader değiştirilmez", () => {
    const es = "#version 300 es\nprecision mediump float;\nvoid main(){}\n";
    expect(translateGlsl(es)).toBe(es);
  });

  it("gövde aynen kalır", () => {
    expect(translateGlsl(VS)).toContain("void main() { gl_Position = vec4(aPos, 1.0); }");
  });
});
