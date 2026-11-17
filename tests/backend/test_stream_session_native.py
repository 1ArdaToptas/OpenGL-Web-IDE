"""Gerçek aiortc oturumu: çalışan programın karesi WebRTC ile alınır, girdi DataChannel ile gider."""
import asyncio
import json
import time

import pytest

aiortc = pytest.importorskip("aiortc")

from backend.stream import StreamSession  # noqa: E402
from engine.project import Profile, create_project  # noqa: E402
from engine.run import RunJob  # noqa: E402
from engine.sandbox import Limits  # noqa: E402
from engine.toolchain import detect  # noqa: E402

from ..conftest import MSYS2_ROOT  # noqa: E402
from ..engine.test_native_build_run import Output, _build  # noqa: E402

pytestmark = pytest.mark.native


async def _receive_and_type(hwnd, out):
    from aiortc import RTCPeerConnection, RTCSessionDescription

    session = StreamSession(hwnd)
    client = RTCPeerConnection()
    client.addTransceiver("video", direction="recvonly")
    channel = client.createDataChannel("input")
    track_ready = asyncio.get_running_loop().create_future()
    client.on("track", lambda t: track_ready.done() or track_ready.set_result(t))
    await client.setLocalDescription(await client.createOffer())
    answer = await session.answer(client.localDescription.sdp, client.localDescription.type)
    await client.setRemoteDescription(RTCSessionDescription(sdp=answer["sdp"], type=answer["sdp_type"]))

    track = await asyncio.wait_for(track_ready, 15)
    frames = [await asyncio.wait_for(track.recv(), 15) for _ in range(15)]
    for _ in range(50):
        if channel.readyState == "open":
            break
        await asyncio.sleep(0.1)
    channel.send(json.dumps({"type": "key", "key": "q"}))
    channel.send(json.dumps({"type": "key", "key": "çok uzun"}))  # geçersiz: yok sayılmalı
    deadline = time.monotonic() + 5
    while "KEY q" not in out.text and time.monotonic() < deadline:
        await asyncio.sleep(0.1)
    await client.close()
    await session.close()
    return frames


def test_stream_delivers_frames_and_input(tmp_path, templates_dir):
    tc = detect(MSYS2_ROOT)
    proj = create_project(tmp_path, "akis", Profile.LEGACY, templates_dir, example="etkilesim")
    assert _build(proj, tc, templates_dir)[0].ok
    out = Output()
    job = RunJob(proj, tc, on_output=out, limits=Limits(timeout_s=60))
    job.start()
    try:
        deadline = time.monotonic() + 15
        while not (hwnd := job.find_window()) and time.monotonic() < deadline:
            time.sleep(0.1)
        assert hwnd
        frames = asyncio.run(_receive_and_type(hwnd, out))
        assert {(f.width, f.height) for f in frames} == {(800, 600)}
        rgb = frames[-1].reformat(format="rgb24")
        plane = rgb.planes[0]
        offset = 300 * plane.line_size + 400 * 3
        center = tuple(bytes(plane)[offset:offset + 3])
        # VP8 kayıplı: arka plandan (26,26,31) belirgin biçimde farklı olmalı (merkezde turuncu üçgen)
        assert sum(abs(a - b) for a, b in zip(center, (26, 26, 31))) > 60, center
        assert "KEY q" in out.text
        assert "KEY ç" not in out.text
    finally:
        job.stop()
        job.wait()
