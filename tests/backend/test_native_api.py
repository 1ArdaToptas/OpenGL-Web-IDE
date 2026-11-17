"""Gerçek motor + toolchain + GPU ile HTTP/WS üzerinden uçtan uca akış."""
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app

from ..conftest import MSYS2_ROOT
from .conftest import AUTH, ORIGIN, TOKEN, WS_URL

pytestmark = pytest.mark.native


@pytest.fixture
def real_client(settings):
    with TestClient(create_app(replace(settings, msys2_root=MSYS2_ROOT)), base_url="http://127.0.0.1:8765") as c:
        yield c


def _until_exit(ws):
    events = []
    while (e := ws.receive_json())["type"] != "job.exited":
        events.append(e)
    return events, e


def test_create_build_run_over_api(real_client):
    c = real_client
    # Test modlu (OGLIDE_TEST_FRAMES) örnek: sade başlangıç kendiliğinden bitmez
    assert c.post("/api/projects", json={"name": "demo", "profile": "legacy", "example": "donen-ucgen"},
                  headers=AUTH).status_code == 201
    with c.websocket_connect(f"{WS_URL}?project=demo", headers={"Origin": ORIGIN}) as ws:
        ws.send_json({"type": "auth", "token": TOKEN})
        assert ws.receive_json()["type"] == "ready"

        assert c.post("/api/projects/demo/build", json={}, headers=AUTH).status_code == 202
        events, exited = _until_exit(ws)
        assert exited["ok"] is True, events
        assert any(e["type"] == "job.output" for e in events)

        assert c.post("/api/projects/demo/run", json={"test_frames": 5, "timeout_s": 30},
                      headers=AUTH).status_code == 202
        events, exited = _until_exit(ws)
        output = "".join(e["data"] for e in events if e["type"] == "job.output")
        assert (exited["code"], exited["reason"]) == (0, "exit"), output
        assert "OGLIDE_PIXEL" in output and "OGLIDE_GLERROR 0" in output


def test_build_error_diagnostics_over_api(real_client):
    c = real_client
    c.post("/api/projects", json={"name": "hata", "profile": "modern"}, headers=AUTH)
    c.put("/api/projects/hata/files/src/main.c", json={"content": "int main(void) { return yok; }\n"}, headers=AUTH)
    with c.websocket_connect(f"{WS_URL}?project=hata", headers={"Origin": ORIGIN}) as ws:
        ws.send_json({"type": "auth", "token": TOKEN})
        ws.receive_json()
        c.post("/api/projects/hata/build", json={}, headers=AUTH)
        events, exited = _until_exit(ws)
    assert exited["ok"] is False
    items = next(e for e in events if e["type"] == "build.diagnostics")["items"]
    assert any(i["file"] == "src/main.c" and i["line"] == 1 and i["severity"] == "error" for i in items)
