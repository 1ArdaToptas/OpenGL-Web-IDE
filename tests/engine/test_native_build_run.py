"""Gerçek MSYS2 toolchain ve GPU ile uçtan uca derleme/çalıştırma (TEST-PLAN §2-3)."""
import re
import threading
import time

import pytest

from engine.build import BuildJob
from engine.project import BuildSettings, Profile, create_project, list_examples
from engine.run import NotBuiltError, RunJob
from engine.sandbox import Limits
from engine.toolchain import detect

from ..conftest import MSYS2_ROOT, TEMPLATES_DIR

pytestmark = pytest.mark.native

BACKGROUND = (26, 26, 31)
# Başlangıç şablonlarının pencere merkezi: legacy turuncu üçgen, modern dönen karenin (dönüşten bağımsız) merkezi
REFERENCE = {Profile.LEGACY: (255, 128, 0), Profile.MODERN: (127, 0, 127)}
TOLERANCE = 8


class Output:
    def __init__(self):
        self.parts = []

    def __call__(self, stream, text):
        self.parts.append(text)

    @property
    def text(self):
        return "".join(self.parts)


@pytest.fixture(scope="module")
def tc():
    return detect(MSYS2_ROOT)


def _build(project, tc, templates_dir, settings=BuildSettings()):
    out = Output()
    result = BuildJob(project, tc, settings, templates_dir, on_output=out).run()
    return result, out


