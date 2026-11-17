import threading
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app import create_app
from engine.build import BuildResult
from engine.diagnostics import Diagnostic
from engine.sandbox import Result
from engine.toolchain import Toolchain

from .conftest import AUTH, ORIGIN, TOKEN, WS_URL

B = Path("C:/fake/ucrt64/bin")
FAKE_TC = Toolchain(root=Path("C:/fake"), bin_dir=B, gcc=B / "gcc.exe", gxx=B / "g++.exe", cmake=B / "cmake.exe",
                    ninja=B / "ninja.exe", versions={"gcc": "gcc fake"})


class FakeToolchain:
    def get(self):
        return FAKE_TC

    def status(self):
        return {"ok": True, "missing": [], "versions": FAKE_TC.versions}


class FakeJob:
    """Engine BuildJob/RunJob yerine: çıktı üretir, isteğe bağlı olarak stop() gelene kadar bekler."""
    instances = []

    def __init__(self, kind, on_output, block=False, ok=True, truncated=False, raises=False, **kwargs):
        self.kind, self.on_output, self.block, self.ok = kind, on_output, block, ok
        self.truncated, self.raises, self.kwargs = truncated, raises, kwargs
        self.stopped = threading.Event()
        FakeJob.instances.append(self)

    def stop(self):
        self.stopped.set()

    def run(self):
        self.on_output("stdout", f"{self.kind} başladı\n")
        if self.raises:
            raise RuntimeError("beklenmeyen")
        if self.block:
            self.stopped.wait(10)
        reason = "killed" if self.stopped.is_set() else "exit"
        code = 0 if self.ok and reason == "exit" else 1
        result = Result(exit_code=code, reason=reason, duration_ms=5, output_truncated=self.truncated)
        if self.kind == "build":
            diags = [] if self.ok else [Diagnostic("src/main.c", 3, 1, "error", "x tanımsız")]
            return BuildResult(ok=code == 0, stage="build", result=result, diagnostics=diags)
        return result


@pytest.fixture
def opts():
    FakeJob.instances.clear()
    return {}


@pytest.fixture
def app_client(make_client, opts):
    def build_factory(project, tc, settings, templates_dir, on_output):
        return FakeJob("build", on_output, settings=settings, **opts)

    def run_factory(project, tc, on_output, limits, test_frames):
        return FakeJob("run", on_output, limits=limits, test_frames=test_frames, **opts)

    c = make_client(toolchain=FakeToolchain(), build_factory=build_factory, run_factory=run_factory)
    for name in ("p", "q"):
        assert c.post("/api/projects", json={"name": name, "profile": "legacy"}, headers=AUTH).status_code == 201
    return c


def _fake_exe(settings, name="p"):
    exe = settings.workspace_root / name / "build" / "app.exe"
    exe.parent.mkdir(parents=True, exist_ok=True)
    exe.write_bytes(b"")


def _events_until_exit(ws):
    events = []
    while True:
        e = ws.receive_json()
        events.append(e)
        if e["type"] == "job.exited":
            return events


def _connect(client, project="p"):
    ws = client.websocket_connect(f"{WS_URL}?project={project}", headers={"Origin": ORIGIN}).__enter__()
    ws.send_json({"type": "auth", "token": TOKEN})
    ready = ws.receive_json()
    assert ready["type"] == "ready"
    return ws, ready


def test_build_streams_events_in_order(app_client):
    ws, _ = _connect(app_client)
    r = app_client.post("/api/projects/p/build", json={"config": "Release"}, headers=AUTH)
    assert r.status_code == 202
    job_id = r.json()["jobId"]
    events = _events_until_exit(ws)
    ws.close()
    assert [e["type"] for e in events] == ["job.started", "job.output", "build.diagnostics", "job.exited"]
    assert all(e["jobId"] == job_id for e in events)
    assert events[1] == {"type": "job.output", "jobId": job_id, "stream": "stdout", "data": "build başladı\n"}
    assert events[3]["ok"] is True and events[3]["reason"] == "exit"
    assert FakeJob.instances[0].kwargs["settings"].config == "Release"


def test_failed_build_sends_diagnostics(app_client, opts):
    opts["ok"] = False
    ws, _ = _connect(app_client)
    app_client.post("/api/projects/p/build", json={}, headers=AUTH)
    events = _events_until_exit(ws)
    ws.close()
    diag = next(e for e in events if e["type"] == "build.diagnostics")
    assert diag["items"] == [{"file": "src/main.c", "line": 3, "col": 1, "severity": "error", "message": "x tanımsız"}]
    assert events[-1]["ok"] is False


def test_second_job_on_same_project_is_409(app_client, opts):
    opts["block"] = True
    assert app_client.post("/api/projects/p/build", json={}, headers=AUTH).status_code == 202
    assert app_client.post("/api/projects/p/build", json={}, headers=AUTH).status_code == 409
    FakeJob.instances[0].stop()


def test_global_job_limit_is_429(settings):
    limited = replace(settings, max_active_jobs=1)
    c = TestClient(create_app(limited, toolchain=FakeToolchain(),
                              build_factory=lambda p, tc, s, t, on_output: FakeJob("build", on_output, block=True)),
                   base_url="http://127.0.0.1:8765")
    for name in ("p", "q"):
        c.post("/api/projects", json={"name": name, "profile": "legacy"}, headers=AUTH)
    assert c.post("/api/projects/p/build", json={}, headers=AUTH).status_code == 202
    assert c.post("/api/projects/q/build", json={}, headers=AUTH).status_code == 429
    FakeJob.instances[-1].stop()
    c.close()


