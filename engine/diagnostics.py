"""GCC ve GNU ld çıktısından editör işaretleri. Derleme ortamı LC_ALL=C ile çalıştırılır (mesajlar İngilizce)."""
import re
from dataclasses import dataclass
from pathlib import Path

_COMPILER = re.compile(
    r"^(?P<file>.+?):(?P<line>\d+):(?:(?P<col>\d+):)? (?P<sev>fatal error|error|warning|note): (?P<msg>.*)$")
_UNDEFINED_REF = re.compile(r"^(?P<file>.+?):(?P<line>\d+):\(.*?\): (?P<msg>undefined reference to .*)$")
_LINKER_SUMMARY = re.compile(r"^(?:collect2(?:\.exe)?|.*\bld(?:\.exe)?): error: (?P<msg>.*)$")


@dataclass(frozen=True)
class Diagnostic:
    file: str  # proje içindeyse projeye göreli, değilse mutlak; konumsuzsa ""
    line: int
    col: int
    severity: str  # error | warning | note
    message: str


def _display_path(raw: str, project_dir: Path) -> str:
    path = raw.replace("\\", "/")
    root = project_dir.as_posix().rstrip("/") + "/"
    return path[len(root):] if path.lower().startswith(root.lower()) else path


def parse_diagnostics(output: str, project_dir: Path) -> list[Diagnostic]:
    result = []
    for line in output.splitlines():
        line = line.rstrip("\r")
        if m := _COMPILER.match(line):
            sev = "error" if m["sev"] == "fatal error" else m["sev"]
            result.append(Diagnostic(_display_path(m["file"], project_dir), int(m["line"]), int(m["col"] or 0),
                                     sev, m["msg"]))
        elif m := _UNDEFINED_REF.match(line):
            result.append(Diagnostic(_display_path(m["file"], project_dir), int(m["line"]), 0, "error", m["msg"]))
        elif m := _LINKER_SUMMARY.match(line):
            result.append(Diagnostic("", 0, 0, "error", m["msg"]))
    return result
