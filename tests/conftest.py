import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATES_DIR = REPO_ROOT / "templates"
MSYS2_ROOT = Path(os.environ.get("OGLIDE_MSYS2_ROOT", r"C:\msys64"))
# venv'deki python.exe gerçek yorumlayıcıyı alt süreç olarak başlatan bir yönlendiricidir;
# süreç sayısı sınırlı testlerde tek süreç olması için temel yorumlayıcı kullanılır.
PYTHON = getattr(sys, "_base_executable", sys.executable)


def _toolchain_present() -> bool:
    return (MSYS2_ROOT / "ucrt64" / "bin" / "gcc.exe").is_file()


def pytest_collection_modifyitems(config, items):
    if _toolchain_present():
        return
    skip = pytest.mark.skip(reason=f"MSYS2 toolchain bulunamadı: {MSYS2_ROOT}")
    for item in items:
        if "native" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def templates_dir() -> Path:
    return TEMPLATES_DIR


@pytest.fixture
def msys2_root() -> Path:
    return MSYS2_ROOT


@pytest.fixture
def python_exe() -> str:
    return PYTHON
