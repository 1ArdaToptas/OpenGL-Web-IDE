import os
from dataclasses import dataclass, field
from pathlib import Path

from engine.run import RUN_LIMITS
from engine.sandbox import Limits

REPO_ROOT = Path(__file__).resolve().parent.parent
LOOPBACK_HOST = "127.0.0.1"


@dataclass(frozen=True)
class Settings:
    token: str
    workspace_root: Path = Path(os.environ.get("USERPROFILE", Path.home())) / "OpenGLWebIDE" / "workspace"
    templates_dir: Path = REPO_ROOT / "templates"
    msys2_root: Path = Path(os.environ.get("OGLIDE_MSYS2_ROOT", r"C:\msys64"))
    host: str = LOOPBACK_HOST
    port: int = 8765
    extra_origins: tuple[str, ...] = ()  # örn. Vite dev sunucusu: http://127.0.0.1:5173
    allowed_hosts: frozenset[str] = frozenset({"127.0.0.1", "localhost"})
    run_limits: Limits = RUN_LIMITS
    max_file_bytes: int = 1_000_000
    max_request_bytes: int = 4_000_000  # JSON kaçışlarıyla 1 MB dosya için pay
    max_active_jobs: int = 4
    frontend_dist: Path | None = None
    origins: tuple[str, ...] = field(init=False)

    def __post_init__(self):
        if self.host != LOOPBACK_HOST:
            raise ValueError(f"Servis yalnızca {LOOPBACK_HOST} adresine bağlanabilir (SR-01)")
        if len(self.token) < 32:
            raise ValueError("Token en az 32 karakter olmalı")
        object.__setattr__(self, "origins", (f"http://127.0.0.1:{self.port}", f"http://localhost:{self.port}",
                                             *self.extra_origins))
