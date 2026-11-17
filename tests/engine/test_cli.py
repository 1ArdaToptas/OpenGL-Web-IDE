import json

import pytest

from engine.cli import main

from ..conftest import MSYS2_ROOT


def test_new_creates_project(tmp_path, capsys):
    assert main(["new", "ucgen", "--profile", "legacy", "--workspace", str(tmp_path)]) == 0
    assert json.loads((tmp_path / "ucgen" / "project.json").read_text("utf-8"))["profile"] == "legacy"
    assert "ucgen" in capsys.readouterr().out


def test_new_with_invalid_name_fails_cleanly(tmp_path, capsys):
    assert main(["new", "../x", "--profile", "legacy", "--workspace", str(tmp_path)]) == 2
    assert "Geçersiz proje adı" in capsys.readouterr().err


def test_doctor_reports_missing_toolchain(tmp_path, capsys):
    assert main(["doctor", "--msys2", str(tmp_path / "yok")]) == 1
    assert "gcc" in capsys.readouterr().err


@pytest.mark.native
def test_doctor_with_real_toolchain(capsys):
    assert main(["doctor", "--msys2", str(MSYS2_ROOT)]) == 0
    assert "gcc" in capsys.readouterr().out


@pytest.mark.native
def test_build_and_run_from_cli(tmp_path, capsys):
    main(["new", "kare", "--profile", "modern", "--workspace", str(tmp_path)])
    proj = str(tmp_path / "kare")
    assert main(["build", proj, "--msys2", str(MSYS2_ROOT)]) == 0
    assert main(["run", proj, "--frames", "5", "--msys2", str(MSYS2_ROOT)]) == 0
    assert "OGLIDE_PIXEL" in capsys.readouterr().out


@pytest.mark.native
def test_build_failure_returns_nonzero_and_prints_diagnostics(tmp_path, capsys):
    main(["new", "bozuk", "--profile", "legacy", "--workspace", str(tmp_path)])
    (tmp_path / "bozuk" / "src" / "main.c").write_text("int main(void) { return x; }\n", "utf-8")
    assert main(["build", str(tmp_path / "bozuk"), "--msys2", str(MSYS2_ROOT)]) == 1
    assert "src/main.c:1:" in capsys.readouterr().err
