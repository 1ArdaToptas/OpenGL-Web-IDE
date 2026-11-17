from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app

from .conftest import AUTH


@pytest.fixture
def dist(tmp_path):
    d = tmp_path / "dist"
    (d / "assets").mkdir(parents=True)
    (d / "index.html").write_text("<!doctype html><title>IDE</title>", "utf-8")
    (d / "assets" / "app.js").write_text("console.log(1)", "utf-8")
    (tmp_path / "gizli.txt").write_text("gizli", "utf-8")
    return d


@pytest.fixture
def static_client(settings, dist):
    with TestClient(create_app(replace(settings, frontend_dist=dist)), base_url="http://127.0.0.1:8765") as c:
        yield c


def test_index_is_served_without_token(static_client):
    r = static_client.get("/")
    assert r.status_code == 200
    assert "<title>IDE</title>" in r.text


def test_assets_are_served(static_client):
    r = static_client.get("/assets/app.js")
    assert r.status_code == 200
    assert "javascript" in r.headers["content-type"]


def test_index_has_strict_security_headers(static_client):
    h = static_client.get("/").headers
    csp = h["content-security-policy"]
    for directive in ("default-src 'self'", "script-src 'self'", "frame-ancestors 'none'", "object-src 'none'",
                      "connect-src 'self' ws://127.0.0.1:8765 ws://localhost:8765"):
        assert directive in csp
    assert "unsafe-eval" not in csp
    assert h["x-content-type-options"] == "nosniff"
    assert h["referrer-policy"] == "no-referrer"
    assert h["cache-control"] == "no-store"


def test_api_still_requires_token(static_client):
    assert static_client.get("/api/health").status_code == 401
    assert static_client.get("/api/health", headers=AUTH).status_code == 200


@pytest.mark.parametrize("path", ["/../gizli.txt", "/%2e%2e/gizli.txt", "/assets/..%2F..%2Fgizli.txt"])
def test_static_traversal_is_blocked(static_client, path):
    r = static_client.get(path)
    assert "gizli" not in r.text


def test_static_respects_host_check(static_client):
    assert static_client.get("/", headers={"Host": "evil.com"}).status_code == 400


def test_without_dist_root_is_404(client):
    assert client.get("/").status_code == 404
