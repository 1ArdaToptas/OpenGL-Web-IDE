"""Backend olmadan motor kullanımı: python -m engine new|build|run|doctor"""
import argparse
import os
import sys
from pathlib import Path

from .build import BuildJob
from .project import BuildSettings, InvalidProjectError, Profile, ProjectExistsError, create_project, load_project
from .run import NotBuiltError, RunJob
from .sandbox import Limits
from .toolchain import ToolchainError, detect

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
DEFAULT_MSYS2 = Path(os.environ.get("OGLIDE_MSYS2_ROOT", r"C:\msys64"))
DEFAULT_WORKSPACE = Path(os.environ.get("USERPROFILE", Path.home())) / "OpenGLWebIDE" / "workspace"


def _echo(stream: str, text: str) -> None:
    out = sys.stdout if stream == "stdout" else sys.stderr
    out.write(text)
    out.flush()


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m engine")
    sub = p.add_subparsers(dest="cmd", required=True)

    new = sub.add_parser("new", help="şablondan proje oluştur")
    new.add_argument("name")
    new.add_argument("--profile", choices=[x.value for x in Profile], required=True)
    new.add_argument("--workspace", type=Path, default=DEFAULT_WORKSPACE)

    for name in ("build", "run", "doctor"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--msys2", type=Path, default=DEFAULT_MSYS2)
        if name != "doctor":
            cmd.add_argument("project", type=Path)
        if name == "build":
            cmd.add_argument("--config", default="Debug")
            cmd.add_argument("--c-std", default="17")
            cmd.add_argument("--cxx-std", default="17")
            cmd.add_argument("--warnings", default="extra")
        if name == "run":
            cmd.add_argument("--frames", type=int, help="N kare çizip çık (test modu)")
            cmd.add_argument("--timeout", type=float, default=300.0)
    return p


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.cmd == "new":
            proj = create_project(args.workspace, args.name, Profile(args.profile), TEMPLATES_DIR)
            print(f"Oluşturuldu: {proj.dir} ({proj.profile.value})")
            return 0

        tc = detect(args.msys2)
        if args.cmd == "doctor":
            for tool, version in tc.versions.items():
                print(f"{tool:6} {version}")
            return 0

        proj = load_project(args.project)
        if args.cmd == "build":
            settings = BuildSettings(config=args.config, c_std=args.c_std, cxx_std=args.cxx_std,
                                     warnings=args.warnings)
            res = BuildJob(proj, tc, settings, TEMPLATES_DIR, on_output=_echo).run()
            for d in res.diagnostics:
                location = f"{d.file}:{d.line}:{d.col}: " if d.file else ""
                print(f"{location}{d.severity}: {d.message}", file=sys.stderr)
            print(f"[build] {'başarılı' if res.ok else 'başarısız'} ({res.stage}, {res.result.duration_ms} ms)")
            return 0 if res.ok else 1

        limits = Limits(timeout_s=args.timeout, memory_mb=1024, max_processes=4)
        r = RunJob(proj, tc, on_output=_echo, limits=limits, test_frames=args.frames).run()
        print(f"[run] exit={r.exit_code} reason={r.reason} {r.duration_ms} ms")
        return 0 if (r.exit_code, r.reason) == (0, "exit") else 1

    except ToolchainError as e:
        print(e, file=sys.stderr)
        return 1
    except (InvalidProjectError, ProjectExistsError, NotBuiltError, ValueError) as e:
        print(e, file=sys.stderr)
        return 2
