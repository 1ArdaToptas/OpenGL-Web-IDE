"""Faz 7 spike: OpenGL penceresinin istemci alanını yakalama (PrintWindow + PW_RENDERFULLCONTENT).

Üretim kodu değildir. Yalnızca ctypes; çıktı BGRA (üstten alta) bayt dizisi.
"""
import ctypes
import ctypes.wintypes as wt

user32 = ctypes.WinDLL("user32", use_last_error=True)
gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)

PW_CLIENTONLY, PW_RENDERFULLCONTENT = 0x1, 0x2

# DPI: GLFW pencereleri DPI-farkında, FreeGLUT değil. Yakalayan iş parçacığı hedef pencereyle aynı DPI
# bağlamında olmazsa boyutlar sanallaştırılır ve PrintWindow yanlış/ölçeklenmemiş bölge verir.
# Bu yüzden her çağrıda iş parçacığı bağlamı pencerenin bağlamına eşitlenir.
user32.GetWindowDpiAwarenessContext.restype = ctypes.c_void_p
user32.GetWindowDpiAwarenessContext.argtypes = [wt.HWND]
user32.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
user32.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
DIB_RGB_COLORS, BI_RGB = 0, 0


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [("biSize", wt.DWORD), ("biWidth", wt.LONG), ("biHeight", wt.LONG), ("biPlanes", wt.WORD),
                ("biBitCount", wt.WORD), ("biCompression", wt.DWORD), ("biSizeImage", wt.DWORD),
                ("biXPelsPerMeter", wt.LONG), ("biYPelsPerMeter", wt.LONG), ("biClrUsed", wt.DWORD),
                ("biClrImportant", wt.DWORD)]


user32.FindWindowW.restype = wt.HWND
user32.GetDC.restype = wt.HDC
user32.GetDC.argtypes = [wt.HWND]
user32.ReleaseDC.argtypes = [wt.HWND, wt.HDC]
user32.GetClientRect.argtypes = [wt.HWND, ctypes.POINTER(wt.RECT)]
user32.PrintWindow.argtypes = [wt.HWND, wt.HDC, wt.UINT]
gdi32.CreateCompatibleDC.restype = wt.HDC
gdi32.CreateCompatibleDC.argtypes = [wt.HDC]
gdi32.CreateDIBSection.restype = wt.HBITMAP
gdi32.CreateDIBSection.argtypes = [wt.HDC, ctypes.c_void_p, wt.UINT, ctypes.POINTER(ctypes.c_void_p), wt.HANDLE,
                                   wt.DWORD]
gdi32.SelectObject.restype = wt.HGDIOBJ
gdi32.SelectObject.argtypes = [wt.HDC, wt.HGDIOBJ]
gdi32.DeleteObject.argtypes = [wt.HGDIOBJ]
gdi32.DeleteDC.argtypes = [wt.HDC]


def find_window(title: str) -> int:
    return user32.FindWindowW(None, title) or 0


class WindowCapture:
    """Pencere boyutu sabit kaldığı sürece aynı DIB yeniden kullanılır."""

    def __init__(self, hwnd: int):
        self.hwnd = hwnd
        self.dpi_context = user32.GetWindowDpiAwarenessContext(hwnd)
        user32.SetThreadDpiAwarenessContext(self.dpi_context)
        rect = wt.RECT()
        user32.GetClientRect(hwnd, ctypes.byref(rect))
        self.width, self.height = rect.right, rect.bottom
        screen = user32.GetDC(None)
        self.dc = gdi32.CreateCompatibleDC(screen)
        user32.ReleaseDC(None, screen)
        bmi = BITMAPINFOHEADER(ctypes.sizeof(BITMAPINFOHEADER), self.width, -self.height, 1, 32, BI_RGB)
        self.bits = ctypes.c_void_p()
        self.bitmap = gdi32.CreateDIBSection(self.dc, ctypes.byref(bmi), DIB_RGB_COLORS, ctypes.byref(self.bits),
                                             None, 0)
        self.old = gdi32.SelectObject(self.dc, self.bitmap)
        self.size = self.width * self.height * 4

    def grab(self) -> bytes:
        user32.SetThreadDpiAwarenessContext(self.dpi_context)  # grab başka iş parçacığından çağrılabilir
        if not user32.PrintWindow(self.hwnd, self.dc, PW_CLIENTONLY | PW_RENDERFULLCONTENT):
            raise ctypes.WinError(ctypes.get_last_error(), "PrintWindow")
        return ctypes.string_at(self.bits, self.size)

    def pixel(self, frame: bytes, x: int, y: int) -> tuple[int, int, int]:
        i = (y * self.width + x) * 4
        b, g, r = frame[i], frame[i + 1], frame[i + 2]
        return r, g, b

    def close(self):
        gdi32.SelectObject(self.dc, self.old)
        gdi32.DeleteObject(self.bitmap)
        gdi32.DeleteDC(self.dc)
