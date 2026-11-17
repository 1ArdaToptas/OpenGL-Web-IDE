// OpenGL 1.x (compatibility) taklidi — WebGL2 ile çizer. Köşeler CPU'da kırpma uzayına dönüştürülür;
// ilkeller geometry.ts ile üçgen/çizgi/noktaya çevrilir (glPolygonMode(GL_LINE) ve glLineWidth > 1 dahil).
import { GL, type Segment, type Vertex, primitiveToGeometry, thickSegment } from "./geometry";
import * as M from "./matrix";

const C = {
  DEPTH_BUFFER_BIT: 0x100, COLOR_BUFFER_BIT: 0x4000, MODELVIEW: 0x1700, PROJECTION: 0x1701,
  BLEND: 0x0be2, DEPTH_TEST: 0x0b71, VIEWPORT: 0x0ba2, VENDOR: 0x1f00, RENDERER: 0x1f01, VERSION: 0x1f02,
  RGBA: 0x1908,
} as const;

const VS = `#version 300 es
in vec4 aPos; in vec4 aColor; uniform float uPointSize; out vec4 vColor;
void main() { gl_Position = aPos; gl_PointSize = uPointSize; vColor = aColor; }`;
const FS = `#version 300 es
precision mediump float; in vec4 vColor; out vec4 outColor;
void main() { outColor = vColor; }`;

type Canvas = HTMLCanvasElement | OffscreenCanvas;

interface Options {
  memory: () => WebAssembly.Memory;
  malloc: (n: number) => number;
  onWarning: (message: string) => void;
}

export class LegacyGL {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vbo: WebGLBuffer;
  private aPos: number;
  private aColor: number;
  private uPointSize: WebGLUniformLocation | null;
  private stacks: Record<number, M.Mat4[]> = { [C.MODELVIEW]: [M.identity()], [C.PROJECTION]: [M.identity()] };
  private matrixMode: number = C.MODELVIEW;
  private color: [number, number, number, number] = [1, 1, 1, 1];
  private lineWidth = 1;
  private pointSize = 1;
  private polygonMode: number = GL.FILL;
  private viewport: [number, number, number, number];
  private begin: { mode: number; verts: Vertex[]; mvp: M.Mat4 } | null = null;
  private strings = new Map<string, number>();

