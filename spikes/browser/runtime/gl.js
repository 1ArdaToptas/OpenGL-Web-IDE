// OpenGL 1.x (compatibility) taklidi — WebGL2 ile çizer.
// Köşeler CPU'da kırpma uzayına dönüştürülür; böylece WebGL'de olmayan glPolygonMode(GL_LINE) ve
// glLineWidth > 1 de desteklenir (kenarlar çizgiye, çizgiler piksel genişliğinde dikdörtgene çevrilir).
import * as M from "./matrix.js";

const GL_ = {
  POINTS: 0, LINES: 1, LINE_LOOP: 2, LINE_STRIP: 3, TRIANGLES: 4, TRIANGLE_STRIP: 5, TRIANGLE_FAN: 6,
  QUADS: 7, QUAD_STRIP: 8, POLYGON: 9,
  DEPTH_BUFFER_BIT: 0x100, COLOR_BUFFER_BIT: 0x4000, MODELVIEW: 0x1700, PROJECTION: 0x1701,
  POINT: 0x1b00, LINE: 0x1b01, FILL: 0x1b02, BLEND: 0x0be2, DEPTH_TEST: 0x0b71,
  VIEWPORT: 0x0ba2, VENDOR: 0x1f00, RENDERER: 0x1f01, VERSION: 0x1f02, RGB: 0x1907, RGBA: 0x1908,
};

const VS = `#version 300 es
in vec4 aPos; in vec4 aColor; uniform float uPointSize; out vec4 vColor;
void main() { gl_Position = aPos; gl_PointSize = uPointSize; vColor = aColor; }`;
const FS = `#version 300 es
precision mediump float; in vec4 vColor; out vec4 outColor;
void main() { outColor = vColor; }`;

