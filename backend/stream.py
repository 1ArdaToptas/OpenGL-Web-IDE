"""Tarayıcıda görüntü: çalışan programın penceresi WebRTC ile akıtılır, girdi DataChannel ile döner (ADR-018).

aiortc isteğe bağlıdır (`pip install -e .[stream]`); yoksa özellik devre dışıdır ve neden bildirilir.
Sinyalleşme kimlik doğrulamalı proje WS'si üzerinden yapılır (app.py); burada yeni HTTP ucu yoktur.
"""
import asyncio
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor

from engine.stream.input import apply_input
from engine.stream.window import Frame, WindowCapture, WindowUnavailable

log = logging.getLogger(__name__)

try:
    import av
    from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
    from aiortc.mediastreams import MediaStreamError
    _MISSING = None
except ImportError:  # pragma: no cover - kurulum durumuna bağlı
    _MISSING = "Görüntü aktarımı kurulu değil: scripts\\setup.ps1 ile kurun (aiortc)."
    VideoStreamTrack = object

INPUT_MAX_BYTES = 256
INPUT_MAX_PER_SECOND = 200


class StreamUnavailable(RuntimeError):
    pass


def availability() -> dict:
    return {"available": _MISSING is None, "reason": _MISSING}


class _WindowTrack(VideoStreamTrack):
    """30 fps tempoyla pencereyi yakalar; pencere geçici olarak yakalanamazsa son kare tekrarlanır."""

    def __init__(self, hwnd: int):
        super().__init__()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="capture")
        self.capture = WindowCapture(hwnd)
        self.last: Frame | None = None

    @property
    def size(self) -> tuple[int, int]:
        return (self.last.width, self.last.height) if self.last else (1, 1)

    async def warm_up(self) -> None:
        # İlk PrintWindow ~1 sn sürer (DWM ısınması): akış başlamadan bir kez öde.
        try:
            self.last = await asyncio.get_running_loop().run_in_executor(self.executor, self.capture.grab)
        except WindowUnavailable:
            pass

    async def recv(self):
        if self.readyState != "live":
            raise MediaStreamError  # kapanırken aiortc bir kare daha isteyebilir: izi sonlandır
        pts, time_base = await self.next_timestamp()
        try:
            frame = await asyncio.get_running_loop().run_in_executor(self.executor, self.capture.grab)
            self.last = frame
        except WindowUnavailable:
            frame = self.last or Frame(640, 480, bytes(640 * 480 * 4))
        except RuntimeError as e:  # iş parçacığı havuzu kapatıldı (stop ile yarış)
            raise MediaStreamError from e
        video = av.VideoFrame(frame.width, frame.height, "bgra")
        plane, stride = video.planes[0], frame.width * 4
        if plane.line_size == stride:
            plane.update(frame.data)
        else:
            padded = bytearray(plane.line_size * frame.height)
            for y in range(frame.height):
                padded[y * plane.line_size:y * plane.line_size + stride] = frame.data[y * stride:(y + 1) * stride]
            plane.update(bytes(padded))
        video.pts, video.time_base = pts, time_base
        return video

    def stop(self) -> None:
        # Hem oturum kapanışı hem pc.close() çağırır: yalnızca ilk çağrı kaynakları bırakır.
        already_stopped = self.readyState != "live"
        super().stop()
        if not already_stopped:
            self.executor.submit(self.capture.close)
            self.executor.shutdown(wait=False)


class StreamSession:
    def __init__(self, hwnd: int):
        if _MISSING:
            raise StreamUnavailable(_MISSING)
        self.hwnd = hwnd
        self.track = _WindowTrack(hwnd)
        self.pc = RTCPeerConnection()
        self.pc.addTrack(self.track)
        self._window_start, self._count = time.monotonic(), 0
        self.pc.on("datachannel", self._on_datachannel)

    def _on_datachannel(self, channel) -> None:
        @channel.on("message")
        def on_message(message):
            if not isinstance(message, str) or len(message) > INPUT_MAX_BYTES or not self._allow():
                return
            try:
                apply_input(self.hwnd, json.loads(message), self.track.size)
            except (ValueError, TypeError):
                pass  # geçersiz girdi sessizce yok sayılır

    def _allow(self) -> bool:
        now = time.monotonic()
        if now - self._window_start >= 1.0:
            self._window_start, self._count = now, 0
        self._count += 1
        return self._count <= INPUT_MAX_PER_SECOND

    async def answer(self, sdp: str, sdp_type: str) -> dict:
        await self.track.warm_up()
        await self.pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type=sdp_type))
        await self.pc.setLocalDescription(await self.pc.createAnswer())
        return {"sdp": self.pc.localDescription.sdp, "sdp_type": self.pc.localDescription.type}

    async def close(self) -> None:
        self.track.stop()
        await self.pc.close()
