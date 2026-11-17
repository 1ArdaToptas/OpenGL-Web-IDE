"""MSYS2 UCRT64 toolchain tespiti. PATH'e güvenilmez; yalnızca yapılandırılmış kökten tam yollar kullanılır."""
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

TOOLS = ("gcc", "g++", "cmake", "ninja")
LIBRARY_HEADERS = {"freeglut": "GL/freeglut.h", "glfw": "GLFW/glfw3.h"}


class ToolchainError(RuntimeError):
    def __init__(self, missing: list[str], root: Path):
        self.missing = missing
        super().__init__(f"Toolchain eksik ({root}): {', '.join(missing)}")


@dataclass(frozen=True)
class Toolchain:
    root: Path
    bin_dir: Path
    gcc: Path
    gxx: Path
    cmake: Path
    ninja: Path
    versions: dict[str, str] = field(default_factory=dict)


def _version(exe: Path) -> str:
    out = subprocess.run([str(exe), "--version"], capture_output=True, text=True, timeout=15, check=True)
    return out.stdout.splitlines()[0].strip() if out.stdout else ""


def detect(msys2_root: Path, check_versions: bool = True) -> Toolchain:
    msys2_root = Path(msys2_root)
    bin_dir = msys2_root / "ucrt64" / "bin"
    include_dir = msys2_root / "ucrt64" / "include"

    missing = [t for t in TOOLS if not (bin_dir / f"{t}.exe").is_file()]
    missing += [lib for lib, header in LIBRARY_HEADERS.items() if not (include_dir / header).is_file()]
    if missing:
        raise ToolchainError(missing, msys2_root)

    paths = {t: bin_dir / f"{t}.exe" for t in TOOLS}
    versions = {t: _version(p) for t, p in paths.items()} if check_versions else {}
    return Toolchain(root=msys2_root, bin_dir=bin_dir, gcc=paths["gcc"], gxx=paths["g++"],
                     cmake=paths["cmake"], ninja=paths["ninja"], versions=versions)
