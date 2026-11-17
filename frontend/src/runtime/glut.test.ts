import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Glut, MainLoopStarted } from "./glut";

function setup() {
  const fns = new Map<number, ReturnType<typeof vi.fn>>();
  const fn = (idx: number) => {
    const f = vi.fn();
    fns.set(idx, f);
    return idx;
  };
  const surface = { width: 300, height: 150 };
  const frames: (() => void)[] = [];
  const onCallbackError = vi.fn();
  const onLeave = vi.fn();
  const onResize = vi.fn();
  const onTitle = vi.fn();
  const memory = new WebAssembly.Memory({ initial: 1 });
  const glut = new Glut(surface, {
    memory: () => memory,
    table: () => ({ get: (i: number) => fns.get(i)! }) as unknown as WebAssembly.Table,
    onTitle,
    onResize,
    onCallbackError,
    onLeave,
    requestFrame: (cb) => {
      frames.push(cb);
      return frames.length;
    },
    cancelFrame: () => {},
  });
  const api = glut.imports();
  const runFrames = () => {
    while (frames.length) frames.shift()!();
  };
  return { glut, api, fn, fns, surface, runFrames, onCallbackError, onLeave, onResize, onTitle, memory };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Glut", () => {
  it("pencere boyutu yüzeye uygulanır ve bildirilir", () => {
    const { api, surface, onResize } = setup();
    api.glutInitWindowSize(800, 600);
    expect(surface).toEqual({ width: 800, height: 600 });
    expect(onResize).toHaveBeenCalledWith(800, 600);
  });

  it("glutCreateWindow başlığı C dizesinden okur", () => {
    const { api, memory, onTitle } = setup();
    new Uint8Array(memory.buffer).set(new TextEncoder().encode("Başlık\0"), 64);
    expect(api.glutCreateWindow(64)).toBe(1);
    expect(onTitle).toHaveBeenCalledWith("Başlık");
  });

  it("glutMainLoop: reshape + ilk çizim, sonra yığını bırakır", () => {
    const { api, fn, fns, runFrames } = setup();
    api.glutInitWindowSize(640, 480);
    api.glutDisplayFunc(fn(1));
    api.glutReshapeFunc(fn(2));
    expect(() => api.glutMainLoop()).toThrow(MainLoopStarted);
    expect(fns.get(2)).toHaveBeenCalledWith(640, 480);
    runFrames();
    expect(fns.get(1)).toHaveBeenCalledTimes(1);
  });

  it("aynı karede birden çok glutPostRedisplay tek çizim yapar", () => {
    const { api, fn, fns, runFrames } = setup();
    api.glutDisplayFunc(fn(1));
    expect(() => api.glutMainLoop()).toThrow(MainLoopStarted);
    runFrames();
    api.glutPostRedisplay();
    api.glutPostRedisplay();
    api.glutPostRedisplay();
    runFrames();
    expect(fns.get(1)).toHaveBeenCalledTimes(2);
  });

  it("glutTimerFunc değeri ile süre sonunda çağırır", () => {
    const { api, fn, fns } = setup();
    expect(() => api.glutMainLoop()).toThrow(MainLoopStarted);
    api.glutTimerFunc(16, fn(3), 42);
    vi.advanceTimersByTime(15);
    expect(fns.get(3)).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fns.get(3)).toHaveBeenCalledWith(42);
  });

  it("glutLeaveMainLoop zamanlayıcıları iptal eder ve pencereyi kapatır", () => {
    const { api, fn, fns, onLeave } = setup();
    api.glutCreateWindow(0); // boş başlık (bellek sıfır)
    expect(() => api.glutMainLoop()).toThrow(MainLoopStarted);
    api.glutTimerFunc(10, fn(3), 0);
    expect(api.glutGetWindow()).toBe(1);
    api.glutLeaveMainLoop();
    vi.advanceTimersByTime(100);
    expect(fns.get(3)).not.toHaveBeenCalled();
    expect(api.glutGetWindow()).toBe(0);
    expect(onLeave).toHaveBeenCalled();
  });

  it("klavye ve fare olaylarını geri çağırmalara iletir", () => {
    const { glut, api, fn, fns } = setup();
    api.glutKeyboardFunc(fn(4));
    api.glutMouseFunc(fn(5));
    expect(() => api.glutMainLoop()).toThrow(MainLoopStarted);
    glut.input({ type: "mouse", button: 0, state: 0, x: 10, y: 20 });
    glut.input({ type: "key", key: "r", x: 10, y: 20 });
    expect(fns.get(5)).toHaveBeenCalledWith(0, 0, 10, 20);
    expect(fns.get(4)).toHaveBeenCalledWith("r".charCodeAt(0), 10, 20);
  });

  it("geri çağırmadaki hata döngüyü bildirir", () => {
    const { api, fn, fns, runFrames, onCallbackError } = setup();
    api.glutDisplayFunc(fn(1));
    fns.get(1)!.mockImplementation(() => {
      throw new Error("tuzak");
    });
    expect(() => api.glutMainLoop()).toThrow(MainLoopStarted);
    runFrames();
    expect(onCallbackError).toHaveBeenCalledWith(expect.objectContaining({ message: "tuzak" }));
  });

  it("ana döngü başlamadan olaylar çağrılmaz", () => {
    const { glut, api, fn, fns } = setup();
    api.glutKeyboardFunc(fn(4));
    glut.input({ type: "key", key: "x", x: 0, y: 0 });
    expect(fns.get(4)).not.toHaveBeenCalled();
  });
});
