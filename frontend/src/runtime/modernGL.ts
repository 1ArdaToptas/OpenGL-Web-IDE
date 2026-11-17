// OpenGL 3.3 core (GLAD arayüzü) → WebGL2. GL tamsayı tanıtıcıları (GLuint) WebGL nesnelerine tablo ile eşlenir;
// shader kaynakları translateGlsl ile GLSL ES 3.00'a çevrilir, hata günlükleri C belleğine yazılır.
import { translateGlsl } from "./glsl";

type Canvas = HTMLCanvasElement | OffscreenCanvas;

interface Options {
  memory: () => WebAssembly.Memory;
  malloc: (n: number) => number;
}

const C = {
  VENDOR: 0x1f00, RENDERER: 0x1f01, VERSION: 0x1f02, SHADING_LANGUAGE_VERSION: 0x8b8c, VIEWPORT: 0x0ba2,
  COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82, INFO_LOG_LENGTH: 0x8b84, RGBA: 0x1908,
} as const;

/** GLuint ↔ WebGL nesnesi (0 = yok). */
class Handles<T> {
  private next = 1;
  private map = new Map<number, T>();
  add(obj: T) {
    const id = this.next++;
    this.map.set(id, obj);
    return id;
  }
  get(id: number): T | null {
    return id ? (this.map.get(id) ?? null) : null;
  }
  delete(id: number) {
    const obj = this.map.get(id);
    this.map.delete(id);
    return obj;
  }
}

export class ModernGL {
  private gl: WebGL2RenderingContext;
  private buffers = new Handles<WebGLBuffer>();
  private arrays = new Handles<WebGLVertexArrayObject>();
  private shaders = new Handles<WebGLShader>();
  private programs = new Handles<WebGLProgram>();
  private textures = new Handles<WebGLTexture>();
  private uniforms = new Handles<WebGLUniformLocation>();
  private strings = new Map<string, number>();
  private viewport: [number, number, number, number];
  private viewportSet = false;

