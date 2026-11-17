// GLFW 3 taklidi (modern profil). Pencere = (Offscreen)Canvas. GLFW programları kendi while döngüsünü yazar;
// glfwSwapBuffers bir Promise döner ve Worker'da JSPI (WebAssembly.Suspending) ile sarılır: program bir kare
// boyunca askıya alınır, tarayıcı kareyi gösterir ve girdi mesajlarını alır, sonra döngü devam eder.
import type { InputEvent } from "./glut";

interface Surface {
  width: number;
  height: number;
}

interface Options {
  memory: () => WebAssembly.Memory;
  table: () => WebAssembly.Table;
  onTitle: (title: string) => void;
  onResize: (width: number, height: number) => void;
  requestFrame?: (cb: () => void) => void;
  now?: () => number;
}

const WINDOW = 1; // tek pencere tanıtıcısı
const PRESS = 1;
const RELEASE = 0;

const SPECIAL: Record<string, number> = {
  " ": 32, Escape: 256, Enter: 257, Tab: 258, Backspace: 259,
  ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265,
};

/** Tarayıcı `KeyboardEvent.key` → GLFW tuş kodu (harfler büyük ASCII); bilinmeyen -1. */
export function glfwKeyFromBrowser(key: string): number {
  if (key in SPECIAL) return SPECIAL[key];
  if (key.length === 1) {
    const c = key.toUpperCase().charCodeAt(0);
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 39 && c <= 96)) return c;
  }
  return -1;
}

export class Glfw {
  private shouldClose = 0;
  private startTime: number;
  private cb: { error?: number; resize?: number; key?: number; mouse?: number; cursor?: number } = {};
  private keys = new Set<number>();
  private buttons = new Set<number>();
  private cursor: [number, number] = [0, 0];
  private queue: InputEvent[] = [];
  private readonly requestFrame: (cb: () => void) => void;
  private readonly now: () => number;

  constructor(
    private surface: Surface,
    private o: Options,
  ) {
    this.requestFrame = o.requestFrame ?? (typeof requestAnimationFrame === "function"
      ? (cb) => void requestAnimationFrame(() => cb())
      : (cb) => void setTimeout(cb, 16));
    this.now = o.now ?? (() => performance.now());
    this.startTime = this.now();
  }

  private string(ptr: number): string {
    if (!ptr) return "";
    const mem = new Uint8Array(this.o.memory().buffer);
    let end = ptr;
    while (mem[end]) end++;
    return new TextDecoder().decode(mem.subarray(ptr, end));
  }

  private call(fn: number | undefined, ...args: number[]) {
    if (fn) (this.o.table().get(fn) as (...a: number[]) => void)(...args);
  }

  /** Durum hemen güncellenir (glfwGetKey); geri çağırmalar glfwPollEvents'te çalışır (GLFW davranışı). */
  input(e: InputEvent) {
    if (e.type === "key" || e.type === "keyup") {
      const code = glfwKeyFromBrowser(e.key);
      if (code < 0) return;
      if (e.type === "key") this.keys.add(code);
      else this.keys.delete(code);
    } else if (e.type === "mouse") {
      if (e.state === 0) this.buttons.add(e.button);
      else this.buttons.delete(e.button);
      this.cursor = [e.x, e.y];
    } else {
      this.cursor = [e.x, e.y];
    }
    this.queue.push(e);
  }

  imports() {
    const view = () => new DataView(this.o.memory().buffer);
    const swap = <K extends keyof typeof this.cb>(k: K, fn: number) => {
      const prev = this.cb[k] ?? 0;
      this.cb[k] = fn;
      return prev;
    };
    return {
      glfwInit: () => {
        this.startTime = this.now();
        return 1;
      },
      glfwTerminate: () => {},
      glfwSetErrorCallback: (fn: number) => swap("error", fn),
      glfwWindowHint: () => {},
      glfwCreateWindow: (w: number, h: number, titlePtr: number, _monitor: number, _share: number) => {
        this.surface.width = w;
        this.surface.height = h;
        this.o.onResize(w, h);
        this.o.onTitle(this.string(titlePtr));
        return WINDOW;
      },
      glfwDestroyWindow: () => {},
      glfwMakeContextCurrent: () => {},
      glfwGetProcAddress: () => 0, // gladLoadGL bunu çağırmaz; işlevler doğrudan içe aktarılır
      gladLoadGL: () => 33, // GL 3.3
      glfwSwapInterval: () => {},
      glfwSwapBuffers: (_w: number) => new Promise<void>((resolve) => this.requestFrame(resolve)),
      glfwPollEvents: () => {
        const events = this.queue.splice(0);
        for (const e of events) {
          if (e.type === "key" || e.type === "keyup") {
            const code = glfwKeyFromBrowser(e.key);
            this.call(this.cb.key, WINDOW, code, 0, e.type === "key" ? PRESS : RELEASE, 0);
          } else if (e.type === "mouse") {
            this.call(this.cb.mouse, WINDOW, e.button, e.state === 0 ? PRESS : RELEASE, 0);
          } else {
            this.call(this.cb.cursor, WINDOW, e.x, e.y);
          }
        }
      },
      glfwWindowShouldClose: (_w: number) => this.shouldClose,
      glfwSetWindowShouldClose: (_w: number, v: number) => void (this.shouldClose = v ? 1 : 0),
      glfwSetWindowTitle: (_w: number, titlePtr: number) => this.o.onTitle(this.string(titlePtr)),
      glfwGetFramebufferSize: (_w: number, wPtr: number, hPtr: number) => {
        if (wPtr) view().setInt32(wPtr, this.surface.width, true);
        if (hPtr) view().setInt32(hPtr, this.surface.height, true);
      },
      glfwGetWindowSize: (_w: number, wPtr: number, hPtr: number) => {
        if (wPtr) view().setInt32(wPtr, this.surface.width, true);
        if (hPtr) view().setInt32(hPtr, this.surface.height, true);
      },
      glfwGetTime: () => (this.now() - this.startTime) / 1000,
      glfwGetKey: (_w: number, key: number) => (this.keys.has(key) ? PRESS : RELEASE),
      glfwGetMouseButton: (_w: number, b: number) => (this.buttons.has(b) ? PRESS : RELEASE),
      glfwGetCursorPos: (_w: number, xPtr: number, yPtr: number) => {
        if (xPtr) view().setFloat64(xPtr, this.cursor[0], true);
        if (yPtr) view().setFloat64(yPtr, this.cursor[1], true);
      },
      glfwSetFramebufferSizeCallback: (_w: number, fn: number) => swap("resize", fn),
      glfwSetKeyCallback: (_w: number, fn: number) => swap("key", fn),
      glfwSetMouseButtonCallback: (_w: number, fn: number) => swap("mouse", fn),
      glfwSetCursorPosCallback: (_w: number, fn: number) => swap("cursor", fn),
    };
  }
}
