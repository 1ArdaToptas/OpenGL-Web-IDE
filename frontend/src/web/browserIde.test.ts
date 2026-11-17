import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api";
import type { IdeEvent } from "../lib/types";
import { BrowserIde, type WebExample } from "./browserIde";
import { MemoryStore } from "./store";

const EXAMPLES: WebExample[] = [
  { id: "baslangic", profile: "legacy" as const, title: "Dönen üçgen", description: "d", kind: "animasyon" as const,
    files: { "src/main.c": "int main(void){return 0;}" } },
  { id: "sekiller", profile: "legacy" as const, title: "Şekiller", description: "d", kind: "statik" as const,
    files: { "src/main.c": "/* sekiller */" } },
  { id: "kup", profile: "modern" as const, title: "Küp", description: "d", kind: "statik" as const,
    files: { "src/main.c": "/* kup */", "shaders/kup.vert": "#version 330 core", "shaders/kup.frag": "#version 330 core" } },
];

function setup(compileOk = true) {
  const compile = vi.fn(async () => ({
    ok: compileOk,
    wasm: compileOk ? new Uint8Array([0, 97, 115, 109]) : undefined,
    output: compileOk ? "" : "src/main.c:1:1: error: kötü\n",
    diagnostics: compileOk ? [] : [{ file: "src/main.c", line: 1, col: 1, severity: "error" as const, message: "kötü" }],
    durationMs: 12,
  }));
  let runnerOpts: { onOutput: (s: "stdout" | "stderr", t: string) => void; onExit: (r: unknown) => void; env?: unknown };
  const stop = vi.fn();
  const createRunner = vi.fn((o: typeof runnerOpts) => {
    runnerOpts = o;
    return { start: vi.fn(), stop };
  });
  const canvas = {} as HTMLCanvasElement;
  const ide = new BrowserIde({
    store: new MemoryStore(),
    examples: EXAMPLES,
    compiler: { compile },
    createRunner: createRunner as never,
    createCanvas: () => canvas,
    rendererInfo: () => "Test GPU",
  });
  const events: IdeEvent[] = [];
  ide.createSocket("p", { onEvent: (e) => events.push(e), onStatus: vi.fn() });
  return { ide, api: ide.api, compile, createRunner, runner: () => runnerOpts, stop, events };
}

