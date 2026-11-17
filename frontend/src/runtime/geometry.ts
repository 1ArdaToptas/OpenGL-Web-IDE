// glBegin/glEnd ilkellerinin WebGL'e çevrilmesi (saf, WebGL'siz test edilebilir).
// Köşeler kırpma uzayındadır: [x, y, z, w, r, g, b, a].

export type Vertex = [number, number, number, number, number, number, number, number];
export type Segment = [Vertex, Vertex];

export const GL = {
  POINTS: 0, LINES: 1, LINE_LOOP: 2, LINE_STRIP: 3, TRIANGLES: 4, TRIANGLE_STRIP: 5, TRIANGLE_FAN: 6,
  QUADS: 7, QUAD_STRIP: 8, POLYGON: 9,
  POINT: 0x1b00, LINE: 0x1b01, FILL: 0x1b02,
} as const;

export interface Geometry {
  triangles: Vertex[];
  lines: Segment[];
  points: Vertex[];
}

/** Bir ilkeli (glBegin kipi + glPolygonMode) çizilecek üçgen / çizgi / noktaya çevirir. */
export function primitiveToGeometry(mode: number, v: Vertex[], polygonMode: number): Geometry {
  const g: Geometry = { triangles: [], lines: [], points: [] };
  if (mode === GL.POINTS) {
    g.points = v;
    return g;
  }
  if (mode === GL.LINES) {
    for (let i = 0; i + 1 < v.length; i += 2) g.lines.push([v[i], v[i + 1]]);
    return g;
  }
  if (mode === GL.LINE_STRIP || mode === GL.LINE_LOOP) {
    for (let i = 0; i + 1 < v.length; i++) g.lines.push([v[i], v[i + 1]]);
    if (mode === GL.LINE_LOOP && v.length > 2) g.lines.push([v[v.length - 1], v[0]]);
    return g;
  }

  // Dolu ilkeller: üçgenler ve (tel kafes için) çokgen kenarları birlikte üretilir.
  const tris: Vertex[] = [];
  const edges: Segment[] = [];
  const tri = (a: number, b: number, c: number) => tris.push(v[a], v[b], v[c]);
  const loop = (idx: number[]) => idx.forEach((i, k) => edges.push([v[i], v[idx[(k + 1) % idx.length]]]));
  if (mode === GL.TRIANGLES) {
    for (let i = 0; i + 2 < v.length; i += 3) {
      tri(i, i + 1, i + 2);
      loop([i, i + 1, i + 2]);
    }
  } else if (mode === GL.TRIANGLE_STRIP) {
    for (let i = 0; i + 2 < v.length; i++) {
      if (i % 2) tri(i + 1, i, i + 2);
      else tri(i, i + 1, i + 2);
      loop([i, i + 1, i + 2]);
    }
  } else if (mode === GL.TRIANGLE_FAN) {
    for (let i = 1; i + 1 < v.length; i++) {
      tri(0, i, i + 1);
      loop([0, i, i + 1]);
    }
  } else if (mode === GL.QUADS) {
    for (let i = 0; i + 3 < v.length; i += 4) {
      tri(i, i + 1, i + 2);
      tri(i, i + 2, i + 3);
      loop([i, i + 1, i + 2, i + 3]);
    }
  } else if (mode === GL.QUAD_STRIP) {
    for (let i = 0; i + 3 < v.length; i += 2) {
      tri(i, i + 1, i + 3);
      tri(i, i + 3, i + 2);
      loop([i, i + 1, i + 3, i + 2]);
    }
  } else if (mode === GL.POLYGON && v.length >= 3) {
    for (let i = 1; i + 1 < v.length; i++) tri(0, i, i + 1);
    loop([...v.keys()]);
  }

  if (polygonMode === GL.LINE) g.lines = edges;
  else if (polygonMode === GL.POINT) g.points = v;
  else g.triangles = tris;
  return g;
}

/**
 * Bir doğru parçasını viewport'ta `widthPx` piksel kalınlığında iki üçgene açar
 * (WebGL yalnızca 1 px çizgi garanti eder; glLineWidth > 1 bununla desteklenir).
 */
export function thickSegment(a: Vertex, b: Vertex, widthPx: number, viewport: [number, number]): Vertex[] {
  const [vw, vh] = viewport;
  const ndc = (p: Vertex) => [p[0] / p[3], p[1] / p[3], p[2] / p[3]];
  const [ax, ay, az] = ndc(a);
  const [bx, by, bz] = ndc(b);
  const dx = ((bx - ax) * vw) / 2;
  const dy = ((by - ay) * vh) / 2;
  const len = Math.hypot(dx, dy) || 1;
  const nx = ((-dy / len) * widthPx) / vw; // yarım genişlik * 2 / vw
  const ny = ((dx / len) * widthPx) / vh;
  const p = (x: number, y: number, z: number, c: number[]): Vertex => [x, y, z, 1, c[0], c[1], c[2], c[3]];
  const ca = a.slice(4);
  const cb = b.slice(4);
  const a1 = p(ax + nx, ay + ny, az, ca);
  const a2 = p(ax - nx, ay - ny, az, ca);
  const b1 = p(bx + nx, by + ny, bz, cb);
  const b2 = p(bx - nx, by - ny, bz, cb);
  return [a1, a2, b1, b1, a2, b2];
}
