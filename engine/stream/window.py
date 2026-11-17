"""Pencere bulma (PID ile) ve yakalama (PrintWindow + PW_RENDERFULLCONTENT). Ölçümler: docs/research/WEBRTC.md.

DPI: GLFW pencereleri DPI-farkında, FreeGLUT değil. Yakalayan iş parçacığı hedef pencerenin DPI bağlamına
geçmezse boyutlar sanallaşır ve yanlış bölge yakalanır; bu yüzden her yakalamada bağlam eşitlenir.
"""
import ctypes
import ctypes.wintypes as wt
from dataclasses import dataclass

user32 = ctypes.WinDLL("user32", use_last_error=True)
gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)

PW_CLIENTONLY, PW_RENDERFULLCONTENT = 0x1, 0x2
GW_OWNER = 4

_ENUM_PROC = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [("biSize", wt.DWORD), ("biWidth", wt.LONG), ("biHeight", wt.LONG), ("biPlanes", wt.WORD),
                ("biBitCount", wt.WORD), ("biCompression", wt.DWORD), ("biSizeImage", wt.DWORD),
                ("biXPelsPerMeter", wt.LONG), ("biYPelsPerMeter", wt.LONG), ("biClrUsed", wt.DWORD),
                ("biClrImportant", wt.DWORD)]


def _sig(fn, restype, *argtypes):
    fn.restype, fn.argtypes = restype, list(argtypes)


_sig(user32.EnumWindows, wt.BOOL, _ENUM_PROC, wt.LPARAM)
_sig(user32.GetWindowThreadProcessId, wt.DWORD, wt.HWND, ctypes.POINTER(wt.DWORD))
_sig(user32.IsWindowVisible, wt.BOOL, wt.HWND)
_sig(user32.IsWindow, wt.BOOL, wt.HWND)
_sig(user32.IsIconic, wt.BOOL, wt.HWND)
_sig(user32.GetWindow, wt.HWND, wt.HWND, wt.UINT)
_sig(user32.GetClientRect, wt.BOOL, wt.HWND, ctypes.POINTER(wt.RECT))
_sig(user32.GetDC, wt.HDC, wt.HWND)
_sig(user32.ReleaseDC, ctypes.c_int, wt.HWND, wt.HDC)
_sig(user32.PrintWindow, wt.BOOL, wt.HWND, wt.HDC, wt.UINT)
_sig(user32.GetWindowDpiAwarenessContext, ctypes.c_void_p, wt.HWND)
_sig(user32.SetThreadDpiAwarenessContext, ctypes.c_void_p, ctypes.c_void_p)
_sig(gdi32.CreateCompatibleDC, wt.HDC, wt.HDC)
_sig(gdi32.CreateDIBSection, wt.HBITMAP, wt.HDC, ctypes.c_void_p, wt.UINT, ctypes.POINTER(ctypes.c_void_p),
     wt.HANDLE, wt.DWORD)
_sig(gdi32.SelectObject, wt.HGDIOBJ, wt.HDC, wt.HGDIOBJ)
_sig(gdi32.DeleteObject, wt.BOOL, wt.HGDIOBJ)
_sig(gdi32.DeleteDC, wt.BOOL, wt.HDC)


class WindowUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class Frame:
    width: int
    height: int
    data: bytes  # BGRA, üstten alta, satır = width * 4

    def pixel(self, x: int, y: int) -> tuple[int, int, int]:
        i = (y * self.width + x) * 4
        return self.data[i + 2], self.data[i + 1], self.data[i]


def _client_size(hwnd: int) -> tuple[int, int]:
    rect = wt.RECT()
    user32.GetClientRect(hwnd, ctypes.byref(rect))
    return rect.right, rect.bottom


def find_process_window(pids: set[int]) -> int | None:
    """Verilen süreçlere ait, görünür, sahipsiz en büyük üst düzey pencere."""
    best: tuple[int, int] | None = None

    @_ENUM_PROC
    def visit(hwnd, _):
        nonlocal best
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value in pids and user32.IsWindowVisible(hwnd) and not user32.GetWindow(hwnd, GW_OWNER):
            w, h = _client_size(hwnd)
            if w * h > 0 and (best is None or w * h > best[0]):
                best = (w * h, hwnd)
        return True

    user32.EnumWindows(visit, 0)
    return best[1] if best else None


class WindowCapture:
    """Tek iş parçacığından kullanılmalı; pencere boyutu değişirse DIB yeniden oluşturulur."""

    def __init__(self, hwnd: int):
        self.hwnd = hwnd
        self.dpi_context = user32.GetWindowDpiAwarenessContext(hwnd)
        screen = user32.GetDC(None)
        self.dc = gdi32.CreateCompatibleDC(screen)
        user32.ReleaseDC(None, screen)
        self.size = (0, 0)
        self.bitmap = self.old = None
        self.bits = ctypes.c_void_p()

    def _ensure_bitmap(self, size: tuple[int, int]) -> None:
        if size == self.size:
            return
        self._release_bitmap()
        bmi = BITMAPINFOHEADER(ctypes.sizeof(BITMAPINFOHEADER), size[0], -size[1], 1, 32, 0)
        self.bitmap = gdi32.CreateDIBSection(self.dc, ctypes.byref(bmi), 0, ctypes.byref(self.bits), None, 0)
        self.old = gdi32.SelectObject(self.dc, self.bitmap)
        self.size = size

    def _release_bitmap(self) -> None:
        if self.bitmap:
            gdi32.SelectObject(self.dc, self.old)
            gdi32.DeleteObject(self.bitmap)
            self.bitmap = None

    def grab(self) -> Frame:
        previous = user32.SetThreadDpiAwarenessContext(self.dpi_context)
        try:
            if not user32.IsWindow(self.hwnd):
                raise WindowUnavailable("Program penceresi kapandı")
            if user32.IsIconic(self.hwnd):
                raise WindowUnavailable("Program penceresi simge durumunda")
            size = _client_size(self.hwnd)
            if size[0] * size[1] == 0:
                raise WindowUnavailable("Pencere alanı boş")
            self._ensure_bitmap(size)
            if not user32.PrintWindow(self.hwnd, self.dc, PW_CLIENTONLY | PW_RENDERFULLCONTENT):
                raise WindowUnavailable("Pencere yakalanamadı")
            return Frame(size[0], size[1], ctypes.string_at(self.bits, size[0] * size[1] * 4))
        finally:
            user32.SetThreadDpiAwarenessContext(previous)

    def close(self) -> None:
        self._release_bitmap()
        gdi32.DeleteDC(self.dc)
