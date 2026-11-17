// Backend sözleşmesi: docs/ARCHITECTURE.md §3
export type Profile = "legacy" | "modern";
export type JobKind = "build" | "run";

export interface ProjectInfo {
  name: string;
  profile: Profile;
}

export interface ExampleInfo {
  id: string;
  profile: Profile;
  title: string;
  description: string;
  kind: "statik" | "animasyon";
}

export interface TreeEntry {
  path: string;
  type: "file" | "dir";
  size?: number;
}

export interface Diagnostic {
  file: string;
  line: number;
  col: number;
  severity: "error" | "warning" | "note";
  message: string;
}

export interface BuildSettings {
  config?: "Debug" | "Release";
  c_std?: "11" | "17";
  cxx_std?: "17" | "20";
  warnings?: "default" | "all" | "extra";
}

export interface RunOptions {
  timeout_s?: number;
  test_frames?: number;
}

export interface Health {
  version: string;
  toolchain: { ok: boolean; missing: string[]; versions: Record<string, string> };
  stream?: { available: boolean; reason: string | null };
  /** "web": derleme ve çalıştırma ziyaretçinin tarayıcısında (ADR-019); yoksa yerel servis. */
  mode?: "web" | "local";
}

export type StreamEvent =
  | { type: "stream.answer"; sdp: string; sdp_type: RTCSdpType }
  | { type: "stream.error"; message: string };

export type IdeEvent =
  | StreamEvent
  | { type: "ready"; project?: string; activeJob?: { jobId: string; kind: JobKind } | null }
  | { type: "job.started"; jobId: string; kind: JobKind }
  | { type: "job.output"; jobId: string; stream: "stdout" | "stderr"; data: string }
  | { type: "build.diagnostics"; jobId: string; items: Diagnostic[] }
  | {
      type: "job.exited";
      jobId: string;
      kind: JobKind;
      code: number;
      durationMs: number;
      reason: "exit" | "timeout" | "killed" | "error" | "limit";
      outputTruncated: boolean;
      limit?: "memory" | "processes" | null;
      ok?: boolean;
    };
