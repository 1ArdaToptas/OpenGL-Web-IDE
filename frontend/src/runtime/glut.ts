// FreeGLUT taklidi. Pencere = (Offscreen)Canvas yüzeyi; olay döngüsü = tarayıcı (setTimeout + kare zamanlayıcı).
// glutMainLoop() çağrıldığında WebAssembly yığını MainLoopStarted istisnasıyla bırakılır; programın belleği ve
// global değişkenleri kalır, geri çağırmalar fonksiyon tablosu üzerinden çalışır. DOM'a dokunmaz:
// girdi olayları input() ile verilir (program Worker içinde çalışabilsin diye).

export class MainLoopStarted extends Error {}

/** Ana iş parçacığından gelen girdi; key/keyup tarayıcı `KeyboardEvent.key` değerini taşır, state: 0 bas, 1 bırak. */
export type InputEvent =
  | { type: "key" | "keyup"; key: string; x: number; y: number }
  | { type: "mouse"; button: number; state: number; x: number; y: number }
  | { type: "move"; x: number; y: number };

interface Surface {
  width: number;
  height: number;
}

interface Options {
  memory: () => WebAssembly.Memory;
  table: () => WebAssembly.Table;
  onTitle: (title: string) => void;
  onResize: (width: number, height: number) => void;
  onCallbackError: (error: unknown) => void;
  onLeave: () => void;
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (id: number) => void;
}

const GLUT_WINDOW_WIDTH = 0x66;
const GLUT_WINDOW_HEIGHT = 0x67;
const GLUT_ELAPSED_TIME = 0x2bc;

type Callback = "display" | "reshape" | "idle" | "keyboard" | "mouse";

export class Glut {
  private cb: Partial<Record<Callback, number>> = {};
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private frame = 0;
  private redisplay = false;
  private running = false;
  private window = 0;
  private readonly started = performance.now();
  private readonly requestFrame: (cb: () => void) => number;
  private readonly cancelFrame: (id: number) => void;

  constructor(
    private surface: Surface,
    private o: Options,
  ) {
    const hasRaf = typeof requestAnimationFrame === "function";
    this.requestFrame = o.requestFrame ?? (hasRaf ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(cb, 16) as unknown as number);
    this.cancelFrame = o.cancelFrame ?? (hasRaf ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id));
  }

  private string(ptr: number): string {
    const mem = new Uint8Array(this.o.memory().buffer);
    let end = ptr;
    while (mem[end]) end++;
    return new TextDecoder().decode(mem.subarray(ptr, end));
  }

  /** C geri çağırmasını çalıştırır; programın hatası (exit, tuzak) bildirilir. */
  private call(fn: number | undefined, ...args: number[]) {
    if (!this.running || !fn) return;
    try {
      (this.o.table().get(fn) as (...a: number[]) => void)(...args);
    } catch (e) {
      this.o.onCallbackError(e);
    }
  }

  private schedule() {
    if (this.frame || !this.running) return;
    this.frame = this.requestFrame(() => {
      this.frame = 0;
      if (this.redisplay) {
        this.redisplay = false;
        this.call(this.cb.display);
      }
      if (this.cb.idle) {
        this.call(this.cb.idle);
        this.schedule();
      }
    });
  }

  /** Ana iş parçacığından gelen klavye/fare olayı (pencere koordinatlarında). */
  input(e: InputEvent) {
    // glutKeyboardFunc yalnızca yazdırılabilir karakterleri alır (özel tuşlar glutSpecialFunc ile — taklit edilmedi)
    if (e.type === "key" && e.key.length === 1) this.call(this.cb.keyboard, e.key.charCodeAt(0) & 0xff, e.x, e.y);
    else if (e.type === "mouse") this.call(this.cb.mouse, e.button, e.state, e.x, e.y);
  }

  stop() {
    this.running = false;
    this.window = 0;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.frame) this.cancelFrame(this.frame);
    this.frame = 0;
  }

  imports() {
    const noop = () => {};
    return {
      glutInit: noop,
      glutInitDisplayMode: noop,
      glutInitWindowPosition: noop,
      glutInitContextVersion: noop,
      glutInitContextProfile: noop,
      glutSetOption: noop,
      glutInitWindowSize: (w: number, h: number) => {
        this.surface.width = w;
        this.surface.height = h;
        this.o.onResize(w, h);
      },
      glutCreateWindow: (titlePtr: number) => {
        this.o.onTitle(this.string(titlePtr));
        this.window = 1;
        return 1;
      },
      glutGetWindow: () => this.window,
      glutGet: (what: number) =>
        what === GLUT_WINDOW_WIDTH ? this.surface.width
          : what === GLUT_WINDOW_HEIGHT ? this.surface.height
            : what === GLUT_ELAPSED_TIME ? Math.round(performance.now() - this.started) : 0,

      glutDisplayFunc: (fn: number) => void (this.cb.display = fn),
      glutReshapeFunc: (fn: number) => void (this.cb.reshape = fn),
      glutIdleFunc: (fn: number) => void (this.cb.idle = fn),
      glutKeyboardFunc: (fn: number) => void (this.cb.keyboard = fn),
      glutMouseFunc: (fn: number) => void (this.cb.mouse = fn),
      glutTimerFunc: (ms: number, fn: number, value: number) => {
        const t = setTimeout(() => {
          this.timers.delete(t);
          this.call(fn, value);
        }, ms);
        this.timers.add(t);
      },

      glutPostRedisplay: () => {
        this.redisplay = true;
        this.schedule();
      },
      glutSwapBuffers: noop, // WebGL kareyi kendisi gösterir

      glutMainLoop: (): void => {
        this.running = true;
        if (this.cb.reshape) this.call(this.cb.reshape, this.surface.width, this.surface.height);
        this.redisplay = true;
        this.schedule();
        throw new MainLoopStarted();
      },
      glutLeaveMainLoop: () => {
        this.stop();
        this.o.onLeave();
      },
    };
  }
}
