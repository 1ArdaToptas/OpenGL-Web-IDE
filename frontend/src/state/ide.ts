import type { Diagnostic, IdeEvent, JobKind, ProjectInfo, TreeEntry } from "../lib/types";
import type { SocketStatus } from "../lib/ws";

export interface Tab {
  path: string;
  content: string;
  saved: string;
}

type Exited = Extract<IdeEvent, { type: "job.exited" }>;

export interface IdeState {
  project: ProjectInfo | null;
  tree: TreeEntry[];
  tabs: Tab[];
  active: string | null;
  job: { id: string; kind: JobKind } | null;
  phase: "idle" | "building" | "running";
  diagnostics: Diagnostic[];
  lastExit: Exited | null;
  connection: SocketStatus;
}

export type Action =
  | { type: "projectOpened"; project: ProjectInfo; tree: TreeEntry[] }
  | { type: "projectClosed" }
  | { type: "treeLoaded"; tree: TreeEntry[] }
  | { type: "fileOpened"; path: string; content: string }
  | { type: "tabSelected"; path: string }
  | { type: "tabClosed"; path: string }
  | { type: "contentChanged"; path: string; content: string }
  | { type: "fileSaved"; path: string; content: string }
  | { type: "connection"; status: SocketStatus }
  | { type: "event"; event: IdeEvent };

export const initialState: IdeState = {
  project: null,
  tree: [],
  tabs: [],
  active: null,
  job: null,
  phase: "idle",
  diagnostics: [],
  lastExit: null,
  connection: "closed",
};

const phaseOf = (kind: JobKind) => (kind === "build" ? "building" : "running");

function onEvent(s: IdeState, e: IdeEvent): IdeState {
  switch (e.type) {
    case "ready":
      return e.activeJob
        ? { ...s, job: { id: e.activeJob.jobId, kind: e.activeJob.kind }, phase: phaseOf(e.activeJob.kind) }
        : { ...s, job: null, phase: "idle" };
    case "job.started":
      return {
        ...s,
        job: { id: e.jobId, kind: e.kind },
        phase: phaseOf(e.kind),
        diagnostics: e.kind === "build" ? [] : s.diagnostics,
      };
    case "build.diagnostics":
      return { ...s, diagnostics: e.items };
    case "job.exited":
      return { ...s, job: null, phase: "idle", lastExit: e };
    case "job.output":
      return s; // terminal doğrudan yazar; durumda tutulmaz
    case "stream.answer":
    case "stream.error":
      return s; // görüntü bileşeni ayrıca işler
  }
}

export function ideReducer(s: IdeState, a: Action): IdeState {
  switch (a.type) {
    case "projectOpened":
      return { ...initialState, connection: s.connection, project: a.project, tree: a.tree };
    case "projectClosed":
      return { ...initialState, connection: s.connection };
    case "treeLoaded":
      return { ...s, tree: a.tree };
    case "fileOpened":
      if (s.tabs.some((t) => t.path === a.path)) return { ...s, active: a.path };
      return { ...s, tabs: [...s.tabs, { path: a.path, content: a.content, saved: a.content }], active: a.path };
    case "tabSelected":
      return { ...s, active: a.path };
    case "tabClosed": {
      const idx = s.tabs.findIndex((t) => t.path === a.path);
      const tabs = s.tabs.filter((t) => t.path !== a.path);
      const active = s.active === a.path ? (tabs[Math.max(0, idx - 1)]?.path ?? null) : s.active;
      return { ...s, tabs, active };
    }
    case "contentChanged":
      return { ...s, tabs: s.tabs.map((t) => (t.path === a.path ? { ...t, content: a.content } : t)) };
    case "fileSaved":
      return { ...s, tabs: s.tabs.map((t) => (t.path === a.path ? { ...t, saved: a.content } : t)) };
    case "connection":
      return { ...s, connection: a.status };
    case "event":
      return onEvent(s, a.event);
  }
}

export const dirtyTabs = (s: IdeState) => s.tabs.filter((t) => t.content !== t.saved);

export function toolbarState(s: IdeState) {
  const ready = s.project !== null && s.connection === "connected" && s.phase === "idle";
  return { canBuild: ready, canRun: ready, canStop: s.job !== null };
}
