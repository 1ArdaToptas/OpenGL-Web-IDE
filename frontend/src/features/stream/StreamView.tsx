import { useEffect, useRef, useState } from "react";
import type { StreamEvent } from "../../lib/types";
import { toVideoCoords } from "./streamLogic";

interface Props {
  /** Proje WS'si üzerinden sinyalleşme mesajı gönderir. */
  send: (message: object) => boolean;
  /** Sunucudan gelen son stream.answer / stream.error. */
  event: StreamEvent | null;
  PeerConnection?: typeof RTCPeerConnection;
}

/** Çalışan programın penceresini WebRTC ile gösterir; tuş ve tıklamaları programa iletir (ADR-018). */
export function StreamView({ send, event, PeerConnection = RTCPeerConnection }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const [status, setStatus] = useState("Bağlanıyor…");

  useEffect(() => {
    let cancelled = false;
    const peer = new PeerConnection(); // ICE sunucusu yok: yalnızca bu makine
    pc.current = peer;
    peer.addTransceiver("video", { direction: "recvonly" });
    channel.current = peer.createDataChannel("input");
    peer.ontrack = (e) => {
      if (video.current) {
        video.current.srcObject = e.streams[0] ?? new MediaStream([e.track]);
        video.current.play().catch(() => {});
      }
      setStatus("");
    };
    (async () => {
      await peer.setLocalDescription(await peer.createOffer());
      if (peer.iceGatheringState !== "complete") {
        await new Promise<void>((resolve) =>
          peer.addEventListener("icegatheringstatechange", () => {
            if (peer.iceGatheringState === "complete") resolve();
          }),
        );
      }
      const local = peer.localDescription!;
      if (!cancelled && !send({ type: "stream.offer", sdp: local.sdp, sdp_type: local.type })) {
        setStatus("Sunucu bağlantısı yok");
      }
    })();
    return () => {
      cancelled = true;
      peer.close();
    };
  }, [send, PeerConnection]);

  useEffect(() => {
    if (event?.type === "stream.answer") {
      pc.current?.setRemoteDescription({ sdp: event.sdp, type: event.sdp_type }).catch(() => {});
    }
  }, [event]);

  const sendInput = (message: object) => {
    if (channel.current?.readyState === "open") channel.current.send(JSON.stringify(message));
  };

  if (event?.type === "stream.error") {
    return (
      <p role="alert" className="p-3 text-warning">
        {event.message}
      </p>
    );
  }

  return (
    <div className="relative flex h-full items-center justify-center bg-black">
      <video
        ref={video}
        muted
        playsInline
        tabIndex={0}
        aria-label="Program görüntüsü (tıklayın veya odaklayıp tuşa basın)"
        className="h-full w-full cursor-crosshair object-contain"
        onKeyDown={(e) => {
          if (e.key.length === 1) {
            e.preventDefault();
            sendInput({ type: "key", key: e.key });
          }
        }}
        onClick={(e) => {
          const v = e.currentTarget;
          v.focus();
          const p = toVideoCoords(e.clientX, e.clientY, v.getBoundingClientRect(), v.videoWidth, v.videoHeight);
          if (p) sendInput({ type: "click", ...p });
        }}
      />
      {status && <span className="absolute text-fg-muted">{status}</span>}
    </div>
  );
}
