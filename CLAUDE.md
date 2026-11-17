# OpenGL Web IDE

Tarayıcıda C/C++ yazıp kullanıcının kendi makinesinde (MinGW-w64 + CMake, yerel GPU) derleyip çalıştıran Web IDE.
Durum: **Faz 10 sürüyor: kurulumsuz tarayıcı modu iki profilde çalışıyor (ADR-019); T10.7: GitHub Pages yayını (ADR-020, `.github/workflows/pages.yml`).** Tokensız açılış = tarayıcı modu, `#token` = yerel mod.

## Dokümanlar (tek kaynak — bilgiyi kopyalama, link ver)

- `docs/REQUIREMENTS.md` gereksinimler · `docs/ARCHITECTURE.md` mimari · `docs/DECISIONS.md` kararlar (ADR)
- `docs/ROADMAP.md` fazlar · `docs/TASKS.md` görevler + ilerleme kaydı · `docs/TEST-PLAN.md` testler
- `docs/SECURITY-REVIEW.md` tehdit modeli, bulgular, kabul edilen riskler · `README.md` kullanıcı kurulumu

## Yapı (planlanan)

```
frontend/   ✅ lib (api, ws, token) · state/ide · features (…, editor/syntax renklendirme) · web/ (BrowserIde, IndexedDB, örnekler) · compiler/ (tarayıcıda clang) · runtime/ (WASI, GLUT, LegacyGL, Worker)
backend/    ✅ security · workspace (yol koruması) · api · jobs · events (WS hub) · logging_setup · app · __main__
engine/     ✅ toolchain · project · build · diagnostics · sandbox(+_win32) · run · cli · stream/ (pencere, girdi)
templates/  legacy-freeglut/ , modern-glfw/ (+third_party/glad) , common/ (GPU seçimi)  ✅ çalışıyor
spikes/     sandbox_spike.py (Job Object + Low IL) · webrtc/ (yakalama + aiortc akış; ayrı `.venv-spike`)
            browser/ (tarayıcıda clang→WASM + GL/GLUT taklidi → WebGL2; `npm i` + `node verify.mjs`, statik sunucu :8800)
scripts/    setup.ps1 (kurulum) · kökte start.cmd (başlatma, `backend --open`)
tests/      pytest (backend+engine), e2e/ (Playwright, Faz 5)
```

## Kesin kurallar

- Legacy (FreeGLUT/compat) ve Modern (GLFW/GLAD 3.3 core) **ayrı şablon ve context**; asla aynı projede karıştırma.
- Süreç çağrıları yalnızca argüman listesiyle, `shell=False`. Keyfi komut çalıştıran endpoint yok.
- Tüm dosya yolları workspace köküne göre çözülüp doğrulanır (`resolve()` + `is_relative_to`, symlink reddi).
- Sunucu yalnızca `127.0.0.1`; HTTP+WS token ile, `Origin`/`Host` kontrolü zorunlu.
- Derleme/çalıştırmada zaman, bellek, süreç sayısı ve çıktı boyutu sınırı; süreç ağacı Job Object ile öldürülür.
- `CMakeLists.txt` kullanıcıya açık değil; motor şablondan üretir.
- Güvenlik testleri özellikle birlikte yazılır, sonraya bırakılmaz.
- Modern loader GLAD 2 (vendored); DLL'ler yalnızca alt sürecin PATH'ine; workspace `%USERPROFILE%\OpenGLWebIDE\workspace`.

## Skill kullanımı

- Native C/C++/OpenGL/CMake/MinGW işleri → `opengl-native-development`
- React arayüzü/tasarım → `ui-ux-pro-max` (diğer tasarım skill'lerini paralel çağırma)
- Planlama/TDD/debug → superpowers (`writing-plans`, `test-driven-development`, `systematic-debugging`)
- Tarayıcı: etkileşimli kontrol yerleşik tarayıcıyla; otomatik E2E `@playwright/test` (Playwright MCP kurulmadı, ADR-017).

## Çalışma düzeni (token ekonomisi)

- Önce dosya ağacı, sonra yalnızca ilgili dosyalar. `node_modules`, lockfile, `build/`, `dist/` okunmaz.
- Değişiklikten önce etkilenecek dosyaları listele. Uzun terminal çıktısını özetle.
- Görev bitince `docs/TASKS.md` ilerleme kaydına tek satır + test sonucu yaz.
- Gereksiz subagent/paralel görev yok; rutin işte kısa muhakeme, mimari kararda derin muhakeme.

## Komutlar

Toolchain: `C:\msys64\ucrt64\bin` (gcc, g++, cmake, ninja, gdb). PATH'te değil; tam yol kullan.
Paket ekleme: `C:\msys64\usr\bin\bash.exe -lc "pacman -S --needed mingw-w64-ucrt-x86_64-<pkg>"` (MSYSTEM=UCRT64).
Kurulum/başlatma: `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1` · `start.cmd` (tarayıcı açar — testte kullanma).
Örnek ekleme: `templates/<profil>/examples/<id>/example.json` + `src/` (+`shaders/`); native test her örneği otomatik derler/çalıştırır.
Python: `.venv/Scripts/python` (venv, `pip install -e .[dev]` gerekmez; pytest `pythonpath=.`).
Testler: `.venv/Scripts/python -m pytest -q` (native testler toolchain yoksa atlanır; ~40 sn, GPU penceresi açar).
Servis: `.venv/Scripts/python -m backend [--port 8765] [--dev-origin http://127.0.0.1:5173]` → konsoldaki `#token=` URL'si.
Frontend (frontend/ içinde): `npm test` · `npx tsc --noEmit` · `npm run build` (backend dist'i sunar) · `npm run dev` (Vite 5173, backend `--dev-origin` ile).
E2E (frontend/ içinde): `npm run e2e` (yerel mod, backend + GPU pencereleri) · `npm run e2e:web` (tarayıcı modu, backend'siz statik `vite preview`).
Motor: `.venv/Scripts/python -m engine doctor | new <ad> --profile legacy|modern [--workspace D] | build <proj> | run <proj> [--frames N]`
