from pathlib import Path

from engine.build import build_command, configure_command
from engine.project import BuildSettings, Profile, Project
from engine.toolchain import Toolchain


def _tc(root=Path("C:/msys64")):
    b = root / "ucrt64" / "bin"
    return Toolchain(root=root, bin_dir=b, gcc=b / "gcc.exe", gxx=b / "g++.exe", cmake=b / "cmake.exe",
                     ninja=b / "ninja.exe")


def test_configure_uses_profile_template_as_source(tmp_path, templates_dir):
    proj = Project(dir=tmp_path / "p", profile=Profile.MODERN)
    argv = configure_command(proj, _tc(), BuildSettings(), templates_dir)
    assert argv[0] == str(_tc().cmake)
    assert argv[argv.index("-S") + 1] == str(templates_dir / "modern-glfw")
    assert argv[argv.index("-B") + 1] == str(proj.build_dir)


def test_legacy_profile_never_uses_modern_template(tmp_path, templates_dir):
    proj = Project(dir=tmp_path / "p", profile=Profile.LEGACY)
    argv = configure_command(proj, _tc(), BuildSettings(), templates_dir)
    assert argv[argv.index("-S") + 1] == str(templates_dir / "legacy-freeglut")


def test_configure_passes_settings_as_cache_variables(tmp_path, templates_dir):
    proj = Project(dir=tmp_path / "p", profile=Profile.LEGACY)
    s = BuildSettings.from_dict({"config": "Release", "c_std": "11", "cxx_std": "20", "warnings": "all"})
    argv = configure_command(proj, _tc(), s, templates_dir)
    for expected in ("-DCMAKE_BUILD_TYPE=Release", "-DOGLIDE_C_STD=11", "-DOGLIDE_CXX_STD=20",
                     "-DOGLIDE_WARNINGS=all", f"-DOGLIDE_PROJECT_DIR={proj.dir.as_posix()}",
                     f"-DCMAKE_C_COMPILER={_tc().gcc.as_posix()}", f"-DCMAKE_MAKE_PROGRAM={_tc().ninja.as_posix()}",
                     "-GNinja"):
        assert expected in argv


def test_build_command(tmp_path):
    proj = Project(dir=tmp_path / "p", profile=Profile.LEGACY)
    assert build_command(proj, _tc()) == [str(_tc().cmake), "--build", str(proj.build_dir)]


def test_build_dir_and_executable_live_inside_project(tmp_path):
    proj = Project(dir=tmp_path / "p", profile=Profile.LEGACY)
    assert proj.build_dir == tmp_path / "p" / "build"
    assert proj.executable == tmp_path / "p" / "build" / "app.exe"