  constructor(
    canvas: Canvas,
    private o: Options,
  ) {
    // preserveDrawingBuffer: tek tamponlu (GLUT_SINGLE) programlar ve glReadPixels için içerik korunur.
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: true }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("Tarayıcı WebGL2 desteklemiyor");
    this.gl = gl;
    this.program = this.link();
    this.vbo = gl.createBuffer()!;
    this.aPos = gl.getAttribLocation(this.program, "aPos");
    this.aColor = gl.getAttribLocation(this.program, "aColor");
    this.uPointSize = gl.getUniformLocation(this.program, "uPointSize");
    this.viewport = [0, 0, canvas.width, canvas.height];
    gl.viewport(...this.viewport);
  }

  /** Pencere boyutu değişti (glutInitWindowSize): GLUT'un varsayılan reshape davranışı gibi viewport'u ayarla. */
  resize(w: number, h: number) {
    this.viewport = [0, 0, w, h];
    this.gl.viewport(0, 0, w, h);
  }

  private link(): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "program");
    return p;
  }

  private get stack() {
    return this.stacks[this.matrixMode];
  }
  private apply(m: M.Mat4) {
    const s = this.stack;
    s[s.length - 1] = M.multiply(s[s.length - 1], m);
  }

  private vertex(x: number, y: number, z: number) {
    if (!this.begin) return this.o.onWarning("glVertex, glBegin/glEnd dışında çağrıldı");
    const [cx, cy, cz, cw] = M.transform(this.begin.mvp, x, y, z);
    this.begin.verts.push([cx, cy, cz, cw, ...this.color]);
  }

  private draw(primitive: number, verts: Vertex[]) {
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

  private drawLines(segments: Segment[]) {
    if (this.lineWidth <= 1) return this.draw(this.gl.LINES, segments.flat());
    const size: [number, number] = [this.viewport[2], this.viewport[3]];
    this.draw(this.gl.TRIANGLES, segments.flatMap(([a, b]) => thickSegment(a, b, this.lineWidth, size)));
  }

  private end() {
    if (!this.begin) return;
    const { mode, verts } = this.begin;
    this.begin = null;
    const g = primitiveToGeometry(mode, verts, this.polygonMode);
    this.draw(this.gl.TRIANGLES, g.triangles);
    this.drawLines(g.lines);
    this.draw(this.gl.POINTS, g.points);
  }

  private cString(text: string): number {
    if (!this.strings.has(text)) {
      const data = new TextEncoder().encode(text);
      const ptr = this.o.malloc(data.length + 1);
      const mem = new Uint8Array(this.o.memory().buffer);
      mem.set(data, ptr);
      mem[ptr + data.length] = 0;
      this.strings.set(text, ptr);
    }
    return this.strings.get(text)!;
  }

  private rendererName(): string {
    const gl = this.gl;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }

  /** WebAssembly'ye verilecek içe aktarımlar (C başlıklarındaki adlarla). */
  imports() {
    const gl = this.gl;
    const cap = (c: number) => (c === C.BLEND ? gl.BLEND : c === C.DEPTH_TEST ? gl.DEPTH_TEST : 0);
    return {
      glBegin: (mode: number) => {
        this.begin = { mode, verts: [], mvp: M.multiply(this.stacks[C.PROJECTION].at(-1)!, this.stacks[C.MODELVIEW].at(-1)!) };
      },
      glEnd: () => this.end(),
      glVertex2f: (x: number, y: number) => this.vertex(x, y, 0),
      glVertex2i: (x: number, y: number) => this.vertex(x, y, 0),
      glVertex3f: (x: number, y: number, z: number) => this.vertex(x, y, z),
      glColor3f: (r: number, g: number, b: number) => void (this.color = [r, g, b, 1]),
      glColor4f: (r: number, g: number, b: number, a: number) => void (this.color = [r, g, b, a]),
      glColor3ub: (r: number, g: number, b: number) => void (this.color = [r / 255, g / 255, b / 255, 1]),

      glClear: (mask: number) =>
        gl.clear((mask & C.COLOR_BUFFER_BIT ? gl.COLOR_BUFFER_BIT : 0) | (mask & C.DEPTH_BUFFER_BIT ? gl.DEPTH_BUFFER_BIT : 0)),
      glClearColor: (r: number, g: number, b: number, a: number) => gl.clearColor(r, g, b, a),
      glViewport: (x: number, y: number, w: number, h: number) => {
        this.viewport = [x, y, w, h];
        gl.viewport(x, y, w, h);
      },
      glFlush: () => gl.flush(),
      glFinish: () => gl.finish(),

      glMatrixMode: (mode: number) => void (this.matrixMode = mode),
      glLoadIdentity: () => {
        const s = this.stack;
        s[s.length - 1] = M.identity();
      },
      glPushMatrix: () => void this.stack.push(this.stack.at(-1)!.slice()),
      glPopMatrix: () => void (this.stack.length > 1 && this.stack.pop()),
      glTranslatef: (x: number, y: number, z: number) => this.apply(M.translate(x, y, z)),
      glRotatef: (a: number, x: number, y: number, z: number) => this.apply(M.rotate(a, x, y, z)),
      glScalef: (x: number, y: number, z: number) => this.apply(M.scale(x, y, z)),
      glOrtho: (l: number, r: number, b: number, t: number, n: number, f: number) => this.apply(M.ortho(l, r, b, t, n, f)),
      gluOrtho2D: (l: number, r: number, b: number, t: number) => this.apply(M.ortho(l, r, b, t, -1, 1)),
      gluPerspective: (fovy: number, aspect: number, n: number, f: number) => this.apply(M.perspective(fovy, aspect, n, f)),

      glLineWidth: (w: number) => void (this.lineWidth = Math.max(0.1, w)),
      glPointSize: (s: number) => void (this.pointSize = Math.max(0.1, s)),
      glPolygonMode: (_face: number, mode: number) => void (this.polygonMode = mode),
      glEnable: (c: number) => cap(c) && gl.enable(cap(c)),
      glDisable: (c: number) => cap(c) && gl.disable(cap(c)),
      glBlendFunc: (s: number, d: number) => gl.blendFunc(s, d), // sabit değerleri WebGL ile aynı

      glGetError: () => 0,
      glGetString: (name: number) =>
        this.cString(
          name === C.VENDOR ? "OpenGL Web IDE (WebGL2)"
            : name === C.RENDERER ? this.rendererName()
              : name === C.VERSION ? "2.1 Compatibility (tarayıcı taklidi, WebGL 2.0)" : "",
        ),
      glGetIntegerv: (pname: number, ptr: number) => {
        if (pname === C.VIEWPORT) new Int32Array(this.o.memory().buffer).set(this.viewport, ptr >> 2);
      },
      glReadBuffer: () => {},
      glReadPixels: (x: number, y: number, w: number, h: number, format: number, _type: number, ptr: number) => {
        const rgba = new Uint8Array(w * h * 4);
        gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        const mem = new Uint8Array(this.o.memory().buffer);
        if (format === C.RGBA) mem.set(rgba, ptr);
        else for (let i = 0; i < w * h; i++) mem.set(rgba.subarray(i * 4, i * 4 + 3), ptr + i * 3);
      },
    };
  }
}