def _capture_center(job, timeout=15.0):
    """Programın penceresini dışarıdan yakalar (programın test koduna ihtiyaç duymaz; sade şablonlar için)."""
    from engine.stream.window import WindowCapture
    deadline = time.monotonic() + timeout
    while not (hwnd := job.find_window()) and time.monotonic() < deadline:
        time.sleep(0.1)
    assert hwnd, "program penceresi bulunamadı"
    time.sleep(0.7)  # ilk kareler çizilsin
    cap = WindowCapture(hwnd)
    try:
        frame = cap.grab()
        return frame.pixel(frame.width // 2, frame.height // 2)
    finally:
        cap.close()


def _pixel(text):
    m = re.search(r"OGLIDE_PIXEL (\d+) (\d+) (\d+)", text)
    assert m, text
    return tuple(int(v) for v in m.groups())


@pytest.mark.parametrize("profile", [Profile.LEGACY, Profile.MODERN])
def test_template_builds_and_renders_on_gpu(tmp_path, templates_dir, tc, profile):
    proj = create_project(tmp_path, "p", profile, templates_dir)
    result, out = _build(proj, tc, templates_dir)
    assert result.ok, out.text
    assert [d for d in result.diagnostics if d.severity == "error"] == []
    assert proj.executable.is_file()

    run_out = Output()
    job = RunJob(proj, tc, on_output=run_out, limits=Limits(timeout_s=60))
    job.start()
    try:
        px = _capture_center(job)
        assert job.integrity_level == "low"
    finally:
        job.stop()
        r = job.wait()
    assert r.reason == "killed", run_out.text  # program kendiliğinden bitmedi; Durdur ile kapandı
    assert px != BACKGROUND
    assert all(abs(a - b) <= TOLERANCE for a, b in zip(px, REFERENCE[profile])), px


EXAMPLE_REFERENCE = {
    ("legacy", "baslangic"): (255, 128, 0),  # turuncu üçgen
    ("legacy", "sekiller"): (51, 204, 76),  # ortadaki dolu yeşil kare
    ("legacy", "donen-ucgen"): (69, 70, 116),  # dönen üçgenin (dönüşten bağımsız) merkezi
}


@pytest.mark.parametrize("example", list_examples(TEMPLATES_DIR), ids=lambda e: f"{e.profile.value}-{e.id}")
def test_every_example_builds_and_renders(tmp_path, templates_dir, tc, example):
    proj = create_project(tmp_path, "ornek", example.profile, templates_dir, example=example.id)
    result, out = _build(proj, tc, templates_dir)
    assert result.ok, out.text
    assert [d for d in result.diagnostics if d.severity in ("error", "warning")] == []

    run_out = Output()
    job = RunJob(proj, tc, on_output=run_out, limits=Limits(timeout_s=60))
    job.start()
    try:
        px = _capture_center(job)
    finally:
        job.stop()
        job.wait()
    assert "Çalışma hatası" not in run_out.text and "ERROR" not in run_out.text, run_out.text
    assert px != BACKGROUND
    if ref := EXAMPLE_REFERENCE.get((example.profile.value, example.id)):
        assert all(abs(a - b) <= TOLERANCE for a, b in zip(px, ref)), px


def test_compile_error_is_reported_with_location(tmp_path, templates_dir, tc):
    proj = create_project(tmp_path, "bozuk", Profile.LEGACY, templates_dir)
    main = proj.dir / "src" / "main.c"
    lines = main.read_text("utf-8").splitlines()
    idx = next(i for i, line in enumerate(lines) if "glBegin(GL_TRIANGLES)" in line)
    lines[idx] = lines[idx].replace("glBegin", "glBegn")
    main.write_text("\n".join(lines) + "\n", "utf-8")

    result, out = _build(proj, tc, templates_dir)
    assert not result.ok
    assert result.stage == "build"
    errors = [d for d in result.diagnostics if d.severity == "error"]
    assert any(d.file == "src/main.c" and d.line == idx + 1 for d in errors), out.text


def test_link_error_is_reported(tmp_path, templates_dir, tc):
    proj = create_project(tmp_path, "link", Profile.LEGACY, templates_dir)
    main = proj.dir / "src" / "main.c"
    src = main.read_text("utf-8")
    src = src.replace("#include <GL/freeglut.h>", "#include <GL/freeglut.h>\nvoid oglide_yok(void);", 1)
    src = src.replace("glutInit(&argc, argv);", "glutInit(&argc, argv);\n    oglide_yok();", 1)
    main.write_text(src, "utf-8")
    result, out = _build(proj, tc, templates_dir)
    assert not result.ok
    assert any("undefined reference to `oglide_yok'" in d.message for d in result.diagnostics), out.text


def test_cpp_sources_and_release_settings_build(tmp_path, templates_dir, tc):
    proj = create_project(tmp_path, "cpp", Profile.LEGACY, templates_dir)
    (proj.dir / "src" / "main.c").rename(proj.dir / "src" / "main.cpp")
    settings = BuildSettings.from_dict({"config": "Release", "cxx_std": "20", "warnings": "default"})
    result, out = _build(proj, tc, templates_dir, settings)
    assert result.ok, out.text


def test_run_before_build_fails(tmp_path, templates_dir, tc):
    proj = create_project(tmp_path, "yeni", Profile.MODERN, templates_dir)
    with pytest.raises(NotBuiltError):
        RunJob(proj, tc, on_output=Output()).run()


@pytest.mark.parametrize("profile", [Profile.LEGACY, Profile.MODERN])
def test_closing_window_exits_cleanly(tmp_path, templates_dir, tc, profile):
    """Kullanıcı pencereyi X ile kapatınca şablon programı 0 ile çıkmalı (hata mesajı olmadan)."""
    import ctypes
    import time
    user32 = ctypes.windll.user32
    proj = create_project(tmp_path, "kapat", profile, templates_dir)
    assert _build(proj, tc, templates_dir)[0].ok
    out = Output()
    job = RunJob(proj, tc, on_output=out, limits=Limits(timeout_s=30))
    job.start()
    deadline = time.monotonic() + 15
    # Başlığa göre değil, iş sürecinin PID'ine göre: aynı başlıklı başka bir pencereye (ör. tarayıcı sekmesi)
    # WM_CLOSE gönderilmesin.
    while not (hwnd := job.find_window()) and time.monotonic() < deadline:
        time.sleep(0.1)
    assert hwnd, out.text
    time.sleep(0.5)  # birkaç zamanlayıcı/kare dönsün
    user32.PostMessageW(hwnd, 0x0010, 0, 0)  # WM_CLOSE
    r = job.wait()
    assert (r.exit_code, r.reason) == (0, "exit"), out.text
    assert "ERROR" not in out.text


def test_stop_before_start_prevents_run(tmp_path, templates_dir, tc):
    proj = create_project(tmp_path, "erken", Profile.LEGACY, templates_dir)
    assert _build(proj, tc, templates_dir)[0].ok
    job = RunJob(proj, tc, on_output=Output(), limits=Limits(timeout_s=30))
    job.stop()
    r = job.run()
    assert r.reason == "killed"
    assert r.duration_ms < 5000


def test_running_program_can_be_stopped(tmp_path, templates_dir, tc):
    proj = create_project(tmp_path, "dur", Profile.MODERN, templates_dir)
    assert _build(proj, tc, templates_dir)[0].ok
    out = Output()
    job = RunJob(proj, tc, on_output=out, limits=Limits(timeout_s=30))
    threading.Timer(2.0, job.stop).start()
    r = job.run()
    assert r.reason == "killed"
    assert "GL_RENDERER:" in out.text
