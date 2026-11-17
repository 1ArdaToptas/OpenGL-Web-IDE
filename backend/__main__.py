"""Servisi başlat: python -m backend [--port 8765] [--workspace DIR] [--msys2 DIR] [--dev-origin URL]"""
import argparse
import os
import sys
import threading
import webbrowser
from pathlib import Path
from urllib.parse import urlsplit

import uvicorn

from . import logging_setup, security
from .app import create_app
from .config import REPO_ROOT, Settings

FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"


def serve(app, settings: Settings) -> None:
    config = uvicorn.Config(app, host=settings.host, port=settings.port, log_level="info", server_header=False)
    logging_setup.install(settings.token, os.environ.get("USERPROFILE", str(Path.home())))
    uvicorn.Server(config).run()


def open_browser_later(url: str, delay_s: float = 1.5) -> None:
    """Sunucu dinlemeye başladıktan sonra varsayılan tarayıcıyı açar (token yalnızca fragment'ta)."""
    timer = threading.Timer(delay_s, webbrowser.open, args=(url,))
    timer.daemon = True
    timer.start()


def _loopback_origin(value: str) -> str:
    parts = urlsplit(value)
    if parts.scheme != "http" or parts.hostname not in ("127.0.0.1", "localhost") or parts.path not in ("", "/"):
        raise argparse.ArgumentTypeError(f"Yalnızca http://127.0.0.1:<port> veya http://localhost:<port>: {value}")
    return value.rstrip("/")


def main(argv: list[str] | None = None) -> int:
    defaults = Settings(token="x" * 32)
    p = argparse.ArgumentParser(prog="python -m backend")
    p.add_argument("--port", type=int, default=defaults.port)
    p.add_argument("--workspace", type=Path, default=defaults.workspace_root)
    p.add_argument("--msys2", type=Path, default=defaults.msys2_root)
    p.add_argument("--dev-origin", type=_loopback_origin, action="append", default=[],
                   help="Vite dev sunucusu origin'i (örn. http://127.0.0.1:5173)")
    p.add_argument("--open", action="store_true", help="hazır olunca arayüzü varsayılan tarayıcıda aç")
    args = p.parse_args(argv)

    try:
        security.ensure_not_admin()
    except security.RunningAsAdminError as e:
        print(e, file=sys.stderr)
        return 1

    dist = FRONTEND_DIST if (FRONTEND_DIST / "index.html").is_file() else None
    if dist is None:
        print("Uyarı: arayüz derlenmemiş (frontend klasöründe `npm run build`); yalnızca API ve --dev-origin çalışır.",
              file=sys.stderr)
    settings = Settings(token=security.generate_token(), workspace_root=args.workspace, msys2_root=args.msys2,
                        port=args.port, extra_origins=tuple(args.dev_origin), frontend_dist=dist)
    app = create_app(settings)
    # Token URL fragment'ında: sunucuya ve erişim loglarına gitmez (ADR-008).
    url = f"http://127.0.0.1:{settings.port}/#token={settings.token}"
    print(f"OpenGL Web IDE: {url}", flush=True)
    if args.open:
        open_browser_later(url)
    for origin in args.dev_origin:
        print(f"Geliştirme arayüzü: {origin}/#token={settings.token}", flush=True)
    serve(app, settings)
    return 0


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
