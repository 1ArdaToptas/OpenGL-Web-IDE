import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramRunner, type RunResult } from "./runner";

class FakeWorker {
  posted: { msg: Record<string, unknown>; transfer?: Transferable[] }[] = [];
  terminated = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(msg: Record<string, unknown>, transfer?: Transferable[]) {
    this.posted.push({ msg, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}

function fakeCanvas() {
  const listeners = new Map<string, EventListener>();
  const offscreen = { kind: "offscreen" };
  const canvas = {
    width: 300,
    height: 150,
    clientLeft: 1,
    clientTop: 1,
    clientWidth: 400,
    clientHeight: 300,
    transferControlToOffscreen: () => offscreen,
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
    addEventListener: (t: string, f: EventListener) => listeners.set(t, f),
    removeEventListener: (t: string) => listeners.delete(t),
    focus: () => {},
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, listeners, offscreen };
}

function setup(over: Partial<ConstructorParameters<typeof ProgramRunner>[0]> = {}) {
  const worker = new FakeWorker();
  const { canvas, listeners, offscreen } = fakeCanvas();
  const onOutput = vi.fn();
  const onExit = vi.fn<(r: RunResult) => void>();
  const onTitle = vi.fn();
  const wasm = new Uint8Array([0, 97, 115, 109]);
  const runner = new ProgramRunner({
    canvas, wasm, env: { A: "1" }, onOutput, onExit, onTitle, profile: "modern", files: { "shaders/a.vert": "v" },
    createWorker: () => worker as unknown as Worker, ...over,
  });
  runner.start();
  return { runner, worker, listeners, offscreen, onOutput, onExit, onTitle, wasm };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ProgramRunner", () => {
  it("canvas'ı OffscreenCanvas olarak ve wasm'ı aktarımla Worker'a verir", () => {
    const { worker, offscreen, wasm } = setup();
    const { msg, transfer } = worker.posted[0];
    expect(msg).toMatchObject({ type: "start", canvas: offscreen, env: { A: "1" }, profile: "modern", files: { "shaders/a.vert": "v" } });
    expect(transfer).toContain(offscreen);
    expect(new Uint8Array(msg.wasm as ArrayBuffer)).toEqual(wasm);
  });

  it("stdout/stderr ve başlığı iletir", () => {
    const { worker, onOutput, onTitle } = setup();
    worker.emit({ type: "stdout", text: "merhaba\n" });
    worker.emit({ type: "stderr", text: "uyarı\n" });
    worker.emit({ type: "title", text: "Pencere" });
    expect(onOutput.mock.calls).toEqual([["stdout", "merhaba\n"], ["stderr", "uyarı\n"]]);
    expect(onTitle).toHaveBeenCalledWith("Pencere");
  });

  it("program bitince sonucu bildirir, Worker'ı ve dinleyicileri kapatır", () => {
    const { worker, listeners, onExit } = setup();
    vi.advanceTimersByTime(250);
    worker.emit({ type: "exit", code: 0, reason: "exit" });
    expect(onExit).toHaveBeenCalledWith(expect.objectContaining({ code: 0, reason: "exit", outputTruncated: false }));
    expect(onExit.mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(250);
    expect(worker.terminated).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it("Durdur: Worker'ı hemen sonlandırır (sonsuz döngüde bile), tek kez bildirir", () => {
    const { runner, worker, onExit } = setup();
    runner.stop();
    worker.emit({ type: "exit", code: 0, reason: "exit" }); // geç gelen mesaj yok sayılır
    expect(worker.terminated).toBe(true);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit.mock.calls[0][0]).toMatchObject({ reason: "killed", code: 1 });
  });

  it("zaman aşımında sonlandırır", () => {
    const { worker, onExit } = setup({ timeoutMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(worker.terminated).toBe(true);
    expect(onExit.mock.calls[0][0]).toMatchObject({ reason: "timeout" });
  });

  it("çıktı sınırını aşan kısmı keser ama programı durdurmaz", () => {
    const { worker, onOutput, onExit } = setup({ maxOutputBytes: 10 });
    worker.emit({ type: "stdout", text: "123456" });
    worker.emit({ type: "stdout", text: "789012345" });
    worker.emit({ type: "stdout", text: "fazla" });
    expect(onOutput.mock.calls.map((c) => c[1]).join("")).toBe("1234567890");
    expect(worker.terminated).toBe(false);
    worker.emit({ type: "exit", code: 0, reason: "exit" });
    expect(onExit.mock.calls[0][0].outputTruncated).toBe(true);
  });

  it("Worker'daki beklenmeyen hata 'error' olarak biter", () => {
    const { worker, onExit, onOutput } = setup();
    worker.emit({ type: "error", message: "WebGL2 yok" });
    expect(onOutput).toHaveBeenCalledWith("stderr", expect.stringContaining("WebGL2 yok"));
    expect(onExit.mock.calls[0][0]).toMatchObject({ reason: "error" });
  });

  it("fare olaylarını kenarlık ve ölçek hesaba katılarak pencere koordinatına çevirir", () => {
    const { worker, listeners } = setup();
    worker.emit({ type: "size", width: 800, height: 600 });
    // içerik alanı: sol 10+1, üst 20+1; 400x300 CSS → 800x600 piksel (2x)
    listeners.get("mousedown")!({ clientX: 11 + 100, clientY: 21 + 50, button: 0 } as unknown as Event);
    expect(worker.posted.at(-1)!.msg).toEqual({ type: "input", event: { type: "mouse", button: 0, state: 0, x: 200, y: 100 } });
  });

  it("tuşu son fare konumuyla iletir; değiştirici tuşları yok sayar", () => {
    const { worker, listeners } = setup();
    worker.emit({ type: "size", width: 400, height: 300 });
    listeners.get("mousemove")!({ clientX: 11 + 5, clientY: 21 + 6 } as unknown as Event);
    expect(worker.posted.at(-1)!.msg).toEqual({ type: "input", event: { type: "move", x: 5, y: 6 } });
    listeners.get("keydown")!({ key: "Shift", preventDefault: () => {} } as unknown as Event);
    listeners.get("keydown")!({ key: "r", preventDefault: () => {} } as unknown as Event);
    expect(worker.posted.at(-1)!.msg).toEqual({ type: "input", event: { type: "key", key: "r", x: 5, y: 6 } });
    const keys = worker.posted.filter((p) => (p.msg.event as { type?: string } | undefined)?.type === "key");
    expect(keys).toHaveLength(1);
  });

  it("özel tuşları (Escape, oklar) ve tuş bırakmayı iletir (GLFW için)", () => {
    const { worker, listeners } = setup();
    listeners.get("keydown")!({ key: "Escape", preventDefault: () => {} } as unknown as Event);
    expect(worker.posted.at(-1)!.msg).toMatchObject({ event: { type: "key", key: "Escape" } });
    listeners.get("keyup")!({ key: "ArrowUp", preventDefault: () => {} } as unknown as Event);
    expect(worker.posted.at(-1)!.msg).toMatchObject({ event: { type: "keyup", key: "ArrowUp" } });
  });
});
