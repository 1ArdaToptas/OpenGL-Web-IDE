"""Tarayıcıdan gelen girdiyi programın penceresine iletme. Yalnız doğrulanmış tuş/tıklama; başka mesaj yok."""
import ctypes
import math

WM_CHAR, WM_LBUTTONDOWN, WM_LBUTTONUP, MK_LBUTTON = 0x0102, 0x0201, 0x0202, 0x0001


def _post(hwnd: int, msg: int, wparam: int, lparam: int) -> None:
    ctypes.windll.user32.PostMessageW(hwnd, msg, wparam, lparam)


def _coord(value, limit: int) -> int:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise ValueError("Geçersiz koordinat")
    return max(0, min(limit - 1, int(value)))


def apply_input(hwnd: int, msg: object, size: tuple[int, int]) -> None:
    """msg: {"type":"key","key":"a"} veya {"type":"click","x":..,"y":..} (yakalanan kare koordinatlarında)."""
    if not isinstance(msg, dict):
        raise ValueError("Girdi bir nesne olmalı")
    if msg.get("type") == "key":
        key = msg.get("key")
        if not isinstance(key, str) or len(key) != 1 or not key.isprintable():
            raise ValueError("Tuş tek yazdırılabilir karakter olmalı")
        _post(hwnd, WM_CHAR, ord(key), 0)
    elif msg.get("type") == "click":
        x, y = _coord(msg.get("x"), size[0]), _coord(msg.get("y"), size[1])
        lparam = (y << 16) | x
        _post(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lparam)
        _post(hwnd, WM_LBUTTONUP, 0, lparam)
    else:
        raise ValueError("Bilinmeyen girdi türü")
