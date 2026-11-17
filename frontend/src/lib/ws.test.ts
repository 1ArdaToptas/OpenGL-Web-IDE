import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSocket, wsUrl } from "./ws";

class FakeWS {
  static instances: FakeWS[] = [];
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeWS.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  // test yardımcıları
  open() {
    this.onopen?.();
  }
  emit(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  drop(code: number) {
    this.onclose?.({ code });
  }
}

function make() {
  const onEvent = vi.fn();
  const onStatus = vi.fn();
  const sock = new ProjectSocket({
    url: "ws://127.0.0.1:8765/ws?project=p",
    token: "tok",
    onEvent,
    onStatus,
    WebSocketImpl: FakeWS as unknown as typeof WebSocket,
  });
  sock.connect();
  return { sock, onEvent, onStatus, ws: () => FakeWS.instances.at(-1)! };
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("wsUrl", () => {
  it("aynı origin'den ws URL'si kurar ve proje adını kodlar", () => {
    expect(wsUrl({ protocol: "http:", host: "127.0.0.1:5173" } as Location, "a b")).toBe(
      "ws://127.0.0.1:5173/ws?project=a%20b",
    );
  });
});

describe("ProjectSocket", () => {
  it("açılınca ilk mesaj olarak token ile auth gönderir", () => {
    const { ws } = make();
    ws().open();
    expect(JSON.parse(ws().sent[0])).toEqual({ type: "auth", token: "tok" });
  });

  it("ready gelince connected olur ve olayları iletir", () => {
    const { ws, onEvent, onStatus } = make();
    ws().open();
    ws().emit({ type: "ready", project: "p", activeJob: null });
    ws().emit({ type: "job.output", jobId: "j", stream: "stdout", data: "x" });
    expect(onStatus).toHaveBeenLastCalledWith("connected");
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1][0].type).toBe("job.output");
  });

  it("bozuk JSON'u yok sayar", () => {
    const { ws, onEvent } = make();
    ws().onmessage?.({ data: "{bozuk" });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("beklenmedik kopmada artan gecikmeyle yeniden bağlanır", () => {
    const { ws, onStatus } = make();
    ws().drop(1006);
    expect(onStatus).toHaveBeenLastCalledWith("reconnecting");
    vi.advanceTimersByTime(499);
    expect(FakeWS.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWS.instances).toHaveLength(2);
    ws().drop(1006);
    vi.advanceTimersByTime(999);
    expect(FakeWS.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWS.instances).toHaveLength(3);
  });

  it("başarılı bağlantı gecikmeyi sıfırlar", () => {
    const { ws } = make();
    ws().drop(1006);
    vi.advanceTimersByTime(500);
    ws().open();
    ws().emit({ type: "ready", project: "p", activeJob: null });
    ws().drop(1006);
    vi.advanceTimersByTime(500);
    expect(FakeWS.instances).toHaveLength(3);
  });

  it.each([4400, 4401, 4403, 4404])("%i kapanış kodunda yeniden denemez", (code) => {
    const { ws, onStatus } = make();
    ws().drop(code);
    vi.advanceTimersByTime(10_000);
    expect(FakeWS.instances).toHaveLength(1);
    expect(onStatus).toHaveBeenLastCalledWith("rejected");
  });

  it("send() bağlıyken JSON gönderir, bağlı değilken false döner", () => {
    const { sock, ws } = make();
    expect(sock.send({ type: "stream.offer" })).toBe(false); // henüz ready gelmedi
    ws().open();
    ws().emit({ type: "ready", project: "p", activeJob: null });
    expect(sock.send({ type: "stream.offer", sdp: "x" })).toBe(true);
    expect(JSON.parse(ws().sent.at(-1)!)).toEqual({ type: "stream.offer", sdp: "x" });
  });

  it("close() sonrası yeniden bağlanmaz", () => {
    const { sock, ws, onStatus } = make();
    sock.close();
    expect(ws().closed).toBe(true);
    ws().drop(1000);
    vi.advanceTimersByTime(10_000);
    expect(FakeWS.instances).toHaveLength(1);
    expect(onStatus).toHaveBeenLastCalledWith("closed");
  });
});
