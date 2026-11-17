import pytest

from .conftest import AUTH


@pytest.fixture
def proj(client):
    r = client.post("/api/projects", json={"name": "p", "profile": "modern"}, headers=AUTH)
    assert r.status_code == 201, r.text
    return "p"


def test_list_projects_initially_empty(client):
    assert client.get("/api/projects", headers=AUTH).json() == []


def test_create_project_and_list(client):
    r = client.post("/api/projects", json={"name": "ucgen", "profile": "legacy"}, headers=AUTH)
    assert r.status_code == 201
    assert r.json() == {"name": "ucgen", "profile": "legacy"}
    assert client.get("/api/projects", headers=AUTH).json() == [{"name": "ucgen", "profile": "legacy"}]


@pytest.mark.parametrize("body", [{"name": "../x", "profile": "legacy"}, {"name": "a;calc", "profile": "legacy"},
                                  {"name": "$(calc)", "profile": "legacy"}, {"name": "CON", "profile": "legacy"},
                                  {"name": "ok", "profile": "vulkan"}, {"name": "ok"},
                                  {"name": "ok", "profile": "legacy", "path": "C:/"}])
def test_create_project_rejects_invalid_input(client, settings, body):
    assert client.post("/api/projects", json=body, headers=AUTH).status_code in (400, 422)
    assert list(settings.workspace_root.iterdir()) == []


def test_list_examples(client):
    r = client.get("/api/examples", headers=AUTH)
    assert r.status_code == 200
    ids = {(e["profile"], e["id"]) for e in r.json()}
    assert {("legacy", "baslangic"), ("legacy", "donen-ucgen"), ("legacy", "sekiller"), ("modern", "baslangic"),
            ("modern", "kup")} <= ids
    assert set(r.json()[0]) == {"id", "profile", "title", "description", "kind"}  # dosya yolu sızmaz


def test_create_project_from_example(client):
    r = client.post("/api/projects", json={"name": "k", "profile": "modern", "example": "kup"}, headers=AUTH)
    assert r.status_code == 201
    paths = {e["path"] for e in client.get("/api/projects/k/tree", headers=AUTH).json()}
    assert "shaders/kup.vert" in paths


@pytest.mark.parametrize("example", ["kup", "yok", "../../x", "A B"])
def test_create_project_with_invalid_example_is_rejected(client, settings, example):
    r = client.post("/api/projects", json={"name": "z", "profile": "legacy", "example": example}, headers=AUTH)
    assert r.status_code in (400, 422)
    assert not (settings.workspace_root / "z").exists()


def test_create_duplicate_project_is_409(client, proj):
    assert client.post("/api/projects", json={"name": proj, "profile": "legacy"}, headers=AUTH).status_code == 409


def test_tree(client, proj):
    paths = {e["path"] for e in client.get(f"/api/projects/{proj}/tree", headers=AUTH).json()}
    assert {"src/main.c", "shaders/basic.vert"} <= paths


def test_read_template_file(client, proj):
    r = client.get(f"/api/projects/{proj}/files/src/main.c", headers=AUTH)
    assert r.status_code == 200
    assert "glfwCreateWindow" in r.json()["content"]


def test_write_then_read_new_file(client, proj):
    content = "// türkçe yorum\nint topla(int a, int b);\r\n"
    r = client.put(f"/api/projects/{proj}/files/src/util/math.h", json={"content": content}, headers=AUTH)
    assert r.status_code == 200
    assert client.get(f"/api/projects/{proj}/files/src/util/math.h", headers=AUTH).json()["content"] == content


def test_write_too_large_file_is_413(client, proj, settings):
    big = "x" * (settings.max_file_bytes + 1)
    assert client.put(f"/api/projects/{proj}/files/src/big.c", json={"content": big}, headers=AUTH).status_code == 413


def test_write_rejects_extra_fields(client, proj):
    r = client.put(f"/api/projects/{proj}/files/src/a.c", json={"content": "", "mode": "0777"}, headers=AUTH)
    assert r.status_code == 422


@pytest.mark.parametrize("rel", ["src/%2e%2e/project.json", "src%2F..%2F..%2Fx.c", "src/con.c", "build/app.exe",
                                 "src/main.exe", "CMakeLists.txt", "src/a%3Ab.c", "src/..%5C..%5Cx.c",
                                 "%2e%2e/%2e%2e/x.c"])
def test_path_attacks_are_rejected(client, proj, settings, rel):
    r = client.put(f"/api/projects/{proj}/files/{rel}", json={"content": "x"}, headers=AUTH)
    assert r.status_code in (400, 404), r.text
    assert client.get(f"/api/projects/{proj}/files/{rel}", headers=AUTH).status_code in (400, 404)
    assert not (settings.workspace_root.parent / "x.c").exists()


def test_project_name_attack_in_url(client, proj):
    assert client.get("/api/projects/%2e%2e/tree", headers=AUTH).status_code in (400, 404)


def test_delete_file(client, proj):
    assert client.delete(f"/api/projects/{proj}/files/shaders/basic.frag", headers=AUTH).status_code == 204
    assert client.get(f"/api/projects/{proj}/files/shaders/basic.frag", headers=AUTH).status_code == 404


def test_missing_file_is_404(client, proj):
    assert client.get(f"/api/projects/{proj}/files/src/yok.c", headers=AUTH).status_code == 404


def test_missing_project_is_404(client):
    assert client.get("/api/projects/yok/tree", headers=AUTH).status_code == 404


def test_delete_project(client, proj, settings):
    assert client.delete(f"/api/projects/{proj}", headers=AUTH).status_code == 204
    assert client.get("/api/projects", headers=AUTH).json() == []
    assert not (settings.workspace_root / proj).exists()
