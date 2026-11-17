"""CMake configure/build. CMake betiği şablon dizinindedir (kullanıcı düzenleyemez, ADR-006);
proje dizini ve ayarlar yalnızca -D cache değişkenleriyle, argüman listesi olarak geçer (ADR-004)."""
import threading
from dataclasses import dataclass
from pathlib import Path

from .diagnostics import Diagnostic, parse_diagnostics
from .project import BuildSettings, Project
from .sandbox import Limits, OutputCallback, Result, SandboxedProcess, minimal_env
from .toolchain import Toolchain

# Derleyici çok sayıda alt süreç (cc1, as, ld, ninja) başlatır; bellek de bağlayıcı için daha yüksek tutulur.
BUILD_LIMITS = Limits(timeout_s=120, memory_mb=2048, max_processes=64, max_output_bytes=2_000_000)


def configure_command(project: Project, tc: Toolchain, settings: BuildSettings, templates_dir: Path) -> list[str]:
    source = Path(templates_dir) / project.profile.template_name
    return [
        str(tc.cmake),
        "-S", str(source),
        "-B", str(project.build_dir),
        "-GNinja",
        f"-DCMAKE_BUILD_TYPE={settings.config}",
        f"-DCMAKE_C_COMPILER={tc.gcc.as_posix()}",
        f"-DCMAKE_CXX_COMPILER={tc.gxx.as_posix()}",
        f"-DCMAKE_MAKE_PROGRAM={tc.ninja.as_posix()}",
        f"-DOGLIDE_PROJECT_DIR={project.dir.as_posix()}",
        f"-DOGLIDE_C_STD={settings.c_std}",
        f"-DOGLIDE_CXX_STD={settings.cxx_std}",
        f"-DOGLIDE_WARNINGS={settings.warnings}",
    ]


def build_command(project: Project, tc: Toolchain) -> list[str]:
    return [str(tc.cmake), "--build", str(project.build_dir)]


@dataclass(frozen=True)
class BuildResult:
    ok: bool
    stage: str  # configure | build
    result: Result
    diagnostics: list[Diagnostic]


class BuildJob:
    """configure + build; her adım kendi sandbox'ında, orta bütünlük seviyesinde (build/ dizinine yazar)."""

    def __init__(self, project: Project, tc: Toolchain, settings: BuildSettings, templates_dir: Path,
                 on_output: OutputCallback, limits: Limits = BUILD_LIMITS):
        self.project, self.tc, self.settings, self.templates_dir = project, tc, settings, Path(templates_dir)
        self.on_output, self.limits = on_output, limits
        self._lock = threading.Lock()
        self._current: SandboxedProcess | None = None
        self._stopped = False

    def stop(self) -> None:
        with self._lock:
            self._stopped = True
            if self._current:
                self._current.stop()

    def _step(self, argv: list[str], collected: list[str]) -> Result:
        def tee(stream: str, text: str) -> None:
            collected.append(text)
            self.on_output(stream, text)

        env = minimal_env(path_prefix=[self.tc.bin_dir], extra={"LC_ALL": "C", "LANG": "C"})
        proc = SandboxedProcess(argv, cwd=self.project.dir, env=env, limits=self.limits, on_output=tee)
        with self._lock:
            if self._stopped:
                return Result(exit_code=1, reason="killed", duration_ms=0, output_truncated=False)
            self._current = proc
            proc.start()
        try:
            return proc.wait()
        finally:
            with self._lock:
                self._current = None

    def run(self) -> BuildResult:
        self.project.build_dir.mkdir(exist_ok=True)
        collected: list[str] = []
        steps = (("configure", configure_command(self.project, self.tc, self.settings, self.templates_dir)),
                 ("build", build_command(self.project, self.tc)))
        for stage, argv in steps:
            result = self._step(argv, collected)
            if result.exit_code != 0 or result.reason != "exit":
                break
        diagnostics = parse_diagnostics("".join(collected), self.project.dir)
        ok = result.exit_code == 0 and result.reason == "exit"
        return BuildResult(ok=ok, stage=stage, result=result, diagnostics=diagnostics)
