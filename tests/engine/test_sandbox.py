import ctypes
import os
import re
import sys
import threading
import time

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows Job Object gerekir")

from engine.sandbox import Limits, SandboxedProcess, minimal_env  # noqa: E402


class Collector:
    def __init__(self):
        self.chunks = {"stdout": [], "stderr": []}
        self.lock = threading.Lock()

    def __call__(self, stream, text):
        with self.lock:
            self.chunks[stream].append(text)

    def text(self, stream="stdout"):
        with self.lock:
            return "".join(self.chunks[stream])

    def wait_for(self, pattern, timeout=10):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if m := re.search(pattern, self.text()):
                return m
            time.sleep(0.05)
        raise AssertionError(f"{pattern!r} gelmedi; çıktı: {self.text()!r}")


def run_py(python_exe, code, cwd, limits=Limits(), low_integrity=False, args=()):
    out = Collector()
    p = SandboxedProcess([python_exe, "-c", code, *args], cwd=cwd, env=minimal_env(), limits=limits,
                         on_output=out, low_integrity=low_integrity)
    p.start()
    return p, out


def _process_alive(pid):
    k32 = ctypes.WinDLL("kernel32")
    k32.OpenProcess.restype = ctypes.c_void_p
    h = k32.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE
    if not h:
        return False
    try:
        return k32.WaitForSingleObject(ctypes.c_void_p(h), 3000) != 0
    finally:
        k32.CloseHandle(ctypes.c_void_p(h))


def test_captures_stdout_and_stderr_separately(python_exe, tmp_path):
    p, out = run_py(python_exe, "import sys; print('merhaba'); sys.stderr.write('hata\\n')", tmp_path)
    r = p.wait()
    assert (r.exit_code, r.reason) == (0, "exit")
    assert out.text("stdout").strip() == "merhaba"
    assert out.text("stderr").strip() == "hata"


def test_utf8_output_is_decoded(python_exe, tmp_path):
    p, out = run_py(python_exe, "import sys; sys.stdout.buffer.write('çğüşöı\\n'.encode())", tmp_path)
    p.wait()
    assert out.text().strip() == "çğüşöı"


def test_exit_code_is_propagated(python_exe, tmp_path):
    p, _ = run_py(python_exe, "raise SystemExit(3)", tmp_path)
    assert p.wait().exit_code == 3


def test_arguments_are_not_interpreted_by_a_shell(python_exe, tmp_path):
    p, out = run_py(python_exe, "import sys; print(sys.argv[1])", tmp_path, args=("a & echo HACK | x",))
    p.wait()
    assert out.text().strip() == "a & echo HACK | x"


def test_timeout_kills_process(python_exe, tmp_path):
    p, _ = run_py(python_exe, "import time; time.sleep(30)", tmp_path, limits=Limits(timeout_s=1))
    r = p.wait()
    assert r.reason == "timeout"
    assert r.exit_code != 0
    assert r.duration_ms < 5000


def test_stop_kills_whole_process_tree(python_exe, tmp_path):
    code = ("import subprocess, sys, time;"
            "c = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)']);"
            "print('CHILD', c.pid, flush=True); time.sleep(60)")
    p, out = run_py(python_exe, code, tmp_path)
    grandchild = int(out.wait_for(r"CHILD (\d+)").group(1))
    threading.Timer(0.2, p.stop).start()
    r = p.wait()
    assert r.reason == "killed"
    assert not _process_alive(grandchild)


def test_exit_of_main_process_kills_leftover_children(python_exe, tmp_path):
    code = ("import subprocess, sys;"
            "c = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)']);"
            "print('CHILD', c.pid, flush=True)")
    p, out = run_py(python_exe, code, tmp_path)
    r = p.wait()
    assert r.reason == "exit"
    assert not _process_alive(int(out.wait_for(r"CHILD (\d+)").group(1)))


def test_process_limit_blocks_extra_processes(python_exe, tmp_path):
    code = ("import subprocess, sys\n"
            "try:\n    subprocess.run([sys.executable, '-c', 'pass']); print('SPAWNED')\n"
            "except OSError:\n    print('BLOCKED')")
    p, out = run_py(python_exe, code, tmp_path, limits=Limits(max_processes=1))
    p.wait()
    assert out.text().strip() == "BLOCKED"


def test_memory_limit_is_enforced(python_exe, tmp_path):
    code = "b = bytearray(512 * 1024 * 1024); print('ALLOCATED')"
    p, out = run_py(python_exe, code, tmp_path, limits=Limits(memory_mb=128))
    r = p.wait()
    assert r.exit_code != 0
    assert "ALLOCATED" not in out.text()
    assert (r.reason, r.limit) == ("limit", "memory")


def test_handled_process_limit_is_reported_without_changing_reason(python_exe, tmp_path):
    code = ("import subprocess, sys\n"
            "try:\n    subprocess.run([sys.executable, '-c', 'pass'])\n"
            "except OSError:\n    pass")
    p, _ = run_py(python_exe, code, tmp_path, limits=Limits(max_processes=1))
    r = p.wait()
    assert (r.exit_code, r.reason, r.limit) == (0, "exit", "processes")


def test_normal_exit_has_no_limit(python_exe, tmp_path):
    p, _ = run_py(python_exe, "pass", tmp_path)
    assert p.wait().limit is None


def test_low_integrity_process_can_use_temp_files(python_exe, tmp_path):
    code = "import tempfile\nwith tempfile.TemporaryFile() as f: f.write(b'x')\nprint('TMPOK')"
    p, out = run_py(python_exe, code, tmp_path, low_integrity=True)
    p.wait()
    assert out.text().strip() == "TMPOK"


def test_output_limit_truncates_but_process_finishes(python_exe, tmp_path):
    code = "import sys\nfor i in range(20000): print('x' * 50)\nprint('SON')"
    p, out = run_py(python_exe, code, tmp_path, limits=Limits(max_output_bytes=10_000))
    r = p.wait()
    assert (r.exit_code, r.reason) == (0, "exit")
    assert r.output_truncated
    assert len(out.text().encode()) <= 10_000


def test_default_integrity_is_medium(python_exe, tmp_path):
    p, _ = run_py(python_exe, "pass", tmp_path)
    assert p.integrity_level == "medium"
    p.wait()


def test_low_integrity_process_cannot_write_to_user_dirs(python_exe, tmp_path):
    code = ("import sys\ntry:\n    open(sys.argv[1], 'w').write('x'); print('WROTE')\n"
            "except PermissionError:\n    print('DENIED')")
    target = tmp_path / "yazma.txt"
    p, out = run_py(python_exe, code, tmp_path, low_integrity=True, args=(str(target),))
    assert p.integrity_level == "low"
    p.wait()
    assert out.text().strip() == "DENIED"
    assert not target.exists()


def test_minimal_env_drops_unrelated_variables(monkeypatch, tmp_path):
    monkeypatch.setenv("OGLIDE_SECRET_TOKEN", "gizli")
    env = minimal_env(path_prefix=[tmp_path], extra={"OGLIDE_TEST_FRAMES": "5"})
    assert "OGLIDE_SECRET_TOKEN" not in env
    assert env["OGLIDE_TEST_FRAMES"] == "5"
    assert env["PATH"].split(os.pathsep)[0] == str(tmp_path)
    assert "SYSTEMROOT" in {k.upper() for k in env}
