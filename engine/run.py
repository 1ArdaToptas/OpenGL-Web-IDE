"""Derlenmiş programı düşük bütünlük seviyesinde (ADR-012) ve Job Object limitleriyle çalıştırma."""
import threading

from .project import Project
from .sandbox import KILLED_EXIT_CODE, Limits, OutputCallback, Result, SandboxedProcess, minimal_env
from .toolchain import Toolchain

RUN_LIMITS = Limits(timeout_s=300, memory_mb=1024, max_processes=4, max_output_bytes=1_000_000)


class NotBuiltError(FileNotFoundError):
    pass


class RunJob:
    def __init__(self, project: Project, tc: Toolchain, on_output: OutputCallback, limits: Limits = RUN_LIMITS,
                 test_frames: int | None = None, low_integrity: bool = True):
        self.project, self.tc, self.on_output, self.limits = project, tc, on_output, limits
        self.test_frames, self.low_integrity = test_frames, low_integrity
        self._proc: SandboxedProcess | None = None
        self._lock = threading.Lock()
        self._stopped = False

    @property
    def integrity_level(self) -> str | None:
        return self._proc.integrity_level if self._proc else None

    def start(self) -> None:
        exe = self.project.executable
        if not exe.is_file():
            raise NotBuiltError(f"Önce derleyin: {self.project.name}")
        extra = {"OGLIDE_TEST_FRAMES": str(self.test_frames)} if self.test_frames else {}
        # DLL'ler yalnızca bu sürecin PATH'inden bulunur (ADR-011); çalışma dizini proje köküdür.
        env = minimal_env(path_prefix=[self.tc.bin_dir], extra=extra)
        with self._lock:
            if self._stopped:
                return
            self._proc = SandboxedProcess([str(exe)], cwd=self.project.dir, env=env, limits=self.limits,
                                          on_output=self.on_output, low_integrity=self.low_integrity)
            self._proc.start()

    def wait(self) -> Result:
        if self._proc is None:  # start() öncesinde durduruldu
            return Result(exit_code=KILLED_EXIT_CODE, reason="killed", duration_ms=0, output_truncated=False)
        return self._proc.wait()

    def run(self) -> Result:
        self.start()
        return self.wait()

    def process_ids(self) -> set[int]:
        return self._proc.process_ids() if self._proc else set()

    def find_window(self) -> int | None:
        """Programın ana penceresi (başlığa göre değil, iş süreçlerinin PID'ine göre)."""
        from .stream.window import find_process_window  # yalnız Windows; içe aktarma gecikmeli
        pids = self.process_ids()
        return find_process_window(pids) if pids else None

    def stop(self) -> None:
        with self._lock:
            self._stopped = True
            if self._proc:
                self._proc.stop()
