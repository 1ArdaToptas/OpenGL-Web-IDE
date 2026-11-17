import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { type Reveal, EditorPane } from "./features/editor/EditorPane";
import { toMarkers } from "./features/editor/editorLogic";
import { FileTree } from "./features/files/FileTree";
import { Splitter, loadRatio, saveRatio } from "./features/layout/Splitter";
import { ProblemsList } from "./features/problems/ProblemsList";
import { StreamView } from "./features/stream/StreamView";
import { NewProjectDialog } from "./features/projects/NewProjectDialog";
import { type TerminalHandle, TerminalPane } from "./features/terminal/TerminalPane";
import { exitSummary, toTerminalText } from "./features/terminal/terminalText";
import { DownloadStatus, type ProgressStore } from "./features/toolbar/DownloadStatus";
import { Toolbar } from "./features/toolbar/Toolbar";
import { type Api, ApiError, createApi } from "./lib/api";
import type { Diagnostic, ExampleInfo, Health, IdeEvent, Profile, ProjectInfo, StreamEvent } from "./lib/types";
import { ProjectSocket, type SocketStatus, wsUrl } from "./lib/ws";
import { dirtyTabs, ideReducer, initialState, toolbarState } from "./state/ide";
import { Icon } from "./ui/Icon";

type Handlers = { onEvent: (e: IdeEvent) => void; onStatus: (s: SocketStatus) => void };

export interface Deps {
  api: Api;
  createSocket: (project: string, h: Handlers) => { close: () => void; send: (message: object) => boolean };
}

function defaultDeps(token: string): Deps {
  return {
    api: createApi(token),
    createSocket: (project, h) => {
      const s = new ProjectSocket({ url: wsUrl(window.location, project), token, ...h });
      s.connect();
      return s;
    },
  };
}

const CONNECTION_LABEL: Record<SocketStatus, string> = {
  connecting: "Bağlanıyor…",
  connected: "Bağlı",
  reconnecting: "Yeniden bağlanıyor…",
  rejected: "Bağlantı reddedildi",
  closed: "Bağlantı yok",
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function TokenHelp() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div role="alert" className="max-w-lg rounded border border-border bg-surface p-5">
        <h1 className="mb-2 text-[15px] font-semibold">Servise bağlanılamadı</h1>
        <p className="text-fg-muted">
          Bu sayfa, servisi başlattığınız konsolda yazan adresle açılmalıdır:
          <code className="mt-2 block font-mono text-fg">http://127.0.0.1:8765/#token=…</code>
          Sayfayı yenilediyseniz veya servis yeniden başladıysa o adresi tekrar açın.
        </p>
      </div>
    </div>
  );
}

interface AppProps {
  token: string | null;
  deps?: Deps;
  /** "web": kurulumsuz tarayıcı modu (ADR-019) — token gerekmez, program sayfadaki canvas'ta çalışır. */
  mode?: "local" | "web";
  /** Tarayıcı modunda programın canvas'ının yerleştirileceği alan (BrowserIde her çalıştırmada doldurur). */
  canvasHost?: HTMLElement;
  /** Tarayıcı modunda derleyici indirme ilerlemesi (durum çubuğunda gösterilir). */
  downloads?: ProgressStore;
  /** Tarayıcı modunda eksik tarayıcı özellikleri (ör. OffscreenCanvas, JSPI) için uyarı metni. */
  supportNote?: string | null;
}