export class LegacyGL {
  constructor(canvas, { memory, malloc, onWarning }) {
    this.canvas = canvas;
    this.memory = memory;
    this.malloc = malloc;
    this.warn = onWarning ?? (() => {});
    // preserveDrawingBuffer: tek tamponlu (GLUT_SINGLE) programlar ve glReadPixels için içerik korunur.
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: true });
    if (!gl) throw new Error("Tarayıcı WebGL2 desteklemiyor");
    this.gl = gl;
    this.program = this.#link();
    this.vbo = gl.createBuffer();
    this.aPos = gl.getAttribLocation(this.program, "aPos");
    this.aColor = gl.getAttribLocation(this.program, "aColor");
    this.uPointSize = gl.getUniformLocation(this.program, "uPointSize");
    this.stacks = { [GL_.MODELVIEW]: [M.identity()], [GL_.PROJECTION]: [M.identity()] };
    this.matrixMode = GL_.MODELVIEW;
    this.color = [1, 1, 1, 1];
    this.lineWidth = 1;
    this.pointSize = 1;
    this.polygonMode = GL_.FILL;
    this.viewport = [0, 0, canvas.width, canvas.height];
    this.begin = null;
    this.strings = new Map();
    gl.viewport(...this.viewport);
  }

  #link() {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  get #stack() {
    return this.stacks[this.matrixMode];
  }
  #apply(m) {
    const s = this.#stack;
    s[s.length - 1] = M.multiply(s[s.length - 1], m);
  }

  // ---- glBegin / glEnd ----
  #vertex(x, y, z) {
    if (!this.begin) return this.warn("glVertex, glBegin/glEnd dışında çağrıldı");
    const [cx, cy, cz, cw] = M.transform(this.begin.mvp, x, y, z);
    this.begin.verts.push([cx, cy, cz, cw, ...this.color]);
  }

  #ndc(v) {
    return [v[0] / v[3], v[1] / v[3], v[2] / v[3]];
  }

  /** Bir doğru parçasını viewport'ta `lineWidth` piksel kalınlığında iki üçgene açar. */
  #thickSegment(a, b, out) {
    const [ax, ay, az] = this.#ndc(a);
    const [bx, by, bz] = this.#ndc(b);
    const [, , vw, vh] = this.viewport;
    const dx = ((bx - ax) * vw) / 2;
    const dy = ((by - ay) * vh) / 2;
    const len = Math.hypot(dx, dy) || 1;
    const half = this.lineWidth / 2;
    const nx = ((-dy / len) * half * 2) / vw;
    const ny = ((dx / len) * half * 2) / vh;
    const ca = a.slice(4);
    const cb = b.slice(4);
    const p = (x, y, z, c) => [x, y, z, 1, ...c];
    const a1 = p(ax + nx, ay + ny, az, ca), a2 = p(ax - nx, ay - ny, az, ca);
    const b1 = p(bx + nx, by + ny, bz, cb), b2 = p(bx - nx, by - ny, bz, cb);
    out.push(a1, a2, b1, b1, a2, b2);
  }

  #drawLines(segments) {
    if (this.lineWidth <= 1) {
      this.#draw(this.gl.LINES, segments.flat());
    } else {
      const tris = [];
      for (const [a, b] of segments) this.#thickSegment(a, b, tris);
      this.#draw(this.gl.TRIANGLES, tris);
    }
  }

  #draw(primitive, verts) {
    if (!verts.length) return;
    const gl = this.gl;
    const data = new Float32Array(verts.length * 8);
    verts.forEach((v, i) => data.set(v, i * 8));
    gl.useProgram(this.program);
    gl.uniform1f(this.uPointSize, this.pointSize);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aColor, 4, gl.FLOAT, false, 32, 16);
    gl.drawArrays(primitive, 0, verts.length);
  }

  /** Dolu ilkel → üçgenler ve (glPolygonMode için) kenar listesi. */
  static #triangulate(mode, v) {
    const tris = [];
    const edges = [];
    const tri = (a, b, c) => {
      tris.push(v[a], v[b], v[c]);
    };
    const loop = (idx) => idx.forEach((i, k) => edges.push([v[i], v[idx[(k + 1) % idx.length]]]));
    if (mode === GL_.TRIANGLES) {
      for (let i = 0; i + 2 < v.length; i += 3) (tri(i, i + 1, i + 2), loop([i, i + 1, i + 2]));
    } else if (mode === GL_.TRIANGLE_STRIP) {
      for (let i = 0; i + 2 < v.length; i++) (i % 2 ? tri(i + 1, i, i + 2) : tri(i, i + 1, i + 2), loop([i, i + 1, i + 2]));
    } else if (mode === GL_.TRIANGLE_FAN) {
      for (let i = 1; i + 1 < v.length; i++) (tri(0, i, i + 1), loop([0, i, i + 1]));
    } else if (mode === GL_.QUADS) {
      for (let i = 0; i + 3 < v.length; i += 4) (tri(i, i + 1, i + 2), tri(i, i + 2, i + 3), loop([i, i + 1, i + 2, i + 3]));
    } else if (mode === GL_.QUAD_STRIP) {
      for (let i = 0; i + 3 < v.length; i += 2) (tri(i, i + 1, i + 3), tri(i, i + 3, i + 2), loop([i, i + 1, i + 3, i + 2]));
    } else if (mode === GL_.POLYGON && v.length >= 3) {
      for (let i = 1; i + 1 < v.length; i++) tri(0, i, i + 1);
      loop([...v.keys()]);
    }
    return { tris, edges };
  }

  #end() {
    const { mode, verts: v } = this.begin;
    this.begin = null;
    const gl = this.gl;
    if (mode === GL_.POINTS) return this.#draw(gl.POINTS, v);
    if (mode === GL_.LINES) {
      const segs = [];
      for (let i = 0; i + 1 < v.length; i += 2) segs.push([v[i], v[i + 1]]);
      return this.#drawLines(segs);
    }
    if (mode === GL_.LINE_STRIP || mode === GL_.LINE_LOOP) {
      const segs = [];
      for (let i = 0; i + 1 < v.length; i++) segs.push([v[i], v[i + 1]]);
      if (mode === GL_.LINE_LOOP && v.length > 2) segs.push([v[v.length - 1], v[0]]);
      return this.#drawLines(segs);
    }
    const { tris, edges } = LegacyGL.#triangulate(mode, v);
    if (this.polygonMode === GL_.LINE) this.#drawLines(edges);
    else if (this.polygonMode === GL_.POINT) this.#draw(gl.POINTS, v);
    else this.#draw(gl.TRIANGLES, tris);
  }

  #cString(text) {
    if (!this.strings.has(text)) {
      const data = new TextEncoder().encode(text);
      const ptr = this.malloc(data.length + 1);
      const mem = new Uint8Array(this.memory().buffer);
      mem.set(data, ptr);
      mem[ptr + data.length] = 0;
      this.strings.set(text, ptr);
    }
    return this.strings.get(text);
  }

  #rendererName() {
    const gl = this.gl;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  }

  /** WebAssembly'ye verilecek içe aktarımlar (C başlıklarındaki adlarla). */
  imports() {
    const gl = this.gl;
    const mem32 = () => new Int32Array(this.memory().buffer);
    return {
      glBegin: (mode) => {
        const s = this.stacks;
        this.begin = { mode, verts: [], mvp: M.multiply(s[GL_.PROJECTION].at(-1), s[GL_.MODELVIEW].at(-1)) };
      },
      glEnd: () => this.begin && this.#end(),
      glVertex2f: (x, y) => this.#vertex(x, y, 0),
      glVertex2i: (x, y) => this.#vertex(x, y, 0),
      glVertex3f: (x, y, z) => this.#vertex(x, y, z),
      glColor3f: (r, g, b) => (this.color = [r, g, b, 1]),
      glColor4f: (r, g, b, a) => (this.color = [r, g, b, a]),
      glColor3ub: (r, g, b) => (this.color = [r / 255, g / 255, b / 255, 1]),

      glClear: (mask) =>
        gl.clear((mask & GL_.COLOR_BUFFER_BIT ? gl.COLOR_BUFFER_BIT : 0) | (mask & GL_.DEPTH_BUFFER_BIT ? gl.DEPTH_BUFFER_BIT : 0)),
      glClearColor: (r, g, b, a) => gl.clearColor(r, g, b, a),
      glViewport: (x, y, w, h) => {
        this.viewport = [x, y, w, h];
        gl.viewport(x, y, w, h);
      },
      glFlush: () => gl.flush(),
      glFinish: () => gl.finish(),

      glMatrixMode: (mode) => (this.matrixMode = mode),
      glLoadIdentity: () => {
        const s = this.#stack;
        s[s.length - 1] = M.identity();
      },
      glPushMatrix: () => this.#stack.push(this.#stack.at(-1).slice()),
      glPopMatrix: () => this.#stack.length > 1 && this.#stack.pop(),
      glTranslatef: (x, y, z) => this.#apply(M.translate(x, y, z)),
      glRotatef: (a, x, y, z) => this.#apply(M.rotate(a, x, y, z)),
      glScalef: (x, y, z) => this.#apply(M.scale(x, y, z)),
      glOrtho: (l, r, b, t, n, f) => this.#apply(M.ortho(l, r, b, t, n, f)),
      gluOrtho2D: (l, r, b, t) => this.#apply(M.ortho(l, r, b, t, -1, 1)),
      gluPerspective: (fovy, aspect, n, f) => this.#apply(M.perspective(fovy, aspect, n, f)),

      glLineWidth: (w) => (this.lineWidth = Math.max(0.1, w)),
      glPointSize: (s) => (this.pointSize = Math.max(0.1, s)),
      glPolygonMode: (_face, mode) => (this.polygonMode = mode),
      glEnable: (cap) => (cap === GL_.BLEND ? gl.enable(gl.BLEND) : cap === GL_.DEPTH_TEST ? gl.enable(gl.DEPTH_TEST) : 0),
      glDisable: (cap) => (cap === GL_.BLEND ? gl.disable(gl.BLEND) : cap === GL_.DEPTH_TEST ? gl.disable(gl.DEPTH_TEST) : 0),
      glBlendFunc: (s, d) => gl.blendFunc(s, d), // sabit değerleri WebGL ile aynı

      glGetError: () => 0,
      glGetString: (name) =>
        this.#cString(
          name === GL_.VENDOR ? "OpenGL Web IDE (WebGL2)"
            : name === GL_.RENDERER ? this.#rendererName()
              : name === GL_.VERSION ? "2.1 Compatibility (tarayıcı taklidi, WebGL 2.0)" : "",
        ),
      glGetIntegerv: (pname, ptr) => {
        if (pname === GL_.VIEWPORT) mem32().set(this.viewport, ptr >> 2);
      },
      glReadBuffer: () => {},
      glReadPixels: (x, y, w, h, format, _type, ptr) => {
        const rgba = new Uint8Array(w * h * 4);
        gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        const mem = new Uint8Array(this.memory().buffer);
        if (format === GL_.RGBA) mem.set(rgba, ptr);
        else for (let i = 0; i < w * h; i++) mem.set(rgba.subarray(i * 4, i * 4 + 3), ptr + i * 3);
      },
    };
  }
}
