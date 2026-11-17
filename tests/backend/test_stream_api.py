"""WS üzerinden görüntü akışı sinyalleşmesi (sahte oturum ile)."""
import pytest

from backend.stream import StreamUnavailable

from .conftest import AUTH, ORIGIN, TOKEN, WS_URL
from .test_jobs import FakeJob, FakeToolchain, _events_until_exit, _fake_exe

OFFER = {"type": "stream.offer", "sdp": "v=0 sahte", "sdp_type": "offer"}


class FakeSession:
    instances = []

    def __init__(self, hwnd):
        self.hwnd, self.closed = hwnd, False
        FakeSession.instances.append(self)

    async def answer(self, sdp, sdp_type):
        return {"sdp": f"cevap:{sdp}", "sdp_type": "answer"}

    async def close(self):
        self.closed = True


@pytest.fixture
def stream_client(make_client):
    FakeJob.instances.clear()
    FakeSession.instances.clear()
    state = {"window": 4242, "unavailable": None}

    class WindowJob(FakeJob):
        def find_window(self):
            return state["window"]

    def run_factory(project, tc, on_output, limits, test_frames):
        return WindowJob("run", on_output, block=True)

    def stream_factory(hwnd):
        if state["unavailable"]:
            raise StreamUnavailable(state["unavailable"])
        return FakeSession(hwnd)

    c = make_client(toolchain=FakeToolchain(), run_factory=run_factory, stream_factory=stream_factory,
                    window_wait_s=0.3)
    c.post("/api/projects", json={"name": "p", "profile": "legacy"}, headers=AUTH)
    return c, state


def _ws(client):
    ws = client.websocket_connect(f"{WS_URL}?project=p", headers={"Origin": ORIGIN}).__enter__()
    ws.send_json({"type": "auth", "token": TOKEN})
    assert ws.receive_json()["type"] == "ready"
    return ws


def _next(ws, kind):
    while (e := ws.receive_json())["type"] != kind:
        if e["type"] == "stream.error" and kind != "stream.error":
            raise AssertionError(e)
    return e


def test_offer_without_running_program_is_error(stream_client):
    client, _ = stream_client
    ws = _ws(client)
    ws.send_json(OFFER)
    assert "Çalışan program yok" in _next(ws, "stream.error")["message"]
    ws.close()


def test_offer_for_running_program_returns_answer(stream_client, settings):
    client, _ = stream_client
    _fake_exe(settings)
    ws = _ws(client)
    client.post("/api/projects/p/run", json={}, headers=AUTH)
    ws.send_json(OFFER)
    answer = _next(ws, "stream.answer")
    assert answer == {"type": "stream.answer", "sdp": "cevap:v=0 sahte", "sdp_type": "answer"}
    assert FakeSession.instances[0].hwnd == 4242
    FakeJob.instances[0].stop()
    _next(ws, "job.exited")
    ws.close()


def test_session_closed_when_program_exits(stream_client, settings):
    client, _ = stream_client
    _fake_exe(settings)
    ws = _ws(client)
    client.post("/api/projects/p/run", json={}, headers=AUTH)
    ws.send_json(OFFER)
    _next(ws, "stream.answer")
    FakeJob.instances[0].stop()
    _next(ws, "job.exited")
    ws.send_json({"type": "ping"})  # sunucu döngüsünün exited'i işlemesine fırsat ver
    ws.close()
    assert FakeSession.instances[0].closed


def test_session_closed_when_socket_closes(stream_client, settings):
    client, _ = stream_client
    _fake_exe(settings)
    ws = _ws(client)
    client.post("/api/projects/p/run", json={}, headers=AUTH)
    ws.send_json(OFFER)
    _next(ws, "stream.answer")
    ws.close()
    FakeJob.instances[0].stop()
    import time
    deadline = time.monotonic() + 3
    while not FakeSession.instances[0].closed and time.monotonic() < deadline:
        time.sleep(0.05)
    assert FakeSession.instances[0].closed


def test_new_offer_replaces_previous_session(stream_client, settings):
    client, _ = stream_client
    _fake_exe(settings)
    ws = _ws(client)
    client.post("/api/projects/p/run", json={}, headers=AUTH)
    ws.send_json(OFFER)
    _next(ws, "stream.answer")
    ws.send_json(OFFER)
    _next(ws, "stream.answer")
    assert [s.closed for s in FakeSession.instances] == [True, False]
    FakeJob.instances[0].stop()
    ws.close()


def test_window_not_found_is_error(stream_client, settings):
    client, state = stream_client
    state["window"] = None
    _fake_exe(settings)
    ws = _ws(client)
    client.post("/api/projects/p/run", json={}, headers=AUTH)
    ws.send_json(OFFER)
    assert "pencere" in _next(ws, "stream.error")["message"].lower()
    FakeJob.instances[0].stop()
    ws.close()


def test_stream_unavailable_is_reported(stream_client, settings):
    client, state = stream_client
    state["unavailable"] = "aiortc kurulu değil"
    _fake_exe(settings)
    ws = _ws(client)
    client.post("/api/projects/p/run", json={}, headers=AUTH)
    ws.send_json(OFFER)
    assert "aiortc kurulu değil" in _next(ws, "stream.error")["message"]
    FakeJob.instances[0].stop()
    ws.close()


@pytest.mark.parametrize("msg", [
    {"type": "stream.offer", "sdp": "x" * 70_000, "sdp_type": "offer"},
    {"type": "stream.offer", "sdp": 5, "sdp_type": "offer"},
    {"type": "stream.offer", "sdp": "v=0", "sdp_type": "answer"},
])
def test_malformed_offer_is_rejected(stream_client, msg):
    client, _ = stream_client
    ws = _ws(client)
    ws.send_json(msg)
    assert _next(ws, "stream.error")["message"]
    assert FakeSession.instances == []
    ws.close()


def test_garbage_messages_do_not_break_socket(stream_client):
    client, _ = stream_client
    ws = _ws(client)
    ws.send_text("{bozuk")
    ws.send_json([1, 2])
    ws.send_json(OFFER)
    assert _next(ws, "stream.error")  # soket hâlâ yanıt veriyor
    ws.close()


def test_health_reports_stream_availability(stream_client):
    client, _ = stream_client
    body = client.get("/api/health", headers=AUTH).json()
    assert set(body["stream"]) == {"available", "reason"}
