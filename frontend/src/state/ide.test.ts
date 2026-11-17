import { describe, expect, it } from "vitest";
import type { IdeEvent } from "../lib/types";
import { type IdeState, dirtyTabs, ideReducer, initialState, toolbarState } from "./ide";

const opened: IdeState = ideReducer(
  { ...initialState, connection: "connected" },
  { type: "projectOpened", project: { name: "p", profile: "legacy" }, tree: [{ path: "src/main.c", type: "file" }] },
);
const ev = (s: IdeState, event: IdeEvent) => ideReducer(s, { type: "event", event });

describe("dosya sekmeleri", () => {
  it("dosya açınca sekme ekler ve aktif yapar, tekrar açınca çoğaltmaz", () => {
    let s = ideReducer(opened, { type: "fileOpened", path: "src/main.c", content: "int x;" });
    s = ideReducer(s, { type: "fileOpened", path: "src/main.c", content: "int x;" });
    expect(s.tabs).toHaveLength(1);
    expect(s.active).toBe("src/main.c");
  });

  it("düzenleme sekmeyi kirli yapar, kaydetme temizler", () => {
    let s = ideReducer(opened, { type: "fileOpened", path: "src/main.c", content: "a" });
    s = ideReducer(s, { type: "contentChanged", path: "src/main.c", content: "ab" });
    expect(dirtyTabs(s).map((t) => t.path)).toEqual(["src/main.c"]);
    s = ideReducer(s, { type: "fileSaved", path: "src/main.c", content: "ab" });
    expect(dirtyTabs(s)).toEqual([]);
  });

  it("aktif sekme kapanınca komşu sekme aktif olur", () => {
    let s = ideReducer(opened, { type: "fileOpened", path: "src/a.c", content: "" });
    s = ideReducer(s, { type: "fileOpened", path: "src/b.c", content: "" });
    s = ideReducer(s, { type: "tabClosed", path: "src/b.c" });
    expect(s.active).toBe("src/a.c");
    s = ideReducer(s, { type: "tabClosed", path: "src/a.c" });
    expect(s.active).toBeNull();
  });

  it("proje kapatılınca her şey sıfırlanır ama bağlantı durumu korunur", () => {
    let s = ideReducer(opened, { type: "fileOpened", path: "src/a.c", content: "" });
    s = ideReducer(s, { type: "projectClosed" });
    expect(s.project).toBeNull();
    expect(s.tabs).toEqual([]);
    expect(s.tree).toEqual([]);
    expect(s.connection).toBe("connected");
  });

  it("başka proje açılınca sekmeler ve teşhisler sıfırlanır", () => {
    let s = ideReducer(opened, { type: "fileOpened", path: "src/a.c", content: "" });
    s = ev(s, { type: "build.diagnostics", jobId: "j", items: [{ file: "src/a.c", line: 1, col: 1, severity: "error", message: "x" }] });
    s = ideReducer(s, { type: "projectOpened", project: { name: "q", profile: "modern" }, tree: [] });
    expect(s.tabs).toEqual([]);
    expect(s.diagnostics).toEqual([]);
  });
});

describe("iş olayları", () => {
  it("build başlayınca eski teşhisleri temizler ve building olur", () => {
    let s = ev(opened, { type: "build.diagnostics", jobId: "j0", items: [{ file: "src/main.c", line: 1, col: 1, severity: "error", message: "x" }] });
    s = ev(s, { type: "job.started", jobId: "j1", kind: "build" });
    expect(s.phase).toBe("building");
    expect(s.diagnostics).toEqual([]);
    expect(s.job).toEqual({ id: "j1", kind: "build" });
  });

  it("run bitince idle olur ve son çıkışı saklar", () => {
    let s = ev(opened, { type: "job.started", jobId: "r", kind: "run" });
    expect(s.phase).toBe("running");
    s = ev(s, { type: "job.exited", jobId: "r", kind: "run", code: 0, durationMs: 10, reason: "killed", outputTruncated: false });
    expect(s.phase).toBe("idle");
    expect(s.job).toBeNull();
    expect(s.lastExit?.reason).toBe("killed");
  });

  it("yeniden bağlanınca süren iş ready'den geri yüklenir", () => {
    const s = ev(opened, { type: "ready", project: "p", activeJob: { jobId: "j9", kind: "run" } });
    expect(s.phase).toBe("running");
    expect(s.job).toEqual({ id: "j9", kind: "run" });
  });

  it("ready iş yoksa önceki iş durumunu temizler", () => {
    let s = ev(opened, { type: "job.started", jobId: "j", kind: "build" });
    s = ev(s, { type: "ready", project: "p", activeJob: null });
    expect(s.phase).toBe("idle");
  });
});

describe("toolbarState", () => {
  it("boşta ve bağlıyken derle/çalıştır açık, durdur kapalı", () => {
    expect(toolbarState(opened)).toMatchObject({ canBuild: true, canRun: true, canStop: false });
  });

  it("iş sürerken yalnızca durdur açık", () => {
    const s = ev(opened, { type: "job.started", jobId: "j", kind: "build" });
    expect(toolbarState(s)).toMatchObject({ canBuild: false, canRun: false, canStop: true });
  });

  it("bağlantı yokken hiçbir iş başlatılamaz", () => {
    const s = ideReducer(opened, { type: "connection", status: "reconnecting" });
    expect(toolbarState(s)).toMatchObject({ canBuild: false, canRun: false });
  });

  it("proje yokken her şey kapalı", () => {
    expect(toolbarState({ ...initialState, connection: "connected" })).toMatchObject({ canBuild: false, canRun: false, canStop: false });
  });
});
