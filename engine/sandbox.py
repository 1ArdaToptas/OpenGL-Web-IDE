"""Sınırlandırılmış süreç çalıştırma (SR-05, SR-07, SR-08, SR-09).

Her süreç kendi Job Object'inde başlar: bellek ve süreç sayısı limiti, KILL_ON_JOB_CLOSE.
Ana süreç bitince job'daki kalan süreçler de sonlandırılır. Shell kullanılmaz.
"""
import codecs
import ctypes
import ctypes.wintypes as wt
import os
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

from . import _win32 as w

OutputCallback = Callable[[str, str], None]  # (stream: "stdout" | "stderr", text)
KILLED_EXIT_CODE = 1
_ENV_KEEP = ("SYSTEMROOT", "WINDIR", "SYSTEMDRIVE", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA",
             "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS", "PATHEXT")


@dataclass(frozen=True)
class Limits:
    timeout_s: float = 60.0
    memory_mb: int = 512
    max_processes: int = 4
    max_output_bytes: int = 1_000_000


@dataclass(frozen=True)
class Result:
    exit_code: int
    reason: str  # exit | timeout | killed | limit (sıfır dışı çıkış + job limiti ihlali)
    duration_ms: int
    output_truncated: bool
    limit: str | None = None  # ihlal edilen job limiti: memory | processes


def minimal_env(path_prefix: Iterable[Path] = (), extra: dict[str, str] | None = None) -> dict[str, str]:
    """Üst süreç ortamından yalnızca sistemin gerektirdiği değişkenler (token vb. sızmaz)."""
    upper = {k.upper(): v for k, v in os.environ.items()}
    env = {k: upper[k] for k in _ENV_KEEP if k in upper}
    system_root = env.get("SYSTEMROOT", r"C:\Windows")
    env["PATH"] = os.pathsep.join([*(str(p) for p in path_prefix), os.path.join(system_root, "System32"),
                                   system_root])
    env.update(extra or {})
    return env


def low_integrity_temp_dir() -> Path:
    """LocalLow düşük bütünlük etiketini devralır; Low IL süreçlerin yazabildiği geçici dizin."""
    base = Path(os.environ.get("USERPROFILE", Path.home())) / "AppData" / "LocalLow" / "OpenGLWebIDE" / "tmp"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _env_block(env: dict[str, str]):
    items = sorted(env.items(), key=lambda kv: kv[0].upper())
    return ctypes.create_unicode_buffer("".join(f"{k}={v}\0" for k, v in items) + "\0")


class SandboxedProcess:
    def __init__(self, argv: list[str], cwd: Path, env: dict[str, str], limits: Limits,
                 on_output: OutputCallback, low_integrity: bool = False):
        if not argv or not Path(argv[0]).is_absolute():
            raise ValueError("argv[0] mutlak bir çalıştırılabilir yolu olmalı")
        self.argv, self.cwd, self.env, self.limits = list(argv), Path(cwd), env, limits
        self.on_output, self.low_integrity = on_output, low_integrity
        self.pid: int | None = None
        self.integrity_level: str | None = None
        self._lock = threading.Lock()
        self._reason: str | None = None
        self._finished = False
        self._output_bytes = 0
        self._truncated = False
        self._readers: list[threading.Thread] = []

    def start(self) -> None:
        env = dict(self.env)
        if self.low_integrity:
            env["TEMP"] = env["TMP"] = str(low_integrity_temp_dir())
        self._job = w.create_job(self.limits.memory_mb, self.limits.max_processes)
        self._port = w.attach_completion_port(self._job)
        token = w.create_primary_token(self.low_integrity)
        out_r, out_w = w.create_pipe()
        err_r, err_w = w.create_pipe()
        try:
            pi = w.create_suspended_process(token, self.argv[0], subprocess.list2cmdline(self.argv),
                                            _env_block(env), str(self.cwd), out_w, err_w)
        except OSError:
            for h in (out_r, err_r, self._job, self._port):
                w.k32.CloseHandle(h)
            raise
        finally:
            for h in (out_w, err_w, token):
                w.k32.CloseHandle(h)
        self._process, self.pid = pi.hProcess, pi.dwProcessId
        try:
            w.check(w.k32.AssignProcessToJobObject(self._job, pi.hProcess), "AssignProcessToJobObject")
            self.integrity_level = w.process_integrity(pi.hProcess)
        except OSError:
            w.k32.TerminateProcess(pi.hProcess, KILLED_EXIT_CODE)
            for h in (pi.hProcess, pi.hThread, out_r, err_r, self._job, self._port):
                w.k32.CloseHandle(h)
            raise
        self._started_at = time.monotonic()
        for handle, stream in ((out_r, "stdout"), (err_r, "stderr")):
            t = threading.Thread(target=self._pump, args=(handle, stream), daemon=True)
            t.start()
            self._readers.append(t)
        w.k32.ResumeThread(pi.hThread)
        w.k32.CloseHandle(pi.hThread)

    def _pump(self, handle, stream: str) -> None:
        decoder = codecs.getincrementaldecoder("utf-8")("replace")
        buf, n = ctypes.create_string_buffer(8192), wt.DWORD()
        try:
            while w.k32.ReadFile(handle, buf, 8192, ctypes.byref(n), None) and n.value:
                data = buf.raw[:n.value]
                with self._lock:
                    room = self.limits.max_output_bytes - self._output_bytes
                    if len(data) > room:
                        data, self._truncated = data[:max(room, 0)], True
                    self._output_bytes += len(data)
                if data and (text := decoder.decode(data)):
                    self.on_output(stream, text)
        finally:
            w.k32.CloseHandle(handle)

    def _terminate(self, reason: str) -> None:
        with self._lock:
            if self._finished:
                return
            self._reason = self._reason or reason
            w.k32.TerminateJobObject(self._job, KILLED_EXIT_CODE)

    def stop(self) -> None:
        self._terminate("killed")

    def process_ids(self) -> set[int]:
        """Job'daki yaşayan süreçler (ana süreç + alt süreçleri); iş bittiyse boş."""
        with self._lock:
            if self._finished or not hasattr(self, "_job"):
                return set()
            return w.job_process_ids(self._job)

    def wait(self) -> Result:
        timeout_ms = int(self.limits.timeout_s * 1000)
        if w.k32.WaitForSingleObject(self._process, timeout_ms) == w.WAIT_TIMEOUT:
            self._terminate("timeout")
            w.k32.WaitForSingleObject(self._process, w.INFINITE)
        duration_ms = int((time.monotonic() - self._started_at) * 1000)

        with self._lock:
            self._finished = True
            w.k32.TerminateJobObject(self._job, KILLED_EXIT_CODE)  # ana süreçten kalan alt süreçler
        for t in self._readers:
            t.join(5)

        code = wt.DWORD()
        w.k32.GetExitCodeProcess(self._process, ctypes.byref(code))
        violations = w.drain_limit_violations(self._port)
        limit = "memory" if "memory" in violations else ("processes" if violations else None)
        for h in (self._process, self._job, self._port):
            w.k32.CloseHandle(h)
        reason = self._reason or ("limit" if limit and code.value != 0 else "exit")
        return Result(exit_code=code.value, reason=reason, duration_ms=duration_ms,
                      output_truncated=self._truncated, limit=limit)
