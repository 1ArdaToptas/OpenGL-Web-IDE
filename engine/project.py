"""Proje modeli: profil, derleme ayarları (beyaz liste, ADR-005) ve şablondan proje oluşturma."""
import json
import re
import shutil
from dataclasses import dataclass, fields
from enum import Enum
from pathlib import Path

_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(10)), *(f"lpt{i}" for i in range(10))}
# Şablondan kullanıcı projesine kopyalanan dizinler; CMakeLists.txt ve third_party asla kopyalanmaz (ADR-006).
_USER_DIRS = ("src", "shaders")
_EXAMPLE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
DEFAULT_EXAMPLE = "baslangic"


class InvalidProjectError(ValueError):
    pass


class ProjectExistsError(FileExistsError):
    pass


class Profile(str, Enum):
    LEGACY = "legacy"
    MODERN = "modern"

    @property
    def template_name(self) -> str:
        return {"legacy": "legacy-freeglut", "modern": "modern-glfw"}[self.value]


_ALLOWED = {
    "config": ("Debug", "Release"),
    "c_std": ("11", "17"),
    "cxx_std": ("17", "20"),
    "warnings": ("default", "all", "extra"),
}


@dataclass(frozen=True)
class BuildSettings:
    config: str = "Debug"
    c_std: str = "17"
    cxx_std: str = "17"
    warnings: str = "extra"

    def __post_init__(self):
        for f in fields(self):
            value = getattr(self, f.name)
            if value not in _ALLOWED[f.name]:
                raise ValueError(f"Geçersiz {f.name}: {value!r} (izinli: {', '.join(_ALLOWED[f.name])})")

    @classmethod
    def from_dict(cls, data: dict) -> "BuildSettings":
        unknown = set(data) - set(_ALLOWED)
        if unknown:
            raise ValueError(f"Bilinmeyen derleme ayarı: {', '.join(sorted(unknown))}")
        return cls(**{k: str(v) for k, v in data.items()})


@dataclass(frozen=True)
class Project:
    dir: Path
    profile: Profile

    @property
    def name(self) -> str:
        return self.dir.name

    @property
    def build_dir(self) -> Path:
        return self.dir / "build"

    @property
    def executable(self) -> Path:
        return self.build_dir / "app.exe"


def validate_project_name(name: str) -> str:
    if not _NAME_RE.fullmatch(name) or name.lower() in _RESERVED:
        raise InvalidProjectError(f"Geçersiz proje adı: {name!r}")
    return name


@dataclass(frozen=True)
class Example:
    id: str
    profile: Profile
    title: str
    description: str
    kind: str  # statik | animasyon
    source: Path


def _profile_examples(templates_dir: Path, profile: Profile) -> list[Example]:
    """Şablon kökü varsayılan örnektir (`baslangic`); ek örnekler `examples/<id>/` altında."""
    root = Path(templates_dir) / profile.template_name
    dirs = [(DEFAULT_EXAMPLE, root)]
    if (root / "examples").is_dir():
        dirs += [(d.name, d) for d in sorted((root / "examples").iterdir()) if _EXAMPLE_RE.fullmatch(d.name)]
    result = []
    for example_id, d in dirs:
        meta = json.loads((d / "example.json").read_text("utf-8"))
        result.append(Example(example_id, profile, meta["title"], meta["description"], meta["kind"], d))
    return result


def list_examples(templates_dir: Path) -> list[Example]:
    return [e for p in Profile for e in _profile_examples(templates_dir, p)]


def create_project(workspace: Path, name: str, profile: Profile, templates_dir: Path,
                   example: str | None = None) -> Project:
    validate_project_name(name)
    example = example or DEFAULT_EXAMPLE
    source = next((e.source for e in _profile_examples(templates_dir, profile) if e.id == example), None)
    if source is None:
        raise InvalidProjectError(f"Bu profilde böyle bir örnek yok: {example!r}")
    target = Path(workspace) / name
    if target.exists():
        raise ProjectExistsError(f"Proje zaten var: {name}")

    target.mkdir(parents=True)
    for sub in _USER_DIRS:
        if (source / sub).is_dir():
            shutil.copytree(source / sub, target / sub)
    (target / "project.json").write_text(json.dumps({"profile": profile.value, "version": 1}, indent=2), "utf-8")
    return Project(dir=target, profile=profile)


def load_project(project_dir: Path) -> Project:
    project_dir = Path(project_dir)
    try:
        meta = json.loads((project_dir / "project.json").read_text("utf-8"))
        profile = Profile(meta["profile"])
    except (OSError, ValueError, KeyError, TypeError) as e:
        raise InvalidProjectError(f"Proje okunamadı: {project_dir.name}: {e}") from e
    return Project(dir=project_dir, profile=profile)
