import { describe, expect, it, vi } from "vitest";
import { Glfw, glfwKeyFromBrowser } from "./glfw";

function setup() {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const surface = { width: 300, height: 150 };
  const fns = new Map<number, ReturnType<typeof vi.fn>>();
  const fn = (idx: number) => {
    fns.set(idx, vi.fn());
    return idx;
  };
  const frames: (() => void)[] = [];
  let now = 1000;
  const onTitle = vi.fn();
  const onResize = vi.fn();
  const glfw = new Glfw(surface, {
    memory: () => memory,
    table: () => ({ get: (i: number) => fns.get(i)! }) as unknown as WebAssembly.Table,
    onTitle,
    onResize,
    requestFrame: (cb) => void frames.push(cb),
    now: () => now,
  });
  const api = glfw.imports();
  const bytes = new Uint8Array(memory.buffer);
  const view = new DataView(memory.buffer);
  const cstr = (ptr: number, s: string) => bytes.set(new TextEncoder().encode(`${s}\0`), ptr);
  return { glfw, api, surface, fn, fns, frames, onTitle, onResize, view, cstr, tick: (ms: number) => (now += ms) };
}

describe("glfwKeyFromBrowser", () => {
  it.each([
    ["a", 65], ["A", 65], ["z", 90], ["5", 53], [" ", 32], ["Escape", 256], ["Enter", 257],
    ["ArrowRight", 262], ["ArrowLeft", 263], ["ArrowDown", 264], ["ArrowUp", 265],
  ])("%s → %i", (key, code) => expect(glfwKeyFromBrowser(key)).toBe(code));

  it("bilinmeyen tuş -1 (GLFW_KEY_UNKNOWN)", () => expect(glfwKeyFromBrowser("F13")).toBe(-1));
});

describe("Glfw", () => {
  it("glfwCreateWindow canvas boyutunu ve başlığı ayarlar, sıfırdan farklı tanıtıcı döner", () => {
    const { api, surface, onTitle, onResize, cstr } = setup();
    cstr(64, "Pencere");
    expect(api.glfwInit()).toBe(1);
    const win = api.glfwCreateWindow(800, 600, 64, 0, 0);
    expect(win).not.toBe(0);
    expect(surface).toEqual({ width: 800, height: 600 });
    expect(onTitle).toHaveBeenCalledWith("Pencere");
    expect(onResize).toHaveBeenCalledWith(800, 600);
  });

  it("kapanma bayrağı", () => {
    const { api } = setup();
    const win = api.glfwCreateWindow(10, 10, 0, 0, 0);
    expect(api.glfwWindowShouldClose(win)).toBe(0);
    api.glfwSetWindowShouldClose(win, 1);
    expect(api.glfwWindowShouldClose(win)).toBe(1);
  });

  it("glfwGetTime glfwInit'ten beri saniye", () => {
    const { api, tick } = setup();
    api.glfwInit();
    tick(1500);
    expect(api.glfwGetTime()).toBeCloseTo(1.5);
  });

  it("glfwGetFramebufferSize işaretçilere yazar", () => {
    const { api, view } = setup();
    const win = api.glfwCreateWindow(640, 480, 0, 0, 0);
    api.glfwGetFramebufferSize(win, 100, 104);
    expect([view.getInt32(100, true), view.getInt32(104, true)]).toEqual([640, 480]);
  });

  it("glfwSwapBuffers bir sonraki kareye kadar bekler (Promise)", async () => {
    const { api, frames } = setup();
    let done = false;
    const p = (api.glfwSwapBuffers(1) as Promise<void>).then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    frames.shift()!();
    await p;
    expect(done).toBe(true);
  });

  it("girdi kuyruğu glfwPollEvents'te geri çağırmalara dağıtılır; glfwGetKey durumu izler", () => {
    const { glfw, api, fn, fns } = setup();
    const win = api.glfwCreateWindow(800, 600, 0, 0, 0);
    api.glfwSetKeyCallback(win, fn(7));
    api.glfwSetMouseButtonCallback(win, fn(8));
    glfw.input({ type: "key", key: "w", x: 0, y: 0 });
    glfw.input({ type: "mouse", button: 0, state: 0, x: 10, y: 20 });
    expect(fns.get(7)).not.toHaveBeenCalled(); // PollEvents'e kadar beklenir
    expect(api.glfwGetKey(win, 87)).toBe(1); // durum hemen güncel
    api.glfwPollEvents();
    expect(fns.get(7)).toHaveBeenCalledWith(win, 87, 0, 1, 0);
    expect(fns.get(8)).toHaveBeenCalledWith(win, 0, 1, 0); // GLUT_DOWN → GLFW_PRESS
    glfw.input({ type: "keyup", key: "w", x: 0, y: 0 });
    api.glfwPollEvents();
    expect(fns.get(7)).toHaveBeenLastCalledWith(win, 87, 0, 0, 0);
    expect(api.glfwGetKey(win, 87)).toBe(0);
  });

  it("imleç konumu ve geri çağırması (double)", () => {
    const { glfw, api, fn, fns, view } = setup();
    const win = api.glfwCreateWindow(800, 600, 0, 0, 0);
    api.glfwSetCursorPosCallback(win, fn(9));
    glfw.input({ type: "move", x: 12, y: 34 });
    api.glfwPollEvents();
    expect(fns.get(9)).toHaveBeenCalledWith(win, 12, 34);
    api.glfwGetCursorPos(win, 200, 208);
    expect([view.getFloat64(200, true), view.getFloat64(208, true)]).toEqual([12, 34]);
  });

  it("glfwSetErrorCallback önceki geri çağırmayı döner", () => {
    const { api } = setup();
    expect(api.glfwSetErrorCallback(5)).toBe(0);
    expect(api.glfwSetErrorCallback(6)).toBe(5);
  });
});
