import os
import subprocess

import pytest

from backend.workspace import PathRejected, Workspace
from engine.project import Profile, create_project


@pytest.fixture
def ws(tmp_path, templates_dir):
    root = tmp_path / "ws"
    root.mkdir()
    create_project(root, "p", Profile.MODERN, templates_dir)
    return Workspace(root)


@pytest.mark.parametrize("rel", ["src/main.c", "src/util/math.h", "src/a_b-1.cpp", "shaders/basic.vert",
                                 "shaders/post/blur.frag", "src/notlar.txt", "src/x.hpp", "shaders/g.geom",
                                 "shaders/c.glsl"])
def test_allowed_paths(ws, rel):
    path = ws.file_path("p", rel)
    assert path == ws.root / "p" / rel.replace("/", os.sep)


@pytest.mark.parametrize("rel", [
    "", "src", "src/", "main.c", "project.json", "build/app.exe", "CMakeLists.txt",  # izinli alt dizin dışı
    "../p/src/main.c", "src/../../x.c", "src/./main.c", "src/../project.json",           # gezinme
    "src\\main.c", "src/..\\..\\x.c",                                                     # ters bölü
    "/src/main.c", "C:/Windows/x.c", "C:src/main.c", "//host/share/x.c", "\\\\host\\x.c",  # mutlak/UNC
    "src/main.c:stream", "src/a:b.c",                                                     # ADS
    "src/CON", "src/con.c", "src/Nul.txt", "src/COM1.h", "src/lpt9.c", "src/aux.cpp",     # aygıt adları
    "src/main.c.", "src/main.c ", "src/ main.c", "src/.gizli.c", "src/-x.c",             # nokta/boşluk
    "src/main.exe", "src/run.bat", "src/x.dll", "src/x.ps1", "src/main",                  # uzantı
    "src/çizim.c", "src/ｍａｉｎ.c", "src/a\x00.c", "src/a\nb.c",                          # Unicode/kontrol
    "src/a/b/c/d/e.c",                                                                    # derinlik
    "src/" + "x" * 70 + ".c",                                                             # uzunluk
])
def test_rejected_paths(ws, rel):
    with pytest.raises(PathRejected):
        ws.file_path("p", rel)


@pytest.mark.parametrize("name", ["..", "../ws", "p/src", "a;b", "CON", ""])
def test_rejected_project_names(ws, name):
    with pytest.raises(PathRejected):
        ws.project_dir(name)


def test_missing_project_is_rejected(ws):
    with pytest.raises(PathRejected):
        ws.project_dir("yok")


def test_junction_inside_project_is_rejected(ws, tmp_path):
    outside = tmp_path / "disari"
    outside.mkdir()
    (outside / "gizli.c").write_text("x")
    link = ws.root / "p" / "src" / "baglanti"
    subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(outside)], check=True, capture_output=True)
    with pytest.raises(PathRejected):
        ws.file_path("p", "src/baglanti/gizli.c")


def test_junctioned_project_dir_is_rejected(ws, tmp_path):
    outside = tmp_path / "baska"
    outside.mkdir()
    (outside / "project.json").write_text('{"profile": "legacy"}')
    subprocess.run(["cmd", "/c", "mklink", "/J", str(ws.root / "kopru"), str(outside)], check=True,
                   capture_output=True)
    with pytest.raises(PathRejected):
        ws.project_dir("kopru")


def test_list_projects_skips_non_projects(ws):
    (ws.root / "bos-dizin").mkdir()
    (ws.root / "dosya.txt").write_text("x")
    assert [(p.name, p.profile) for p in ws.list_projects()] == [("p", Profile.MODERN)]


def test_tree_lists_only_user_dirs(ws):
    (ws.root / "p" / "build").mkdir()
    (ws.root / "p" / "build" / "app.exe").write_bytes(b"")
    tree = ws.tree("p")
    paths = {e["path"] for e in tree}
    assert {"src", "src/main.c", "shaders", "shaders/basic.vert", "shaders/basic.frag"} <= paths
    assert not any(p.startswith("build") or p == "project.json" for p in paths)
    assert next(e for e in tree if e["path"] == "src")["type"] == "dir"