export function App({ token, deps: injected, mode = "local", canvasHost, downloads, supportNote }: AppProps) {
  const web = mode === "web";
  const deps = useMemo(
    () => (web ? (injected ?? null) : token ? (injected ?? defaultDeps(token)) : null),
    [injected, token, web],
  );
  const mountCanvasHost = useCallback((el: HTMLDivElement | null) => {
    if (el && canvasHost && canvasHost.parentElement !== el) el.appendChild(canvasHost);
  }, [canvasHost]);
  const [state, dispatch] = useReducer(ideReducer, initialState);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [examples, setExamples] = useState<ExampleInfo[]>([]);
  const [config, setConfig] = useState<"Debug" | "Release">("Debug");
  const [error, setError] = useState<string | null>(null);
  const [bottom, setBottom] = useState<"terminal" | "problems" | "video">("terminal");
  const [streamEvent, setStreamEvent] = useState<StreamEvent | null>(null);
  const socket = useRef<{ send: (message: object) => boolean } | null>(null);
  // Her yeni teklifte önceki cevap/hata temizlenir (yeni bağlantı eski cevabı uygulamasın).
  const sendSignal = useCallback((message: object) => {
    setStreamEvent(null);
    return socket.current?.send(message) ?? false;
  }, []);
  const [showNew, setShowNew] = useState(false);
  const [split, setSplit] = useState(loadRatio); // kod alanının yüzdesi (çıktı = 100 - split)
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => saveRatio(split), [split]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // 401: token yanlış ya da servis yeniden başladı (yeni token) — tek çözüm konsoldaki yeni adresi açmak.
  const [unauthorized, setUnauthorized] = useState(false);
  const reportError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) setUnauthorized(true);
    else setError(errorText(e));
  }, []);
  const term = useRef<TerminalHandle>(null);
  const webRef = useRef(web);
  webRef.current = web;
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastDiagnostics = useRef<Diagnostic[]>([]);
  // Çalıştır = kaydet → derle → başarılıysa çalıştır. Derleme bitince (job.exited) çalıştırma tetiklenir.
  const pendingRun = useRef(false);
  const [newFile, setNewFile] = useState<string | null>(null);

  const api = deps?.api;
  const projectName = state.project?.name;
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    if (!api) return;
    api.listProjects().then(setProjects, (e) => reportError(e));
    api.health().then(setHealth, (e) => reportError(e));
    api.examples().then(setExamples, (e) => reportError(e));
  }, [api]);

  const onEvent = useCallback((e: IdeEvent) => {
    dispatch({ type: "event", event: e });
    const t = term.current;
    if (e.type === "job.started") {
      if (e.kind === "build") setBottom("terminal");
      if (e.kind === "run" && webRef.current) setBottom("video"); // tarayıcı modunda çıktı sayfadaki canvas
      lastDiagnostics.current = [];
      t?.write(`\x1b[36m▶ ${e.kind === "build" ? "Derleme başladı" : "Program başlatıldı"}\x1b[0m\r\n`);
    } else if (e.type === "stream.answer" || e.type === "stream.error") {
      setStreamEvent(e);
    } else if (e.type === "job.output") {
      t?.write(toTerminalText(e.data, e.stream));
    } else if (e.type === "build.diagnostics") {
      lastDiagnostics.current = e.items;
    } else if (e.type === "job.exited") {
      const good = e.kind === "build" ? e.ok : e.reason === "exit" && e.code === 0;
      t?.write(`\x1b[${good ? 32 : 31}m■ ${exitSummary(e)}\x1b[0m\r\n`);
      if (e.kind === "build" && !e.ok && lastDiagnostics.current.length > 0) setBottom("problems");
      // Tarayıcı modu: program hatayla bittiyse (ör. shader hatası) görüntü yerine hata mesajını göster.
      if (e.kind === "run" && webRef.current && (e.reason === "error" || (e.reason === "exit" && e.code !== 0))) {
        setBottom("terminal");
      }
      if (e.kind === "build" && pendingRun.current) {
        pendingRun.current = false;
        const project = stateRef.current.project?.name;
        if (e.ok && project) apiRef.current?.run(project, {}).catch(reportError);
      }
    }
  }, [reportError]);

  useEffect(() => {
    if (!deps || !projectName) return;
    const sock = deps.createSocket(projectName, {
      onEvent,
      onStatus: (status) => dispatch({ type: "connection", status }),
    });
    socket.current = sock;
    return () => {
      socket.current = null;
      sock.close();
    };
  }, [deps, projectName, onEvent]);

  const openFile = useCallback(
    async (path: string, project = stateRef.current.project?.name) => {
      if (!api || !project) return;
      if (stateRef.current.tabs.some((t) => t.path === path)) return dispatch({ type: "tabSelected", path });
      try {
        const f = await api.readFile(project, path);
        dispatch({ type: "fileOpened", path, content: f.content });
      } catch (e) {
        reportError(e);
      }
    },
    [api],
  );

  async function selectProject(name: string) {
    if (!api) return;
    const info = projects.find((p) => p.name === name) ?? (await api.listProjects()).find((p) => p.name === name);
    if (!info) return;
    try {
      const tree = await api.tree(name);
      dispatch({ type: "projectOpened", project: info, tree });
      const first = tree.find((t) => t.type === "file" && t.path.startsWith("src/"));
      if (first) await openFile(first.path, name);
    } catch (e) {
      reportError(e);
    }
  }

  async function save(path: string) {
    const tab = stateRef.current.tabs.find((t) => t.path === path);
    if (!api || !projectName || !tab) return;
    await api.writeFile(projectName, path, tab.content);
    dispatch({ type: "fileSaved", path, content: tab.content });
  }

  async function guarded(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      reportError(e);
    }
  }

  const build = () =>
    guarded(async () => {
      for (const tab of dirtyTabs(stateRef.current)) await save(tab.path);
      await api!.build(projectName!, { config });
    });
  const run = () =>
    guarded(async () => {
      for (const tab of dirtyTabs(stateRef.current)) await save(tab.path);
      pendingRun.current = true;
      try {
        await api!.build(projectName!, { config });
      } catch (e) {
        pendingRun.current = false;
        throw e;
      }
    });
  const stop = () => guarded(() => api!.stop(stateRef.current.job!.id));

  async function createProject(name: string, profile: Profile, example?: string) {
    await api!.createProject(name, profile, example);
    setProjects(await api!.listProjects());
    setShowNew(false);
    await selectProject(name);
  }

  async function reloadTree() {
    dispatch({ type: "treeLoaded", tree: await api!.tree(projectName!) });
  }

  const createFile = (path: string) =>
    guarded(async () => {
      if (stateRef.current.tree.some((e) => e.path === path)) throw new Error(`Dosya zaten var: ${path}`);
      await api!.writeFile(projectName!, path, "");
      setNewFile(null);
      await reloadTree();
      await openFile(path);
    });

  const deleteFile = (path: string) => {
    if (!window.confirm(`"${path}" silinsin mi? Bu işlem geri alınamaz.`)) return;
    return guarded(async () => {
      await api!.deleteFile(projectName!, path);
      dispatch({ type: "tabClosed", path });
      await reloadTree();
    });
  };

  const deleteProject = () => {
    if (!window.confirm(`"${projectName}" projesi ve tüm dosyaları kalıcı olarak silinsin mi?`)) return;
    return guarded(async () => {
      await api!.deleteProject(projectName!);
      dispatch({ type: "projectClosed" });
      setProjects(await api!.listProjects());
    });
  };

  function gotoProblem(file: string, line: number, col: number) {
    openFile(file).then(() => setReveal({ path: file, line, col, seq: Date.now() }));
  }

  if (!deps || unauthorized || state.connection === "rejected") return <TokenHelp />;

  const activeTab = state.tabs.find((t) => t.path === state.active) ?? null;
  const dirty = dirtyTabs(state).map((t) => t.path);
  const flags = toolbarState(state);
  const missing = health && !health.toolchain.ok ? health.toolchain.missing : [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Toolbar
        projects={projects}
        current={state.project}
        flags={flags}
        phase={state.phase}
        config={config}
        onSelectProject={selectProject}
        onNewProject={() => setShowNew(true)}
        onDeleteProject={deleteProject}
        onConfig={setConfig}
        onBuild={build}
        onRun={run}
        onStop={stop}
      />

      {web && supportNote && (
        <div role="alert" className="border-b border-border bg-warning/15 px-3 py-1.5 text-warning">
          {supportNote}
        </div>
      )}
      {missing.length > 0 && (
        <div role="alert" className="border-b border-border bg-warning/15 px-3 py-1.5 text-warning">
          Derleme araçları eksik: {missing.join(", ")}. MSYS2 UCRT64 paketlerini kurun (docs/REQUIREMENTS.md TR-01).
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center border-b border-border bg-danger/15 px-3 py-1.5 text-danger">
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Hatayı kapat" onClick={() => setError(null)} className="cursor-pointer p-1">
            <Icon name="close" />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface" aria-label="Dosyalar">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3 text-fg-muted">
            <span className="text-[12px] font-semibold tracking-wide uppercase">Dosyalar</span>
            {state.project && (
              <button
                type="button"
                aria-label="Yeni dosya"
                title="Yeni dosya"
                onClick={() => setNewFile("src/")}
                className="cursor-pointer rounded p-1 hover:bg-surface-2 hover:text-fg"
              >
                <Icon name="plus" />
              </button>
            )}
          </div>
          {newFile !== null && (
            <form
              className="border-b border-border p-2"
              onSubmit={(e) => {
                e.preventDefault();
                createFile(newFile.trim());
              }}
            >
              <input
                autoFocus
                aria-label="Dosya yolu"
                aria-describedby="nf-help"
                value={newFile}
                onChange={(e) => setNewFile(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setNewFile(null)}
                className="h-7 w-full rounded border border-border bg-bg px-2 font-mono text-[12px]"
              />
              <p id="nf-help" className="mt-1 text-[11px] text-fg-muted">
                src/… veya shaders/… · Enter oluşturur, Esc vazgeçer
              </p>
            </form>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            <FileTree
              entries={state.tree}
              active={state.active}
              dirty={dirty}
              onOpen={(p) => openFile(p)}
              onDelete={deleteFile}
            />
          </div>
        </aside>

        <main ref={mainRef} className="flex min-w-0 flex-1 flex-col">
          {/* Kod ve çıktı oranı sürüklenebilir bölücüyle ayarlanır (varsayılan yarı yarıya) */}
          <div className="flex min-h-0 basis-0 flex-col" style={{ flexGrow: split }} data-testid="code-area">
          <div className="flex h-9 shrink-0 overflow-x-auto border-b border-border bg-surface" aria-label="Açık dosyalar">
            {state.tabs.map((t) => {
              const name = t.path.split("/").at(-1);
              const isActive = t.path === state.active;
              return (
                <div
                  key={t.path}
                  className={`flex items-center border-r border-border ${isActive ? "bg-bg text-fg" : "text-fg-muted"}`}
                >
                  <button
                    type="button"
                    title={t.path}
                    onClick={() => dispatch({ type: "tabSelected", path: t.path })}
                    className="h-full cursor-pointer pl-3 pr-1"
                  >
                    {name}
                    {dirty.includes(t.path) && <span className="ml-1 text-warning">●<span className="sr-only">kaydedilmedi</span></span>}
                  </button>
                  <button
                    type="button"
                    aria-label={`Kapat ${name}`}
                    onClick={() => dispatch({ type: "tabClosed", path: t.path })}
                    className="mr-1 cursor-pointer rounded p-1 hover:bg-surface-2"
                  >
                    <Icon name="close" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="min-h-0 flex-1">
            {activeTab ? (
              <EditorPane
                path={activeTab.path}
                value={activeTab.content}
                markers={toMarkers(state.diagnostics, activeTab.path)}
                reveal={reveal}
                onChange={(content) => dispatch({ type: "contentChanged", path: activeTab.path, content })}
                onSave={() => guarded(() => save(activeTab.path))}
              />
            ) : (
              <p className="p-4 text-fg-muted">{state.project ? "Soldan bir dosya açın." : "Bir proje seçin veya yeni proje oluşturun."}</p>
            )}
          </div>
          </div>

          <Splitter
            ratio={split}
            onChange={setSplit}
            getBounds={() => {
              const r = mainRef.current?.getBoundingClientRect();
              return r && { top: r.top, height: r.height };
            }}
          />

          <section
            className="flex min-h-0 basis-0 flex-col"
            style={{ flexGrow: 100 - split }}
            data-testid="output-area"
          >
            <div role="tablist" aria-label="Alt panel" className="flex h-8 shrink-0 gap-1 bg-surface px-2">
              {(
                [
                  ["terminal", "Terminal"],
                  ["problems", `Sorunlar (${state.diagnostics.filter((d) => d.severity !== "note").length})`],
                  ["video", "Görüntü"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={bottom === id}
                  onClick={() => setBottom(id)}
                  className={`cursor-pointer px-2 ${bottom === id ? "border-b-2 border-info text-fg" : "text-fg-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1" hidden={bottom !== "terminal"}>
              <TerminalPane ref={term} />
            </div>
            <div className="min-h-0 flex-1 overflow-auto" hidden={bottom !== "problems"}>
              <ProblemsList items={state.diagnostics} onGoto={gotoProblem} />
            </div>
            {web && (
              // Canvas alanı hep bağlı kalır (gizlenir): çalışan programın canvas'ı sekme değişince kaybolmaz.
              <div
                ref={mountCanvasHost}
                className="flex min-h-0 flex-1 items-center justify-center bg-black p-2"
                hidden={bottom !== "video"}
              />
            )}
            {!web && bottom === "video" && (
              <div className="min-h-0 flex-1">
                {health?.stream && !health.stream.available ? (
                  <p className="p-3 text-warning">{health.stream.reason}</p>
                ) : state.job?.kind === "run" ? (
                  <StreamView key={state.job.id} send={sendSignal} event={streamEvent} />
                ) : (
                  <p className="p-3 text-fg-muted">
                    Program çalışırken görüntüsü burada gösterilir; tıklama ve tuşlar programa iletilir. Çalıştır'a basın.
                  </p>
                )}
              </div>
            )}
          </section>
        </main>
      </div>

      <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-surface px-3 text-[12px] text-fg-muted">
        <span>{state.project ? CONNECTION_LABEL[state.connection] : "Proje seçilmedi"}</span>
        {web && <span className="text-info">Tarayıcı modu — kod bu bilgisayarda, tarayıcıda çalışır</span>}
        {downloads && <DownloadStatus store={downloads} />}
        {health?.toolchain.ok && <span>{health.toolchain.versions.gcc ?? health.toolchain.versions.clang ?? "gcc"}</span>}
        {state.lastExit && <span className="ml-auto">{exitSummary(state.lastExit)}</span>}
      </footer>

      {showNew && <NewProjectDialog examples={examples} onCreate={createProject} onClose={() => setShowNew(false)} />}
    </div>
  );
}
