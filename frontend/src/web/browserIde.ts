// Tarayıcı modu (ADR-019): yerel servisin API'si ve olay soketiyle aynı arayüz, ama her şey ziyaretçinin
// tarayıcısında — projeler IndexedDB'de, derleme Worker'daki clang ile, çalıştırma Worker + OffscreenCanvas'ta.
// Arayüz (App) iki modu ayırt etmeden kullanır: aynı job.* olayları yayınlanır.
import { type Api, ApiError } from "../lib/api";
import type { BuildSettings, ExampleInfo, Health, IdeEvent, Profile, ProjectInfo, RunOptions, TreeEntry } from "../lib/types";
import type { SocketStatus } from "../lib/ws";
import type { RunResult } from "../runtime/runner";
import { PathRejected, validateFilePath, validateProjectName } from "./paths";
import type { KeyValueStore } from "./store";

export interface WebExample extends ExampleInfo {
  files: Record<string, string>;
}

interface Compiler {
  compile(files: Record<string, string>, settings: BuildSettings): Promise<{
    ok: boolean;
    wasm?: Uint8Array;
    output: string;
    diagnostics: { file: string; line: number; col: number; severity: "error" | "warning" | "note"; message: string }[];
    durationMs: number;
  }>;
}

interface RunnerOptions {
  canvas: HTMLCanvasElement;
  wasm: Uint8Array;
  profile: Profile;
  files: Record<string, string>;
  env?: Record<string, string>;
  timeoutMs?: number;
  onOutput: (stream: "stdout" | "stderr", text: string) => void;
  onExit: (result: RunResult) => void;
}

interface Options {
  store: KeyValueStore;
  examples: WebExample[];
  compiler: Compiler;
  createRunner: (o: RunnerOptions) => { start(): void; stop(): void };
  /** Her çalıştırma için yeni bir <canvas> (OffscreenCanvas aktarımı tek seferliktir). */
  createCanvas: () => HTMLCanvasElement;
  rendererInfo?: () => string;
}

type Handlers = { onEvent: (e: IdeEvent) => void; onStatus: (s: SocketStatus) => void };

/** Tarayıcı modunda desteklenen profiller: legacy (GLUT taklidi) ve modern (GLFW + GL 3.3 → WebGL2). */
const SUPPORTED: ReadonlySet<Profile> = new Set(["legacy", "modern"]);
const MAX_FILE_BYTES = 1_000_000;

const reject = (status: number, message: string): never => {
  throw new ApiError(status, message);
};

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof PathRejected) reject(400, e.message);
    throw e;
  }
}

export class BrowserIde {
  readonly api: Api;
  private subscribers = new Map<string, Set<Handlers>>();
  private active = new Map<string, { jobId: string; kind: "build" | "run"; stop?: () => void }>();
  private builds = new Map<string, Uint8Array>();

  constructor(private o: Options) {
    this.api = this.createApi();
  }

  createSocket(project: string, h: Handlers) {
    const set = this.subscribers.get(project) ?? new Set();
    set.add(h);
    this.subscribers.set(project, set);
    h.onStatus("connected");
    const job = this.active.get(project);
    h.onEvent({ type: "ready", project, activeJob: job ? { jobId: job.jobId, kind: job.kind } : null });
    return {
      close: () => void set.delete(h),
      send: () => false, // tarayıcı modunda sinyalleşme yok (görüntü zaten bu sayfada)
    };
  }

  /** Süren derleme işinin terminaline bilgi satırı (ör. derleyici indirme ilerlemesi). */
  notify(text: string) {
    for (const [project, job] of this.active) {
      if (job.kind === "build") this.emit(project, { type: "job.output", jobId: job.jobId, stream: "stdout", data: text });
    }
  }

  private emit(project: string, event: IdeEvent) {
    for (const h of this.subscribers.get(project) ?? []) h.onEvent(event);
  }

  private async projects(): Promise<ProjectInfo[]> {
    return (await this.o.store.get<ProjectInfo[]>("projects")) ?? [];
  }

  private async files(name: string): Promise<Record<string, string>> {
    const files = await this.o.store.get<Record<string, string>>(`files:${name}`);
    if (!files) reject(404, `Proje bulunamadı: ${name}`);
    return files!;
  }

  private claim(project: string, kind: "build" | "run") {
    if (this.active.has(project)) reject(409, "Projede çalışan bir iş var");
    const jobId = crypto.randomUUID();
    this.active.set(project, { jobId, kind });
    this.emit(project, { type: "job.started", jobId, kind });
    return jobId;
  }

