"""Pencere bulma (PID), yakalama ve girdi — gerçek GPU ile (Faz 8)."""
import ctypes
import re
import time

import pytest

from engine.project import Profile, create_project
from engine.run import RunJob
from engine.sandbox import Limits
from engine.stream.input import apply_input
from engine.stream.window import WindowCapture, WindowUnavailable
from engine.toolchain import detect

from ..conftest import MSYS2_ROOT
from .test_native_build_run import BACKGROUND, REFERENCE, TOLERANCE, Output, _build

pytestmark = pytest.mark.native
user32 = ctypes.windll.user32


@pytest.fixture(scope="module")
def tc():
    return detect(MSYS2_ROOT)


def _start(tmp_path, templates_dir, tc, profile, example=None):
    proj = create_project(tmp_path, "akis", profile, templates_dir, example=example)
    assert _build(proj, tc, templates_dir)[0].ok
    out = Output()
    job = RunJob(proj, tc, on_output=out, limits=Limits(timeout_s=60))
    job.start()
    return job, out


def _wait_window(job, timeout=15.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if hwnd := job.find_window():
            return hwnd
        time.sleep(0.1)
    raise AssertionError("pencere bulunamadı")


@pytest.mark.parametrize("profile", [Profile.LEGACY, Profile.MODERN])
def test_window_found_by_pid_and_captured_correctly(tmp_path, templates_dir, tc, profile):
    job, _ = _start(tmp_path, templates_dir, tc, profile)
    try:
        hwnd = _wait_window(job)
        pid = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        assert pid.value in job.process_ids()
        cap = WindowCapture(hwnd)
        time.sleep(0.3)
        frame = cap.grab()
        # DPI farkında olan (GLFW) ve olmayan (FreeGLUT) pencereler aynı mantıksal boyutta yakalanmalı
        assert (frame.width, frame.height) == (800, 600)
        px = frame.pixel(frame.width // 2, frame.height // 2)
        assert px != BACKGROUND
        assert all(abs(a - b) <= TOLERANCE for a, b in zip(px, REFERENCE[profile])), px
        cap.close()
    finally:
        job.stop()
        job.wait()


def test_minimized_window_is_unavailable_then_recovers(tmp_path, templates_dir, tc):
    job, _ = _start(tmp_path, templates_dir, tc, Profile.LEGACY)
    try:
        hwnd = _wait_window(job)
        cap = WindowCapture(hwnd)
        user32.ShowWindow(hwnd, 6)  # SW_MINIMIZE
        time.sleep(0.5)
        with pytest.raises(WindowUnavailable):
            cap.grab()
        user32.ShowWindow(hwnd, 9)  # SW_RESTORE
        time.sleep(0.5)
        assert cap.grab().width == 800
        cap.close()
    finally:
        job.stop()
        job.wait()


def test_no_window_for_finished_job(tmp_path, templates_dir, tc):
    proj = create_project(tmp_path, "bitti", Profile.LEGACY, templates_dir, example="donen-ucgen")  # test modlu
    assert _build(proj, tc, templates_dir)[0].ok
    job = RunJob(proj, tc, on_output=Output(), test_frames=3)
    job.run()
    assert job.find_window() is None


def test_input_reaches_interactive_example(tmp_path, templates_dir, tc):
    job, out = _start(tmp_path, templates_dir, tc, Profile.LEGACY, example="etkilesim")
    try:
        hwnd = _wait_window(job)
        time.sleep(0.3)
        apply_input(hwnd, {"type": "key", "key": "k"}, (800, 600))
        apply_input(hwnd, {"type": "click", "x": 123, "y": 456}, (800, 600))
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and not re.search(r"CLICK 123 456", out.text):
            time.sleep(0.1)
        assert "KEY k" in out.text
        assert "CLICK 123 456" in out.text
    finally:
        job.stop()
        job.wait()
