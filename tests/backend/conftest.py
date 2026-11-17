import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import Settings

TOKEN = "test-token-" + "x" * 32
ORIGIN = "http://127.0.0.1:8765"
WS_URL = "ws://127.0.0.1:8765/ws"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def settings(tmp_path, templates_dir):
    ws = tmp_path / "ws"
    ws.mkdir()
    return Settings(token=TOKEN, workspace_root=ws, templates_dir=templates_dir, msys2_root=tmp_path / "msys-yok",
                    port=8765)


@pytest.fixture
def make_client(settings):
    clients = []

    def _make(**overrides):
        app = create_app(settings, **overrides)
        c = TestClient(app, base_url="http://127.0.0.1:8765")
        clients.append(c)
        return c

    yield _make
    for c in clients:
        c.close()


@pytest.fixture
def client(make_client):
    return make_client()