  private createApi(): Api {
    const ide = this;
    const s = this.o.store;
    return {
      async health(): Promise<Health> {
        return {
          version: "0.1.0",
          toolchain: { ok: true, missing: [], versions: { clang: "clang → WebAssembly (tarayıcıda)", gpu: ide.o.rendererInfo?.() ?? "" } },
          stream: { available: false, reason: null },
          mode: "web",
        };
      },
      async examples(): Promise<ExampleInfo[]> {
        return ide.o.examples
          .filter((e) => SUPPORTED.has(e.profile))
          .map(({ id, profile, title, description, kind }) => ({ id, profile, title, description, kind }));
      },
      listProjects: () => ide.projects(),
      async createProject(name: string, profile: Profile, example?: string) {
        guard(() => validateProjectName(name));
        if (!SUPPORTED.has(profile)) reject(400, "Modern profil (GLFW) tarayıcı modunda henüz desteklenmiyor");
        const list = await ide.projects();
        if (list.some((p) => p.name === name)) reject(409, `Proje zaten var: ${name}`);
        const source = ide.o.examples.find((e) => e.profile === profile && e.id === (example ?? "baslangic"));
        if (!source) reject(400, `Bu profilde böyle bir örnek yok: '${example}'`);
        await s.set(`files:${name}`, { ...source!.files });
        await s.set("projects", [...list, { name, profile }]);
        return { name, profile };
      },
      async deleteProject(name: string) {
        if (ide.active.has(name)) reject(409, "Projede çalışan bir iş var");
        await s.set("projects", (await ide.projects()).filter((p) => p.name !== name));
        await s.delete(`files:${name}`);
        ide.builds.delete(name);
      },
      async tree(name: string): Promise<TreeEntry[]> {
        const files = await ide.files(name);
        const entries = new Map<string, TreeEntry>();
        for (const [path, content] of Object.entries(files)) {
          const parts = path.split("/");
          for (let i = 1; i < parts.length; i++) {
            const dir = parts.slice(0, i).join("/");
            entries.set(dir, { path: dir, type: "dir" });
          }
          entries.set(path, { path, type: "file", size: new TextEncoder().encode(content).length });
        }
        return [...entries.values()].sort((a, b) => a.path.localeCompare(b.path));
      },
      async readFile(name: string, rel: string) {
        const files = await ide.files(name);
        if (!(rel in files)) reject(404, "Dosya bulunamadı");
        return { path: rel, content: files[rel] };
      },
      async writeFile(name: string, rel: string, content: string) {
        guard(() => validateFilePath(rel));
        const size = new TextEncoder().encode(content).length;
        if (size > MAX_FILE_BYTES) reject(413, "Dosya çok büyük");
        const files = await ide.files(name);
        await s.set(`files:${name}`, { ...files, [rel]: content });
        return { path: rel, size };
      },
      async deleteFile(name: string, rel: string) {
        const files = await ide.files(name);
        if (!(rel in files)) reject(404, "Dosya bulunamadı");
        delete files[rel];
        await s.set(`files:${name}`, files);
      },
      async build(name: string, settings: BuildSettings) {
        const files = await ide.files(name);
        const jobId = ide.claim(name, "build");
        (async () => {
          let result: Awaited<ReturnType<Compiler["compile"]>>;
          try {
            result = await ide.o.compiler.compile(files, settings);
          } catch (e) {
            result = { ok: false, output: `Derleyici hatası: ${String(e)}\n`, diagnostics: [], durationMs: 0 };
          }
          if (result.ok && result.wasm) ide.builds.set(name, result.wasm);
          else ide.builds.delete(name);
          ide.emit(name, { type: "job.output", jobId, stream: "stdout", data: `clang → WebAssembly (tarayıcıda, ${result.durationMs} ms)\n${result.output}` });
          ide.emit(name, { type: "build.diagnostics", jobId, items: result.diagnostics });
          ide.active.delete(name);
          ide.emit(name, {
            type: "job.exited", jobId, kind: "build", code: result.ok ? 0 : 1, durationMs: result.durationMs,
            reason: "exit", outputTruncated: false, ok: result.ok,
          });
        })();
        return { jobId };
      },
      async run(name: string, opts: RunOptions) {
        const wasm = ide.builds.get(name);
        if (!wasm) reject(409, "Önce derleyin");
        const files = await ide.files(name);
        const profile = (await ide.projects()).find((p) => p.name === name)?.profile ?? "legacy";
        const jobId = ide.claim(name, "run");
        const runner = ide.o.createRunner({
          canvas: ide.o.createCanvas(),
          wasm: wasm!,
          profile,
          files,
          env: opts.test_frames ? { OGLIDE_TEST_FRAMES: String(opts.test_frames) } : {},
          timeoutMs: opts.timeout_s ? opts.timeout_s * 1000 : undefined,
          onOutput: (stream, data) => ide.emit(name, { type: "job.output", jobId, stream, data }),
          onExit: (r) => {
            ide.active.delete(name);
            ide.emit(name, {
              type: "job.exited", jobId, kind: "run", code: r.code, reason: r.reason, durationMs: r.durationMs,
              outputTruncated: r.outputTruncated, limit: null,
            });
          },
        });
        ide.active.get(name)!.stop = () => runner.stop();
        runner.start();
        return { jobId };
      },
      async stop(jobId: string) {
        for (const job of ide.active.values()) if (job.jobId === jobId) job.stop?.();
      },
    };
  }
}
