import pytest
from starlette.websockets import WebSocketDisconnect

from backend import security
from backend.config import Settings

from .conftest import AUTH, ORIGIN, TOKEN, WS_URL


def test_request_without_token_is_401(client):
    assert client.get("/api/health").status_code == 401


def test_wrong_token_is_401(client):
    assert client.get("/api/health", headers={"Authorization": "Bearer yanlis"}).status_code == 401


def test_token_in_query_string_is_not_accepted(client):
    assert client.get(f"/api/health?token={TOKEN}").status_code == 401


def test_valid_token_reaches_health(client):
    r = client.get("/api/health", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["toolchain"]["ok"] is False
    assert "gcc" in r.json()["toolchain"]["missing"]


@pytest.mark.parametrize("host", ["evil.com", "evil.com:8765", "127.0.0.1.evil.com", "192.168.1.5:8765"])
def test_foreign_host_header_is_rejected(client, host):
    assert client.get("/api/health", headers={**AUTH, "Host": host}).status_code == 400


def test_localhost_host_header_is_allowed(client):
    assert client.get("/api/health", headers={**AUTH, "Host": "localhost:8765"}).status_code == 200


def test_foreign_origin_is_rejected_even_with_token(client):
    r = client.get("/api/health", headers={**AUTH, "Origin": "https://evil.com"})
    assert r.status_code == 403


def test_allowed_origin_gets_cors_header(client):
    r = client.get("/api/health", headers={**AUTH, "Origin": ORIGIN})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == ORIGIN


def test_cors_preflight_from_allowed_origin(client):
    r = client.options("/api/projects", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST",
                                                  "Access-Control-Request-Headers": "authorization,content-type"})
    assert r.status_code == 200


def test_cors_preflight_from_foreign_origin_is_rejected(client):
    r = client.options("/api/projects", headers={"Origin": "https://evil.com",
                                                  "Access-Control-Request-Method": "POST"})
    assert r.status_code == 403


def _ws_close_code(client, headers=None, first_message=None):
    with pytest.raises(WebSocketDisconnect) as e:
        with client.websocket_connect(WS_URL, headers=headers or {"Origin": ORIGIN}) as ws:
            if first_message is not None:
                ws.send_json(first_message)
            ws.receive_json()
            ws.receive_json()
    return e.value.code


def test_ws_without_auth_message_is_closed(client):
    assert _ws_close_code(client, first_message={"type": "hello"}) == 4401


def test_ws_with_wrong_token_is_closed(client):
    assert _ws_close_code(client, first_message={"type": "auth", "token": "yanlis"}) == 4401


def test_ws_from_foreign_origin_is_rejected(client):
    assert _ws_close_code(client, headers={"Origin": "https://evil.com"}) == 4403


def test_ws_with_foreign_host_is_rejected(client):
    assert _ws_close_code(client, headers={"Origin": ORIGIN, "Host": "evil.com"}) == 4400


def test_ws_with_valid_token_is_ready(client):
    with client.websocket_connect(WS_URL, headers={"Origin": ORIGIN}) as ws:
        ws.send_json({"type": "auth", "token": TOKEN})
        assert ws.receive_json()["type"] == "ready"


def test_oversized_request_body_is_rejected_before_reaching_app(client, settings, monkeypatch):
    from backend import api
    called = []
    monkeypatch.setattr(api, "_ws", lambda request: called.append(1))
    big = b"x" * (settings.max_request_bytes + 1)
    r = client.put("/api/projects/p/files/src/a.c", content=big,
                   headers={**AUTH, "content-type": "application/json"})
    assert r.status_code == 413
    assert called == []


def test_oversized_chunked_body_is_rejected(client, settings):
    def chunks():
        for _ in range(settings.max_request_bytes // 65536 + 2):
            yield b"x" * 65536
    r = client.put("/api/projects/p/files/src/a.c", content=chunks(),
                   headers={**AUTH, "content-type": "application/json"})
    assert r.status_code == 413


def test_generated_tokens_are_long_and_unique():
    tokens = {security.generate_token() for _ in range(20)}
    assert len(tokens) == 20
    assert all(len(t) >= 43 for t in tokens)


def test_refuses_to_run_as_admin(monkeypatch):
    monkeypatch.setattr(security, "is_admin", lambda: True)
    with pytest.raises(security.RunningAsAdminError):
        security.ensure_not_admin()


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.1.5", "::", "localhost.evil.com"])
def test_settings_only_bind_loopback(tmp_path, host):
    with pytest.raises(ValueError):
        Settings(token="t" * 43, workspace_root=tmp_path, templates_dir=tmp_path, msys2_root=tmp_path, host=host)


def test_short_token_is_refused(tmp_path):
    with pytest.raises(ValueError):
        Settings(token="kisa", workspace_root=tmp_path, templates_dir=tmp_path, msys2_root=tmp_path)
