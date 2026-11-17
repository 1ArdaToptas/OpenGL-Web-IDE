import { describe, expect, it } from "vitest";
import { GL, primitiveToGeometry, thickSegment, type Vertex } from "./geometry";
import * as M from "./matrix";

const v = (x: number, y: number): Vertex => [x, y, 0, 1, 1, 1, 1, 1];

describe("matrix", () => {
  it("ortho(-1,1,-1,1,-1,1) birim matristir (z dışında)", () => {
    const m = [...M.ortho(-1, 1, -1, 1, -1, 1)].map((x) => x + 0); // -0 → 0
    expect(m).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
  });

  it("z ekseninde 90° dönüş (1,0)→(0,1)", () => {
    const [x, y] = M.transform(M.rotate(90, 0, 0, 1), 1, 0, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
  });

  it("çarpım sırası OpenGL ile aynı: T*R noktayı önce döndürür sonra taşır", () => {
    const m = M.multiply(M.translate(5, 0, 0), M.rotate(90, 0, 0, 1));
    const [x, y] = M.transform(m, 1, 0, 0);
    expect(x).toBeCloseTo(5);
    expect(y).toBeCloseTo(1);
  });

  it("ölçekleme", () => {
    expect(M.transform(M.scale(2, 3, 1), 1, 1, 0).slice(0, 2)).toEqual([2, 3]);
  });
});

describe("primitiveToGeometry", () => {
  const quad = [v(0, 0), v(1, 0), v(1, 1), v(0, 1)];

  it("GL_QUADS dolu: 2 üçgen", () => {
    const g = primitiveToGeometry(GL.QUADS, quad, GL.FILL);
    expect(g.triangles).toHaveLength(6);
    expect(g.lines).toHaveLength(0);
  });

  it("GL_QUADS + glPolygonMode(GL_LINE): 4 kenar, üçgen yok", () => {
    const g = primitiveToGeometry(GL.QUADS, quad, GL.LINE);
    expect(g.triangles).toHaveLength(0);
    expect(g.lines).toHaveLength(4);
  });

  it("GL_POLYGON altıgen: fan üçgenleme (4 üçgen), tel kafeste 6 kenar", () => {
    const hex = Array.from({ length: 6 }, (_, i) => v(Math.cos(i), Math.sin(i)));
    expect(primitiveToGeometry(GL.POLYGON, hex, GL.FILL).triangles).toHaveLength(12);
    expect(primitiveToGeometry(GL.POLYGON, hex, GL.LINE).lines).toHaveLength(6);
  });

  it("GL_TRIANGLE_FAN ve GL_TRIANGLE_STRIP", () => {
    const five = [v(0, 0), v(1, 0), v(1, 1), v(0, 1), v(-1, 1)];
    expect(primitiveToGeometry(GL.TRIANGLE_FAN, five, GL.FILL).triangles).toHaveLength(9);
    expect(primitiveToGeometry(GL.TRIANGLE_STRIP, five, GL.FILL).triangles).toHaveLength(9);
  });

  it("GL_LINE_LOOP kapanır, GL_LINE_STRIP kapanmaz", () => {
    expect(primitiveToGeometry(GL.LINE_LOOP, quad, GL.FILL).lines).toHaveLength(4);
    expect(primitiveToGeometry(GL.LINE_STRIP, quad, GL.FILL).lines).toHaveLength(3);
  });

  it("GL_LINES tek sayıda köşede artanı yok sayar", () => {
    expect(primitiveToGeometry(GL.LINES, [v(0, 0), v(1, 0), v(2, 0)], GL.FILL).lines).toHaveLength(1);
  });

  it("GL_POINTS ve glPolygonMode(GL_POINT)", () => {
    expect(primitiveToGeometry(GL.POINTS, quad, GL.FILL).points).toHaveLength(4);
    expect(primitiveToGeometry(GL.QUADS, quad, GL.POINT).points).toHaveLength(4);
  });

  it("eksik köşeli GL_TRIANGLES hata vermez", () => {
    expect(primitiveToGeometry(GL.TRIANGLES, [v(0, 0), v(1, 0)], GL.FILL).triangles).toHaveLength(0);
  });
});

describe("thickSegment", () => {
  it("yatay 4 px çizgi viewport'ta tam 4 piksel kalınlığındadır", () => {
    const tris = thickSegment(v(-0.5, 0), v(0.5, 0), 4, [800, 600]);
    expect(tris).toHaveLength(6);
    const ys = tris.map((p) => p[1]);
    const thicknessPx = ((Math.max(...ys) - Math.min(...ys)) * 600) / 2;
    expect(thicknessPx).toBeCloseTo(4);
  });

  it("renkleri uçlardan taşır", () => {
    const a: Vertex = [0, 0, 0, 1, 1, 0, 0, 1];
    const b: Vertex = [1, 0, 0, 1, 0, 0, 1, 1];
    const tris = thickSegment(a, b, 3, [100, 100]);
    expect(tris[0].slice(4)).toEqual([1, 0, 0, 1]);
    expect(tris[2].slice(4)).toEqual([0, 0, 1, 1]);
  });
});
