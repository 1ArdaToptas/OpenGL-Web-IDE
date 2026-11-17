import pytest

from engine.toolchain import ToolchainError, detect


def _fake_msys(root, tools=("gcc", "g++", "cmake", "ninja"), headers=("GL/freeglut.h", "GLFW/glfw3.h")):
    bin_dir = root / "ucrt64" / "bin"
    bin_dir.mkdir(parents=True)
    for t in tools:
        (bin_dir / f"{t}.exe").write_bytes(b"")
    for h in headers:
        p = root / "ucrt64" / "include" / h
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("")
    return root


def test_missing_root_reports_all_tools(tmp_path):
    with pytest.raises(ToolchainError) as e:
        detect(tmp_path / "yok", check_versions=False)
    assert set(e.value.missing) >= {"gcc", "g++", "cmake", "ninja"}


def test_missing_single_tool_is_named(tmp_path):
    root = _fake_msys(tmp_path, tools=("gcc", "g++", "ninja"))
    with pytest.raises(ToolchainError) as e:
        detect(root, check_versions=False)
    assert e.value.missing == ["cmake"]


def test_missing_library_header_is_named(tmp_path):
    root = _fake_msys(tmp_path, headers=("GL/freeglut.h",))
    with pytest.raises(ToolchainError) as e:
        detect(root, check_versions=False)
    assert e.value.missing == ["glfw"]


def test_complete_fake_toolchain_resolves_absolute_paths(tmp_path):
    root = _fake_msys(tmp_path)
    tc = detect(root, check_versions=False)
    assert tc.gcc == root / "ucrt64" / "bin" / "gcc.exe"
    assert tc.cmake.is_absolute()
    assert tc.bin_dir == root / "ucrt64" / "bin"


@pytest.mark.native
def test_real_toolchain_reports_versions(msys2_root):
    tc = detect(msys2_root)
    assert tc.versions["gcc"].startswith("gcc")
    assert "cmake version" in tc.versions["cmake"]