def test_stop_job(app_client, opts):
    opts["block"] = True
    ws, _ = _connect(app_client)
    job_id = app_client.post("/api/projects/p/build", json={}, headers=AUTH).json()["jobId"]
    assert ws.receive_json()["type"] == "job.started"
    assert app_client.post(f"/api/jobs/{job_id}/stop", headers=AUTH).status_code == 204
    events = _events_until_exit(ws)
    ws.close()
    assert events[-1]["reason"] == "killed"


def test_project_is_idle_again_after_job(app_client):
    ws, _ = _connect(app_client)
    app_client.post("/api/projects/p/build", json={}, headers=AUTH)
    _events_until_exit(ws)
    ws.close()
    assert app_client.post("/api/projects/p/build", json={}, headers=AUTH).status_code == 202


def test_stop_unknown_job_is_404(app_client):
    assert app_client.post("/api/jobs/yok/stop", headers=AUTH).status_code == 404


def test_build_rejects_unknown_settings(app_client):
    assert app_client.post("/api/projects/p/build", json={"cflags": "-fplugin=x"}, headers=AUTH).status_code == 422


def test_build_without_toolchain_is_503(client):
    client.post("/api/projects", json={"name": "p", "profile": "legacy"}, headers=AUTH)
    r = client.post("/api/projects/p/build", json={}, headers=AUTH)
    assert r.status_code == 503
    assert "gcc" in r.json()["detail"]["missing"]


def test_run_before_build_is_409(app_client):
    assert app_client.post("/api/projects/p/run", json={}, headers=AUTH).status_code == 409


def test_run_passes_limits_and_test_frames(app_client, settings):
    _fake_exe(settings)
    ws, _ = _connect(app_client)
    r = app_client.post("/api/projects/p/run", json={"timeout_s": 12, "test_frames": 7}, headers=AUTH)
    assert r.status_code == 202
    events = _events_until_exit(ws)
    ws.close()
    job = FakeJob.instances[0]
    assert job.kwargs["test_frames"] == 7
    assert job.kwargs["limits"].timeout_s == 12
    assert job.kwargs["limits"].memory_mb == settings.run_limits.memory_mb
    assert events[-1]["kind"] == "run"


def test_run_rejects_excessive_timeout(app_client, settings):
    _fake_exe(settings)
    assert app_client.post("/api/projects/p/run", json={"timeout_s": 99999}, headers=AUTH).status_code == 422


def test_output_truncation_is_reported(app_client, opts):
    opts["truncated"] = True
    ws, _ = _connect(app_client)
    app_client.post("/api/projects/p/build", json={}, headers=AUTH)
    assert _events_until_exit(ws)[-1]["outputTruncated"] is True
    ws.close()


def test_limit_violation_is_reported(app_client, settings, opts, monkeypatch):
    _fake_exe(settings)
    original = FakeJob.run

    def run_over_limit(self):
        self.on_output("stdout", "x\n")
        return Result(exit_code=1, reason="limit", duration_ms=5, output_truncated=False, limit="memory")

    monkeypatch.setattr(FakeJob, "run", run_over_limit)
    ws, _ = _connect(app_client)
    app_client.post("/api/projects/p/run", json={}, headers=AUTH)
    exited = _events_until_exit(ws)[-1]
    ws.close()
    monkeypatch.setattr(FakeJob, "run", original)
    assert (exited["reason"], exited["limit"]) == ("limit", "memory")


def test_unexpected_engine_error_frees_project(app_client, opts):
    opts["raises"] = True
    ws, _ = _connect(app_client)
    app_client.post("/api/projects/p/build", json={}, headers=AUTH)
    assert _events_until_exit(ws)[-1]["reason"] == "error"
    ws.close()
    opts["raises"] = False
    assert app_client.post("/api/projects/p/build", json={}, headers=AUTH).status_code == 202


def test_delete_project_with_active_job_is_409(app_client, opts):
    opts["block"] = True
    app_client.post("/api/projects/p/build", json={}, headers=AUTH)
    assert app_client.delete("/api/projects/p", headers=AUTH).status_code == 409
    FakeJob.instances[0].stop()


def test_reconnect_sees_active_job(app_client, opts):
    opts["block"] = True
    job_id = app_client.post("/api/projects/p/build", json={}, headers=AUTH).json()["jobId"]
    ws, ready = _connect(app_client)
    assert ready["activeJob"] == {"jobId": job_id, "kind": "build"}
    FakeJob.instances[0].stop()
    _events_until_exit(ws)
    ws.close()


def test_events_are_scoped_to_project(app_client):
    ws_q, _ = _connect(app_client, "q")
    ws_p, _ = _connect(app_client, "p")
    app_client.post("/api/projects/p/build", json={}, headers=AUTH)
    _events_until_exit(ws_p)
    q_job = app_client.post("/api/projects/q/build", json={}, headers=AUTH).json()["jobId"]
    first = ws_q.receive_json()
    assert (first["type"], first["jobId"]) == ("job.started", q_job)  # p'nin olayları q'ya gelmedi
    ws_p.close()
    ws_q.close()


def test_ws_for_unknown_project_is_closed(app_client):
    with pytest.raises(WebSocketDisconnect) as e:
        with app_client.websocket_connect(f"{WS_URL}?project=yok", headers={"Origin": ORIGIN}) as ws:
            ws.send_json({"type": "auth", "token": TOKEN})
            ws.receive_json()
    assert e.value.code == 4404