  constructor(
    canvas: Canvas,
    private o: Options,
  ) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: true, depth: true }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("Tarayıcı WebGL2 desteklemiyor");
    this.gl = gl;
    this.viewport = [0, 0, canvas.width, canvas.height];
  }

  /** Pencere boyutu değişti: program henüz glViewport çağırmadıysa varsayılan viewport'u güncelle (GLFW davranışı). */
  resize(w: number, h: number) {
    if (this.viewportSet) return;
    this.viewport = [0, 0, w, h];
    this.gl.viewport(0, 0, w, h);
  }

  private mem() {
    return this.o.memory().buffer;
  }
  private i32(ptr: number) {
    return new DataView(this.mem()).getInt32(ptr, true);
  }
  private u32(ptr: number) {
    return new DataView(this.mem()).getUint32(ptr, true);
  }
  private cstr(ptr: number, len = -1) {
    const bytes = new Uint8Array(this.mem());
    let end = len >= 0 ? ptr + len : ptr;
    if (len < 0) while (bytes[end]) end++;
    return new TextDecoder().decode(bytes.subarray(ptr, end));
  }
  private writeIds(n: number, ptr: number, make: () => number) {
    const view = new DataView(this.mem());
    for (let i = 0; i < n; i++) view.setUint32(ptr + i * 4, make(), true);
  }
  private eachId(n: number, ptr: number, fn: (id: number) => void) {
    for (let i = 0; i < n; i++) fn(this.u32(ptr + i * 4));
  }
  private writeLog(text: string, bufSize: number, lengthPtr: number, logPtr: number) {
    const data = new TextEncoder().encode(text).subarray(0, Math.max(0, bufSize - 1));
    if (logPtr && bufSize > 0) {
      const bytes = new Uint8Array(this.mem());
      bytes.set(data, logPtr);
      bytes[logPtr + data.length] = 0;
    }
    if (lengthPtr) new DataView(this.mem()).setInt32(lengthPtr, data.length, true);
  }
  private cString(text: string) {
    if (!this.strings.has(text)) {
      const data = new TextEncoder().encode(text);
      const ptr = this.o.malloc(data.length + 1);
      const bytes = new Uint8Array(this.mem());
      bytes.set(data, ptr);
      bytes[ptr + data.length] = 0;
      this.strings.set(text, ptr);
    }
    return this.strings.get(text)!;
  }
  private renderer() {
    const ext = this.gl.getExtension("WEBGL_debug_renderer_info");
    return String(ext ? this.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : this.gl.getParameter(this.gl.RENDERER));
  }
  private floats(ptr: number, n: number) {
    return new Float32Array(this.mem(), ptr, n).slice();
  }

  imports() {
    const gl = this.gl;
    return {
      // Durum ve çizim (sabit değerleri WebGL ile aynı)
      glClear: (m: number) => gl.clear(m),
      glClearColor: (r: number, g: number, b: number, a: number) => gl.clearColor(r, g, b, a),
      glViewport: (x: number, y: number, w: number, h: number) => {
        this.viewport = [x, y, w, h];
        this.viewportSet = true;
        gl.viewport(x, y, w, h);
      },
      glEnable: (c: number) => gl.enable(c),
      glDisable: (c: number) => gl.disable(c),
      glDepthFunc: (f: number) => gl.depthFunc(f),
      glBlendFunc: (s: number, d: number) => gl.blendFunc(s, d),
      glCullFace: (m: number) => gl.cullFace(m),
      glFrontFace: (m: number) => gl.frontFace(m),
      glLineWidth: (w: number) => gl.lineWidth(w),
      glFlush: () => gl.flush(),
      glFinish: () => gl.finish(),
      glGetError: () => gl.getError(),
      glGetString: (name: number) =>
        this.cString(
          name === C.VENDOR ? "OpenGL Web IDE (WebGL2)"
            : name === C.RENDERER ? this.renderer()
              : name === C.VERSION ? "3.3 Core (tarayıcı taklidi, WebGL 2.0)"
                : name === C.SHADING_LANGUAGE_VERSION ? "3.30 (GLSL ES 3.00'a çevrilir)" : "",
        ),
      glGetIntegerv: (pname: number, ptr: number) => {
        if (pname === C.VIEWPORT) new Int32Array(this.mem()).set(this.viewport, ptr >> 2);
        else new DataView(this.mem()).setInt32(ptr, Number(gl.getParameter(pname)) || 0, true);
      },
      glReadBuffer: () => {},
      glReadPixels: (x: number, y: number, w: number, h: number, format: number, _type: number, ptr: number) => {
        const rgba = new Uint8Array(w * h * 4);
        gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        const bytes = new Uint8Array(this.mem());
        if (format === C.RGBA) bytes.set(rgba, ptr);
        else for (let i = 0; i < w * h; i++) bytes.set(rgba.subarray(i * 4, i * 4 + 3), ptr + i * 3);
      },
      glDrawArrays: (mode: number, first: number, count: number) => gl.drawArrays(mode, first, count),
      glDrawElements: (mode: number, count: number, type: number, offset: number) => gl.drawElements(mode, count, type, offset),

      // Tamponlar ve köşe dizileri
      glGenBuffers: (n: number, ptr: number) => this.writeIds(n, ptr, () => this.buffers.add(gl.createBuffer()!)),
      glDeleteBuffers: (n: number, ptr: number) => this.eachId(n, ptr, (id) => gl.deleteBuffer(this.buffers.delete(id) ?? null)),
      glBindBuffer: (target: number, id: number) => gl.bindBuffer(target, this.buffers.get(id)),
      glBufferData: (target: number, size: number, ptr: number, usage: number) => {
        if (ptr) gl.bufferData(target, new Uint8Array(this.mem(), ptr, size), usage);
        else gl.bufferData(target, size, usage);
      },
      glBufferSubData: (target: number, offset: number, size: number, ptr: number) =>
        gl.bufferSubData(target, offset, new Uint8Array(this.mem(), ptr, size)),
      glGenVertexArrays: (n: number, ptr: number) => this.writeIds(n, ptr, () => this.arrays.add(gl.createVertexArray()!)),
      glDeleteVertexArrays: (n: number, ptr: number) =>
        this.eachId(n, ptr, (id) => gl.deleteVertexArray(this.arrays.delete(id) ?? null)),
      glBindVertexArray: (id: number) => gl.bindVertexArray(this.arrays.get(id)),
      glVertexAttribPointer: (i: number, size: number, type: number, norm: number, stride: number, offset: number) =>
        gl.vertexAttribPointer(i, size, type, !!norm, stride, offset),
      glEnableVertexAttribArray: (i: number) => gl.enableVertexAttribArray(i),
      glDisableVertexAttribArray: (i: number) => gl.disableVertexAttribArray(i),

      // Shader ve program
      glCreateShader: (type: number) => this.shaders.add(gl.createShader(type)!),
      glShaderSource: (id: number, count: number, stringsPtr: number, lengthsPtr: number) => {
        let src = "";
        for (let i = 0; i < count; i++) {
          const len = lengthsPtr ? this.i32(lengthsPtr + i * 4) : -1;
          src += this.cstr(this.u32(stringsPtr + i * 4), len);
        }
        gl.shaderSource(this.shaders.get(id)!, translateGlsl(src));
      },
      glCompileShader: (id: number) => gl.compileShader(this.shaders.get(id)!),
      glGetShaderiv: (id: number, pname: number, ptr: number) => {
        const s = this.shaders.get(id)!;
        const value = pname === C.COMPILE_STATUS ? Number(!!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          : pname === C.INFO_LOG_LENGTH ? (gl.getShaderInfoLog(s) ?? "").length + 1
            : Number(gl.getShaderParameter(s, pname)) || 0;
        new DataView(this.mem()).setInt32(ptr, value, true);
      },
      glGetShaderInfoLog: (id: number, bufSize: number, lengthPtr: number, logPtr: number) =>
        this.writeLog(gl.getShaderInfoLog(this.shaders.get(id)!) ?? "", bufSize, lengthPtr, logPtr),
      glDeleteShader: (id: number) => gl.deleteShader(this.shaders.delete(id) ?? null),
      glCreateProgram: () => this.programs.add(gl.createProgram()!),
      glAttachShader: (p: number, s: number) => gl.attachShader(this.programs.get(p)!, this.shaders.get(s)!),
      glLinkProgram: (p: number) => gl.linkProgram(this.programs.get(p)!),
      glGetProgramiv: (id: number, pname: number, ptr: number) => {
        const p = this.programs.get(id)!;
        const value = pname === C.LINK_STATUS ? Number(!!gl.getProgramParameter(p, gl.LINK_STATUS))
          : pname === C.INFO_LOG_LENGTH ? (gl.getProgramInfoLog(p) ?? "").length + 1
            : Number(gl.getProgramParameter(p, pname)) || 0;
        new DataView(this.mem()).setInt32(ptr, value, true);
      },
      glGetProgramInfoLog: (id: number, bufSize: number, lengthPtr: number, logPtr: number) =>
        this.writeLog(gl.getProgramInfoLog(this.programs.get(id)!) ?? "", bufSize, lengthPtr, logPtr),
      glUseProgram: (id: number) => gl.useProgram(this.programs.get(id)),
      glDeleteProgram: (id: number) => gl.deleteProgram(this.programs.delete(id) ?? null),
      glGetUniformLocation: (p: number, namePtr: number) => {
        const loc = gl.getUniformLocation(this.programs.get(p)!, this.cstr(namePtr));
        return loc ? this.uniforms.add(loc) : -1;
      },
      glGetAttribLocation: (p: number, namePtr: number) => gl.getAttribLocation(this.programs.get(p)!, this.cstr(namePtr)),
      glUniform1i: (l: number, v: number) => gl.uniform1i(this.uniforms.get(l), v),
      glUniform1f: (l: number, v: number) => gl.uniform1f(this.uniforms.get(l), v),
      glUniform2f: (l: number, a: number, b: number) => gl.uniform2f(this.uniforms.get(l), a, b),
      glUniform3f: (l: number, a: number, b: number, c: number) => gl.uniform3f(this.uniforms.get(l), a, b, c),
      glUniform4f: (l: number, a: number, b: number, c: number, d: number) => gl.uniform4f(this.uniforms.get(l), a, b, c, d),
      glUniform3fv: (l: number, n: number, ptr: number) => gl.uniform3fv(this.uniforms.get(l), this.floats(ptr, 3 * n)),
      glUniform4fv: (l: number, n: number, ptr: number) => gl.uniform4fv(this.uniforms.get(l), this.floats(ptr, 4 * n)),
      glUniformMatrix3fv: (l: number, n: number, t: number, ptr: number) =>
        gl.uniformMatrix3fv(this.uniforms.get(l), !!t, this.floats(ptr, 9 * n)),
      glUniformMatrix4fv: (l: number, n: number, t: number, ptr: number) =>
        gl.uniformMatrix4fv(this.uniforms.get(l), !!t, this.floats(ptr, 16 * n)),

      // Dokular
      glGenTextures: (n: number, ptr: number) => this.writeIds(n, ptr, () => this.textures.add(gl.createTexture()!)),
      glDeleteTextures: (n: number, ptr: number) => this.eachId(n, ptr, (id) => gl.deleteTexture(this.textures.delete(id) ?? null)),
      glBindTexture: (target: number, id: number) => gl.bindTexture(target, this.textures.get(id)),
      glActiveTexture: (unit: number) => gl.activeTexture(unit),
      glTexParameteri: (target: number, pname: number, v: number) => gl.texParameteri(target, pname, v),
      glTexImage2D: (target: number, level: number, internal: number, w: number, h: number, border: number, format: number,
        type: number, ptr: number) => {
        const channels = format === C.RGBA ? 4 : format === 0x1907 ? 3 : 1;
        const rowBytes = Math.ceil((w * channels) / 4) * 4; // GL_UNPACK_ALIGNMENT = 4
        const data = ptr ? new Uint8Array(this.mem(), ptr, rowBytes * h) : null;
        gl.texImage2D(target, level, internal, w, h, border, format, type, data);
      },
      glGenerateMipmap: (target: number) => gl.generateMipmap(target),
    };
  }
}
