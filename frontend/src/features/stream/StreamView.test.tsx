import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StreamView } from "./StreamView";

class FakeChannel {
  readyState = "open";
  sent: string[] = [];
  send(d: string) {
    this.sent.push(d);
  }
}

class FakePC {
  static last: FakePC;
  iceGatheringState = "complete";
  localDescription: { sdp: string; type: string } | null = null;
  remote: unknown = null;
  closed = false;
  channel = new FakeChannel();
  ontrack: ((e: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null = null;
  constructor() {
    FakePC.last = this;
  }
  addTransceiver() {}
  createDataChannel() {
    return this.channel;
  }
  async createOffer() {
    return { sdp: "teklif", type: "offer" };
  }
  async setLocalDescription(d: { sdp: string; type: string }) {
    this.localDescription = d;
  }
  async setRemoteDescription(d: unknown) {
    this.remote = d;
  }
  addEventListener() {}
  close() {
    this.closed = true;
  }
}

const PC = FakePC as unknown as typeof RTCPeerConnection;

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

async function setup(event: Parameters<typeof StreamView>[0]["event"] = null) {
  const send = vi.fn().mockReturnValue(true);
  const utils = render(<StreamView send={send} event={event} PeerConnection={PC} />);
  await act(async () => {});
  return { send, ...utils };
}

describe("StreamView", () => {
  it("açılınca WS üzerinden teklif gönderir", async () => {
    const { send } = await setup();
    expect(send).toHaveBeenCalledWith({ type: "stream.offer", sdp: "teklif", sdp_type: "offer" });
  });

  it("gelen cevabı uzak tanım olarak uygular", async () => {
    const { send, rerender } = await setup();
    rerender(
      <StreamView send={send} event={{ type: "stream.answer", sdp: "cevap", sdp_type: "answer" }} PeerConnection={PC} />,
    );
    await act(async () => {});
    expect(FakePC.last.remote).toEqual({ sdp: "cevap", type: "answer" });
  });

  it("hata olayını kullanıcıya gösterir", async () => {
    await setup({ type: "stream.error", message: "Çalışan program yok" });
    expect(screen.getByRole("alert")).toHaveTextContent("Çalışan program yok");
  });

  it("tuşları ve videodaki tıklamaları kanal üzerinden gönderir", async () => {
    await setup();
    const video = screen.getByLabelText(/Program görüntüsü/);
    Object.defineProperty(video, "videoWidth", { value: 800 });
    Object.defineProperty(video, "videoHeight", { value: 600 });
    video.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
    await act(async () => {
      video.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
      video.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
      video.dispatchEvent(new MouseEvent("click", { clientX: 200, clientY: 150, bubbles: true }));
    });
    expect(FakePC.last.channel.sent.map((s) => JSON.parse(s))).toEqual([
      { type: "key", key: "r" },
      { type: "click", x: 200, y: 150 },
    ]);
  });

  it("kapanınca bağlantıyı kapatır", async () => {
    const { unmount } = await setup();
    unmount();
    expect(FakePC.last.closed).toBe(true);
  });
});
