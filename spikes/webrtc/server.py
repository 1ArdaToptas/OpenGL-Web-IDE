"""Faz 7 spike: OpenGL penceresini WebRTC ile tarayıcıya akıtır; DataChannel ile girdiyi geri gönderir.

Kullanım (spike venv'i): .venv-spike/Scripts/python -m spikes.webrtc.server <proje_dizini> <pencere_başlığı>
Yalnızca 127.0.0.1; token YOK — üretim kodu değildir, kısa süreli ölçüm içindir.
"""
import argparse
import asyncio
import ctypes
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
from pathlib import Path

import av
import uvicorn
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse

from engine.project import load_project
from engine.run import RunJob
from engine.sandbox import Limits
from engine.toolchain import detect

from .capture import WindowCapture, find_window

STAMP_BITS, STAMP_BLOCK = 48, 8  # sol üstte 48 adet 8x8 blok: yakalama anı (epoch ms)
user32 = ctypes.windll.user32
WM_CHAR, WM_LBUTTONDOWN, WM_LBUTTONUP, MK_LBUTTON = 0x0102, 0x0201, 0x0202, 0x0001


def stamp_frame(data: bytearray, width: int, ms: int) -> None:
    """Zaman damgasını BGRA karenin ilk 8 satırına siyah/beyaz bloklar olarak yazar (kodlama kaybına dayanıklı)."""
    row = bytearray()
    for bit in range(STAMP_BITS):
        value = 255 if (ms >> (STAMP_BITS - 1 - bit)) & 1 else 0
        row += bytes((value, value, value, 255)) * STAMP_BLOCK
    for y in range(STAMP_BLOCK):
        start = y * width * 4
        data[start:start + len(row)] = row


class WindowTrack(VideoStreamTrack):
    def __init__(self, cap: WindowCapture, stats: dict):
        super().__init__()
        self.cap, self.stats = cap, stats
        self.executor = ThreadPoolExecutor(max_workers=1)  # DPI bağlamı iş parçacığına göre ayarlanır

    async def recv(self) -> av.VideoFrame:
        pts, time_base = await self.next_timestamp()  # 30 fps tempo
        loop = asyncio.get_running_loop()
        t0 = time.perf_counter()
        raw = bytearray(await loop.run_in_executor(self.executor, self.cap.grab))
        stamp_frame(raw, self.cap.width, int(time.time() * 1000))
        frame = av.VideoFrame(self.cap.width, self.cap.height, "bgra")
        plane = frame.planes[0]
        stride = self.cap.width * 4
        if plane.line_size == stride:
            plane.update(bytes(raw))
        else:  # hizalama dolgusu varsa satır satır kopyala
            buf = bytearray(plane.line_size * self.cap.height)
            for y in range(self.cap.height):
                buf[y * plane.line_size:y * plane.line_size + stride] = raw[y * stride:(y + 1) * stride]
            plane.update(bytes(buf))
        frame.pts, frame.time_base = pts, time_base
        self.stats["frames"] += 1
        self.stats["grab_ms"].append((time.perf_counter() - t0) * 1000)
        return frame


def handle_input(hwnd: int, msg: dict, size: tuple[int, int]) -> None:
    if msg.get("type") == "key" and isinstance(msg.get("key"), str) and len(msg["key"]) == 1:
        user32.PostMessageW(hwnd, WM_CHAR, ord(msg["key"]), 0)
    elif msg.get("type") == "click":
        x = max(0, min(size[0] - 1, int(msg["x"])))
        y = max(0, min(size[1] - 1, int(msg["y"])))
        lparam = (y << 16) | x
        user32.PostMessageW(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lparam)
        user32.PostMessageW(hwnd, WM_LBUTTONUP, 0, lparam)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("project", type=Path)
    ap.add_argument("title")
    ap.add_argument("--port", type=int, default=8790)
    args = ap.parse_args()

    program_output: list[str] = []
    job = RunJob(load_project(args.project), detect(Path(r"C:\msys64"), check_versions=False),
                 on_output=lambda s, t: program_output.append(t), limits=Limits(timeout_s=600))
    threading.Thread(target=job.run, daemon=True).start()
    deadline = time.monotonic() + 10
    while not (hwnd := find_window(args.title)) and time.monotonic() < deadline:
        time.sleep(0.05)
    cap = WindowCapture(hwnd)
    cap.grab()  # ilk yakalama ~1 sn (DWM ısınması) — akış başlamadan öde
    stats = {"frames": 0, "grab_ms": []}
    peers: set[RTCPeerConnection] = set()

    app = FastAPI()

    @app.get("/")
    def page():
        return FileResponse(Path(__file__).with_name("page.html"))

    @app.get("/stats")
    def server_stats():
        g = sorted(stats["grab_ms"][-300:]) or [0]
        return {"frames": stats["frames"], "grab_ms_median": g[len(g) // 2], "size": [cap.width, cap.height],
                "program_output": "".join(program_output)[-2000:]}

    @app.post("/offer")
    async def offer(request: Request):
        body = await request.json()
        pc = RTCPeerConnection()
        peers.add(pc)
        pc.addTrack(WindowTrack(cap, stats))

        @pc.on("datachannel")
        def on_dc(channel):
            @channel.on("message")
            def on_message(message):
                handle_input(hwnd, json.loads(message), (cap.width, cap.height))

        await pc.setRemoteDescription(RTCSessionDescription(sdp=body["sdp"], type=body["type"]))
        await pc.setLocalDescription(await pc.createAnswer())
        return JSONResponse({"sdp": pc.localDescription.sdp, "type": pc.localDescription.type})

    print(f"Spike: http://127.0.0.1:{args.port}/ ({cap.width}x{cap.height})", flush=True)
    try:
        uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
    finally:
        job.stop()


if __name__ == "__main__":
    main()
