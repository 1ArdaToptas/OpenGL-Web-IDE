import type { BuildSettings, ExampleInfo, Health, ProjectInfo, Profile, RunOptions, TreeEntry } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

function messageOf(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => `${(d.loc ?? []).filter((l: unknown) => l !== "body").join(".")}: ${d.msg}`).join("; ");
  }
  if (detail && typeof detail === "object" && "message" in detail) return String(detail.message);
  return `HTTP ${status}`;
}

export const OFFLINE_MESSAGE =
  "Servise ulaşılamıyor. Servis kapalı olabilir: start.cmd ile başlatıp konsolda yazan yeni adresi açın.";

const enc = encodeURIComponent;
const encPath = (rel: string) => rel.split("/").map(enc).join("/");

export function createApi(token: string, fetchImpl: typeof fetch = fetch.bind(globalThis)) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res: Response;
    try {
      res = await fetchImpl(`/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // fetch yalnızca ağ düzeyinde hata fırlatır: servis kapalı ya da yeniden başlatılmış.
      throw new ApiError(0, OFFLINE_MESSAGE);
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => undefined);
    if (!res.ok) throw new ApiError(res.status, messageOf(data?.detail, res.status), data?.detail);
    return data as T;
  }

  return {
    health: () => call<Health>("GET", "/health"),
    listProjects: () => call<ProjectInfo[]>("GET", "/projects"),
    examples: () => call<ExampleInfo[]>("GET", "/examples"),
    createProject: (name: string, profile: Profile, example?: string) =>
      call<ProjectInfo>("POST", "/projects", example ? { name, profile, example } : { name, profile }),
    deleteProject: (name: string) => call<void>("DELETE", `/projects/${enc(name)}`),
    tree: (name: string) => call<TreeEntry[]>("GET", `/projects/${enc(name)}/tree`),
    readFile: (name: string, rel: string) =>
      call<{ path: string; content: string }>("GET", `/projects/${enc(name)}/files/${encPath(rel)}`),
    writeFile: (name: string, rel: string, content: string) =>
      call<{ path: string; size: number }>("PUT", `/projects/${enc(name)}/files/${encPath(rel)}`, { content }),
    deleteFile: (name: string, rel: string) => call<void>("DELETE", `/projects/${enc(name)}/files/${encPath(rel)}`),
    build: (name: string, settings: BuildSettings) =>
      call<{ jobId: string }>("POST", `/projects/${enc(name)}/build`, settings),
    run: (name: string, opts: RunOptions) => call<{ jobId: string }>("POST", `/projects/${enc(name)}/run`, opts),
    stop: (jobId: string) => call<void>("POST", `/jobs/${enc(jobId)}/stop`),
  };
}

export type Api = ReturnType<typeof createApi>;
