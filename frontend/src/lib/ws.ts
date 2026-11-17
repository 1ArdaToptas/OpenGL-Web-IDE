import type { IdeEvent } from "./types";

export type SocketStatus = "connecting" | "connected" | "reconnecting" | "rejected" | "closed";

// Sunucunun bilerek reddettiği durumlar (ARCHITECTURE §3): tekrar denemek anlamsız.
const FATAL_CODES = new Set([4400, 4401, 4403, 4404]);
const BACKOFF_MS = [500, 1000, 2000, 5000];

export function wsUrl(location: Location, project: string): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/ws?project=${encodeURIComponent(project)}`;
}

interface Options {
  url: string;
  token: string;
  onEvent: (e: IdeEvent) => void;
  onStatus: (s: SocketStatus) => void;
  WebSocketImpl?: typeof WebSocket;
}

export class ProjectSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private ready = false;

  constructor(private opts: Options) {}

  /** Kimlik doğrulaması tamamlanmış bağlantıya mesaj gönderir; bağlı değilse false. */
  send(message: object): boolean {
    if (!this.ready || !this.ws) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  connect(): void {
    const Impl = this.opts.WebSocketImpl ?? WebSocket;
    const ws = new Impl(this.opts.url);
    this.ws = ws;
    this.opts.onStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: this.opts.token }));
    ws.onmessage = (msg) => {
      let event: IdeEvent;
      try {
        event = JSON.parse(String(msg.data));
      } catch {
        return;
      }
      if (event.type === "ready") {
        this.attempt = 0;
        this.ready = true;
        this.opts.onStatus("connected");
      }
      this.opts.onEvent(event);
    };
    ws.onclose = (e) => {
      this.ready = false;
      if (this.closedByUser) return this.opts.onStatus("closed");
      if (FATAL_CODES.has(e.code)) return this.opts.onStatus("rejected");
      this.opts.onStatus("reconnecting");
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
      this.attempt += 1;
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }

  close(): void {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }
}
