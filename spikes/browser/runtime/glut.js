// FreeGLUT taklidi: pencere = <canvas>, olay döngüsü = tarayıcı (setTimeout + requestAnimationFrame).
// glutMainLoop() çağrıldığında WebAssembly yığını bir JS istisnasıyla bırakılır; programın belleği
// ve global değişkenleri yerinde kalır, geri çağırmalar fonksiyon tablosu üzerinden çalışır.

export class MainLoopStarted extends Error {}

const GLUT_WINDOW_WIDTH = 0x66;
const GLUT_WINDOW_HEIGHT = 0x67;
const GLUT_ELAPSED_TIME = 0x2bc;

export class Glut {
  constructor(canvas, { memory, table, onTitle, onCallbackError, onLeave }) {
    this.canvas = canvas;
    this.memory = memory;
    this.table = table;
    this.onTitle = onTitle ?? (() => {});
    this.onCallbackError = onCallbackError;
    this.onLeave = onLeave;
    this.cb = {};
    this.timers = new Set();
    this.frame = 0;
    this.redisplay = false;
    this.running = false;
    this.window = 0;
    this.started = performance.now();
    this.listeners = [];
  }

  #string(ptr) {
    const mem = new Uint8Array(this.memory().buffer);
    let end = ptr;
    while (mem[end]) end++;
    return new TextDecoder().decode(mem.subarray(ptr, end));
  }

  /** C geri çağırmasını çalıştırır; programın hatası (exit, tuzak) döngüyü durdurur. */
  call(fnIndex, ...args) {
    if (!this.running || !fnIndex) return;
    try {
      this.table().get(fnIndex)(...args);
    } catch (e) {
      this.onCallbackError(e);
    }
  }

  #schedule() {
    if (!this.frame && this.running) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        if (this.redisplay) {
          this.redisplay = false;
          this.call(this.cb.display);
        }
        if (this.cb.idle) {
          this.call(this.cb.idle);
          this.#schedule();
        }
      });
    }
  }

  /** Fare konumu → pencere (canvas piksel) koordinatı; kenarlık ve CSS ölçeği hesaba katılır. */
  #canvasPoint(e) {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left - c.clientLeft;
    const y = e.clientY - r.top - c.clientTop;
    return [
      Math.min(c.width - 1, Math.max(0, Math.floor((x * c.width) / c.clientWidth))),
      Math.min(c.height - 1, Math.max(0, Math.floor((y * c.height) / c.clientHeight))),
    ];
  }

  #listen(type, handler) {
    this.canvas.addEventListener(type, handler);
    this.listeners.push([type, handler]);
  }

  stop() {
    this.running = false;
    this.window = 0;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const [type, handler] of this.listeners) this.canvas.removeEventListener(type, handler);
    this.listeners = [];
  }

  imports() {
    return {
      glutInit: () => {},
      glutInitDisplayMode: () => {},
      glutInitWindowPosition: () => {},
      glutInitContextVersion: () => {},
      glutInitContextProfile: () => {},
      glutSetOption: () => {},
      glutInitWindowSize: (w, h) => {
        this.canvas.width = w;
        this.canvas.height = h;
      },
      glutCreateWindow: (titlePtr) => {
        this.onTitle(this.#string(titlePtr));
        this.window = 1;
        return 1;
      },
      glutGetWindow: () => this.window,
      glutGet: (what) =>
        what === GLUT_WINDOW_WIDTH ? this.canvas.width
          : what === GLUT_WINDOW_HEIGHT ? this.canvas.height
            : what === GLUT_ELAPSED_TIME ? Math.round(performance.now() - this.started) : 0,

      glutDisplayFunc: (fn) => (this.cb.display = fn),
      glutReshapeFunc: (fn) => (this.cb.reshape = fn),
      glutIdleFunc: (fn) => (this.cb.idle = fn),
      glutKeyboardFunc: (fn) => (this.cb.keyboard = fn),
      glutMouseFunc: (fn) => (this.cb.mouse = fn),
      glutTimerFunc: (ms, fn, value) => {
        const t = setTimeout(() => {
          this.timers.delete(t);
          this.call(fn, value);
        }, ms);
        this.timers.add(t);
      },

      glutPostRedisplay: () => {
        this.redisplay = true;
        this.#schedule();
      },
      glutSwapBuffers: () => {}, // WebGL kareyi rAF sonunda kendisi gösterir

      glutMainLoop: () => {
        this.running = true;
        this.#listen("keydown", (e) => {
          if (e.key.length === 1 && this.cb.keyboard) {
            e.preventDefault();
            this.call(this.cb.keyboard, e.key.charCodeAt(0) & 0xff, ...(this.lastMouse ?? [0, 0]));
          }
        });
        this.#listen("mousemove", (e) => (this.lastMouse = this.#canvasPoint(e)));
        for (const [type, state] of [["mousedown", 0], ["mouseup", 1]]) {
          this.#listen(type, (e) => {
            this.canvas.focus();
            if (this.cb.mouse) this.call(this.cb.mouse, e.button, state, ...this.#canvasPoint(e));
          });
        }
        if (this.cb.reshape) this.call(this.cb.reshape, this.canvas.width, this.canvas.height);
        this.redisplay = true;
        this.#schedule();
        throw new MainLoopStarted();
      },
      glutLeaveMainLoop: () => {
        this.stop();
        this.onLeave();
      },
    };
  }
}
