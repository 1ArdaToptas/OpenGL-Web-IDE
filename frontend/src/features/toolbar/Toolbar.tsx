import type { ProjectInfo } from "../../lib/types";
import type { IdeState } from "../../state/ide";
import { Icon } from "../../ui/Icon";

export interface ToolbarProps {
  projects: ProjectInfo[];
  current: ProjectInfo | null;
  flags: { canBuild: boolean; canRun: boolean; canStop: boolean };
  phase: IdeState["phase"];
  config: "Debug" | "Release";
  onSelectProject: (name: string) => void;
  onNewProject: () => void;
  onDeleteProject?: () => void;
  onConfig: (c: "Debug" | "Release") => void;
  onBuild: () => void;
  onRun: () => void;
  onStop: () => void;
}

const PROFILE_LABEL = { legacy: "Legacy · FreeGLUT", modern: "Modern · GLFW 3.3" } as const;
const PHASE_LABEL = { idle: "Hazır", building: "Derleniyor…", running: "Çalışıyor…" } as const;

const btn =
  "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded px-3 font-medium transition-colors duration-150 " +
  "disabled:cursor-not-allowed disabled:opacity-40";
const select = "h-8 rounded border border-border bg-bg px-2 text-fg hover:border-border-strong";

export function Toolbar(p: ToolbarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-surface px-3">
      <h1 className="hidden font-mono text-[13px] font-semibold tracking-tight whitespace-nowrap xl:block">
        OpenGL Web IDE
      </h1>

      <select
        aria-label="Proje"
        className={`${select} w-40 min-w-0`}
        value={p.current?.name ?? ""}
        onChange={(e) => p.onSelectProject(e.target.value)}
      >
        <option value="" disabled>
          Proje seçin…
        </option>
        {p.projects.map((x) => (
          <option key={x.name} value={x.name}>
            {x.name}
          </option>
        ))}
      </select>
      <button type="button" className={`${btn} bg-surface-2 hover:bg-border`} onClick={p.onNewProject}>
        <Icon name="plus" />
        Yeni proje
      </button>
      {p.current && p.onDeleteProject && (
        <button
          type="button"
          aria-label="Projeyi sil"
          title="Projeyi sil"
          disabled={p.phase !== "idle"}
          onClick={p.onDeleteProject}
          className={`${btn} px-2 text-fg-muted hover:bg-surface-2 hover:text-danger`}
        >
          <Icon name="close" />
        </button>
      )}
      {p.current && (
        <span className="hidden rounded border border-border px-2 py-0.5 text-[12px] whitespace-nowrap text-fg-muted lg:inline">
          {PROFILE_LABEL[p.current.profile]}
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <select
          aria-label="Yapılandırma"
          className={`${select} shrink-0`}
          value={p.config}
          onChange={(e) => p.onConfig(e.target.value as "Debug" | "Release")}
        >
          <option>Debug</option>
          <option>Release</option>
        </select>
        <button type="button" className={`${btn} bg-surface-2 hover:bg-border`} disabled={!p.flags.canBuild} onClick={p.onBuild}>
          <Icon name="build" />
          Derle
        </button>
        <button
          type="button"
          className={`${btn} bg-accent text-on-accent hover:brightness-110`}
          disabled={!p.flags.canRun}
          onClick={p.onRun}
        >
          <Icon name="play" />
          Çalıştır
        </button>
        <button
          type="button"
          className={`${btn} bg-danger text-on-danger hover:brightness-110`}
          disabled={!p.flags.canStop}
          onClick={p.onStop}
        >
          <Icon name="stop" />
          Durdur
        </button>
        <span role="status" className="w-20 text-right whitespace-nowrap text-fg-muted">
          {PHASE_LABEL[p.phase]}
        </span>
      </div>
    </header>
  );
}