describe("BrowserIde", () => {
  it("proje oluşturma örneğin dosyalarını kopyalar ve listelenir", async () => {
    const { api } = setup();
    await api.createProject("p", "legacy", "sekiller");
    expect(await api.listProjects()).toEqual([{ name: "p", profile: "legacy" }]);
    expect((await api.readFile("p", "src/main.c")).content).toBe("/* sekiller */");
    expect(await api.tree("p")).toEqual([
      { path: "src", type: "dir" },
      { path: "src/main.c", type: "file", size: 14 },
    ]);
  });

  it("aynı ad 409, geçersiz ad 400", async () => {
    const { api } = setup();
    await api.createProject("p", "legacy");
    await expect(api.createProject("p", "legacy")).rejects.toMatchObject({ status: 409 });
    await expect(api.createProject("../x", "legacy")).rejects.toMatchObject({ status: 400 });
  });

  it("modern profil: shader dosyalarıyla oluşturulur ve çalıştırmaya profil + dosyalar iletilir", async () => {
    const { api, events, createRunner } = setup();
    await api.createProject("p", "modern", "kup"); // olaylar "p" projesine abone
    expect((await api.tree("p")).map((e) => e.path)).toContain("shaders/kup.vert");
    await api.build("p", {});
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe("job.exited"));
    await api.run("p", {});
    expect(createRunner).toHaveBeenCalledWith(expect.objectContaining({
      profile: "modern",
      files: expect.objectContaining({ "shaders/kup.vert": "#version 330 core" }),
    }));
  });

  it("dosya yaz / sil; geçersiz yol reddedilir", async () => {
    const { api } = setup();
    await api.createProject("p", "legacy");
    await api.writeFile("p", "src/util/a.h", "x");
    expect((await api.tree("p")).map((e) => e.path)).toEqual(["src", "src/main.c", "src/util", "src/util/a.h"]);
    await api.deleteFile("p", "src/util/a.h");
    await expect(api.readFile("p", "src/util/a.h")).rejects.toMatchObject({ status: 404 });
    await expect(api.writeFile("p", "src/a.exe", "x")).rejects.toBeInstanceOf(ApiError);
  });

  it("proje silinince dosyaları da silinir", async () => {
    const { api } = setup();
    await api.createProject("p", "legacy");
    await api.deleteProject("p");
    expect(await api.listProjects()).toEqual([]);
    await expect(api.tree("p")).rejects.toMatchObject({ status: 404 });
  });

  it("derleme: started → output → diagnostics → exited(ok) olaylarını yayınlar", async () => {
    const { api, events, compile } = setup();
    await api.createProject("p", "legacy");
    const { jobId } = await api.build("p", { config: "Release" });
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe("job.exited"));
    expect(compile).toHaveBeenCalledWith({ "src/main.c": "int main(void){return 0;}" }, { config: "Release" });
    expect(events.map((e) => e.type)).toEqual(["ready", "job.started", "job.output", "build.diagnostics", "job.exited"]);
    expect(events.at(-1)).toMatchObject({ jobId, kind: "build", ok: true, code: 0, reason: "exit" });
  });

  it("başarısız derleme teşhisleri iletir ve çalıştırmaya izin vermez", async () => {
    const { api, events } = setup(false);
    await api.createProject("p", "legacy");
    await api.build("p", {});
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe("job.exited"));
    expect(events.find((e) => e.type === "build.diagnostics")).toMatchObject({ items: [{ message: "kötü" }] });
    expect(events.at(-1)).toMatchObject({ ok: false, code: 1 });
    await expect(api.run("p", {})).rejects.toMatchObject({ status: 409 });
  });

  it("çalıştırma: runner'a wasm verir, çıktıyı ve çıkışı olay olarak yayınlar", async () => {
    const { api, events, runner, createRunner } = setup();
    await api.createProject("p", "legacy");
    await api.build("p", {});
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe("job.exited"));
    const { jobId } = await api.run("p", { test_frames: 5 });
    expect(createRunner).toHaveBeenCalledWith(expect.objectContaining({ env: { OGLIDE_TEST_FRAMES: "5" } }));
    runner().onOutput("stdout", "GL_RENDERER: x\n");
    runner().onExit({ code: 0, reason: "exit", durationMs: 40, outputTruncated: false });
    expect(events.slice(-3)).toEqual([
      { type: "job.started", jobId, kind: "run" },
      { type: "job.output", jobId, stream: "stdout", data: "GL_RENDERER: x\n" },
      { type: "job.exited", jobId, kind: "run", code: 0, reason: "exit", durationMs: 40, outputTruncated: false, limit: null },
    ]);
  });

  it("çalışırken ikinci iş 409; stop runner'ı durdurur", async () => {
    const { api, events, stop } = setup();
    await api.createProject("p", "legacy");
    await api.build("p", {});
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe("job.exited"));
    const { jobId } = await api.run("p", {});
    await expect(api.build("p", {})).rejects.toMatchObject({ status: 409 });
    await api.stop(jobId);
    expect(stop).toHaveBeenCalled();
  });

  it("sağlık: derleyici tarayıcıda, araç zinciri eksik değil", async () => {
    const { api } = setup();
    expect(await api.health()).toMatchObject({ toolchain: { ok: true, missing: [] }, mode: "web" });
  });

  it("örnek listesi iki profili de verir (dosya içerikleri olmadan)", async () => {
    const { api } = setup();
    const list = await api.examples();
    expect(list.map((e) => `${e.profile}/${e.id}`)).toEqual(["legacy/baslangic", "legacy/sekiller", "modern/kup"]);
    expect(list[0]).not.toHaveProperty("files");
  });
});
