"""Workspace erişimi ve yol koruması (SR-04). Tüm kullanıcı yolları buradan geçer."""
import os
import re
import stat
from pathlib import Path

from engine.project import InvalidProjectError, Project, load_project, validate_project_name

USER_DIRS = ("src", "shaders")
ALLOWED_EXTENSIONS = {".c", ".cpp", ".h", ".hpp", ".vert", ".frag", ".geom", ".glsl", ".txt"}
MAX_DEPTH = 4  # src/a/b/c.c
_SEGMENT_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$", re.ASCII)
_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(10)), *(f"lpt{i}" for i in range(10))}


class PathRejected(ValueError):
    pass


class ProjectNotFound(PathRejected):
    pass


def _is_reparse_point(path: Path) -> bool:
    try:
        st = os.lstat(path)
    except FileNotFoundError:
        return False
    return bool(getattr(st, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT) or stat.S_ISLNK(st.st_mode)


def _check_segment(seg: str) -> None:
    if not _SEGMENT_RE.fullmatch(seg) or seg.endswith(".") or seg.split(".")[0].lower() in _RESERVED:
        raise PathRejected(f"Geçersiz yol bileşeni: {seg!r}")


def _split_relative(rel: str) -> list[str]:
    if not isinstance(rel, str) or not rel or len(rel) > 255 or "\\" in rel or ":" in rel:
        raise PathRejected(f"Geçersiz yol: {rel!r}")
    parts = rel.split("/")
    if len(parts) < 2 or len(parts) > MAX_DEPTH or parts[0] not in USER_DIRS:
        raise PathRejected(f"Yol src/ veya shaders/ altında olmalı: {rel!r}")
    for seg in parts:
        _check_segment(seg)
    if Path(parts[-1]).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise PathRejected(f"İzinli olmayan uzantı: {parts[-1]!r}")
    return parts


class Workspace:
    def __init__(self, root: Path):
        self.root = Path(root).resolve()

    def _ensure_inside(self, path: Path, base: Path) -> None:
        if not path.resolve().is_relative_to(base):
            raise PathRejected("Yol workspace dışına çıkıyor")
        current = self.root
        for part in path.relative_to(self.root).parts:
            current = current / part
            if _is_reparse_point(current):
                raise PathRejected("Sembolik bağlantı/junction kabul edilmez")

    def project_dir(self, name: str) -> Path:
        try:
            validate_project_name(name)
        except InvalidProjectError as e:
            raise PathRejected(str(e)) from e
        path = self.root / name
        self._ensure_inside(path, self.root)
        if not (path / "project.json").is_file():
            raise ProjectNotFound(f"Proje bulunamadı: {name}")
        return path

    def project(self, name: str) -> Project:
        try:
            return load_project(self.project_dir(name))
        except InvalidProjectError as e:
            raise PathRejected(str(e)) from e

    def file_path(self, name: str, rel: str) -> Path:
        project_dir = self.project_dir(name)
        path = project_dir.joinpath(*_split_relative(rel))
        self._ensure_inside(path, project_dir.resolve())
        return path

    def list_projects(self) -> list[Project]:
        result = []
        for entry in sorted(self.root.iterdir()):
            try:
                result.append(self.project(entry.name))
            except PathRejected:
                continue
        return result

    def tree(self, name: str) -> list[dict]:
        project_dir = self.project_dir(name)
        entries = []

        def walk(directory: Path, rel: str, depth: int) -> None:
            entries.append({"path": rel, "type": "dir"})
            for child in sorted(directory.iterdir()):
                child_rel = f"{rel}/{child.name}"
                if _is_reparse_point(child) or not _SEGMENT_RE.fullmatch(child.name):
                    continue
                if child.is_dir() and depth + 1 < MAX_DEPTH:
                    walk(child, child_rel, depth + 1)
                elif child.is_file() and child.suffix.lower() in ALLOWED_EXTENSIONS:
                    entries.append({"path": child_rel, "type": "file", "size": child.stat().st_size})

        for sub in USER_DIRS:
            d = project_dir / sub
            if d.is_dir() and not _is_reparse_point(d):
                walk(d, sub, 1)
        return entries
