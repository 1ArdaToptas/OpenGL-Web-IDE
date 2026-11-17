// Derlenmiş programı ayrı bir Worker'da (OffscreenCanvas) çalıştıran ana iş parçacığı denetleyicisi.
// Program sonsuz döngüye girse bile Durdur/zaman aşımı worker.terminate() ile anında çalışır; sayfa donmaz.
import type { InputEvent } from "./glut";

export interface RunResult {
  code: number;
  reason: "exit" | "timeout" | "killed" | "error";
  durationMs: number;
  outputTruncated: boolean;
}

interface Options {
  canvas: HTMLCanvasElement;
  wasm: Uint8Array;
  env?: Record<string, string>;
  /** legacy: FreeGLUT + OpenGL 1.x taklidi; modern: GLFW + GL 3.3 → WebGL2 (JSPI gerekir). */
  profile?: "legacy" | "modern";
  /** Programın fopen ile okuyabileceği proje dosyaları (ör. shaders/*.vert), salt okunur. */
  files?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
  onOutput: (stream: "stdout" | "stderr", text: string) => void;
  onExit: (result: RunResult) => void;
  onTitle?: (title: string) => void;
  createWorker?: () => Worker;
}

type WorkerMessage =
  | { type: "stdout" | "stderr" | "title"; text: string }
  | { type: "size"; width: number; height: number }
  | { type: "exit"; code: number; reason: "exit" | "error" }
  | { type: "error"; message: string };

// Yazdırılabilir karakterlerin yanında iletilen özel tuşlar (GLFW programları için).
const SPECIAL_KEYS = new Set(["Escape", "Enter", "Tab", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const forwarded = (key: string) => key.length === 1 || SPECIAL_KEYS.has(key);

const defaultWorker = () => new Worker(new URL("./program-worker.ts", import.meta.url), { type: "module" });

export class ProgramRunner {
  private worker: Worker | null = null;
  private finished = false;
  private startedAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private outputBytes = 0;
  private truncated = false;
  private size: [number, number];
  private lastMouse: [number, number] = [0, 0];
  private listeners: [string, EventListener][] = [];
  private readonly encoder = new TextEncoder();

  constructor(private o: Options) {
    this.size = [o.canvas.width, o.canvas.height];
  }

  start(): void {
    const { canvas, wasm, env = {}, timeoutMs = 300_000, profile = "legacy", files = {} } = this.o;
    const worker = (this.o.createWorker ?? defaultWorker)();
    this.worker = worker;
    this.startedAt = performance.now();
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => this.onMessage(e.data);
    const offscreen = canvas.transferControlToOffscreen();
    const buffer = wasm.slice().buffer; // kopya: çağıranın dizisi aktarımla boşalmasın
    worker.postMessage({ type: "start", wasm: buffer, canvas: offscreen, env, profile, files }, [offscreen, buffer]);
    this.timer = setTimeout(() => this.finish(1, "timeout"), timeoutMs);
    this.listen();
  }

  stop(): void {
    this.finish(1, "killed");
  }

  private onMessage(m: WorkerMessage) {
    if (this.finished) return;
    if (m.type === "stdout" || m.type === "stderr") this.output(m.type, m.text);
    else if (m.type === "title") this.o.onTitle?.(m.text);
    else if (m.type === "size") this.size = [m.width, m.height];
    else if (m.type === "exit") this.finish(m.code, m.reason);
    else if (m.type === "error") {
      this.output("stderr", `\nÇalışma hatası: ${m.message}\n`);
      this.finish(1, "error");
    }
  }

  private output(stream: "stdout" | "stderr", text: string) {
    if (this.truncated) return;
    const limit = this.o.maxOutputBytes ?? 1_000_000;
    const bytes = this.encoder.encode(text);
    if (this.outputBytes + bytes.length > limit) {
      this.truncated = true;
      const room = Math.max(0, limit - this.outputBytes);
      text = new TextDecoder().decode(bytes.subarray(0, room));
      this.outputBytes = limit;
    } else {
      this.outputBytes += bytes.length;
    }
    if (text) this.o.onOutput(stream, text);
  }

  private finish(code: number, reason: RunResult["reason"]) {
    if (this.finished) return;
    this.finished = true;
    if (this.timer) clearTimeout(this.timer);
    this.worker?.terminate();
    for (const [type, fn] of this.listeners) this.o.canvas.removeEventListener(type, fn);
    this.listeners = [];
    this.o.onExit({
      code,
      reason,
      durationMs: Math.round(performance.now() - this.startedAt),
      outputTruncated: this.truncated,
    });
  }

  /** İstemci koordinatı → pencere pikseli (kenarlık ve CSS ölçeği hesaba katılır). */
  private point(e: MouseEvent): [number, number] {
    const c = this.o.canvas;
    const r = c.getBoundingClientRect();
    const [w, h] = this.size;
    const x = ((e.clientX - r.left - c.clientLeft) * w) / (c.clientWidth || w);
    const y = ((e.clientY - r.top - c.clientTop) * h) / (c.clientHeight || h);
    return [Math.min(w - 1, Math.max(0, Math.floor(x))), Math.min(h - 1, Math.max(0, Math.floor(y)))];
  }

  private send(event: InputEvent) {
    this.worker?.postMessage({ type: "input", event });
  }

  private listen() {
    const on = (type: string, fn: (e: Event) => void) => {
      this.o.canvas.addEventListener(type, fn);
      this.listeners.push([type, fn]);
    };
    on("mousemove", (e) => {
      this.lastMouse = this.point(e as MouseEvent);
      this.send({ type: "move", x: this.lastMouse[0], y: this.lastMouse[1] });
    });
    for (const [type, state] of [["mousedown", 0], ["mouseup", 1]] as const) {
      on(type, (e) => {
        const me = e as MouseEvent;
        this.o.canvas.focus();
        const [x, y] = this.point(me);
        this.send({ type: "mouse", button: me.button, state, x, y });
      });
    }
    for (const [type, kind] of [["keydown", "key"], ["keyup", "keyup"]] as const) {
      on(type, (e) => {
        const ke = e as KeyboardEvent;
        if (!forwarded(ke.key)) return;
        ke.preventDefault();
        this.send({ type: kind, key: ke.key, x: this.lastMouse[0], y: this.lastMouse[1] });
      });
    }
  }
}
