# OpenGL Web IDE kurulumu: Python venv + bağımlılıklar, frontend bağımlılıkları + derleme, toolchain kontrolü.
# Sistem geneli kurulum YAPMAZ (MSYS2 eksikse yalnızca talimat verir). Tekrar çalıştırmak güvenlidir.
# -NoStream: tarayıcıda görüntü özelliğini (aiortc + PyAV, ~100 MB) kurma.
param([switch]$NoStream)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "HATA: $msg" -ForegroundColor Red; exit 1 }

Step "Python ve Node sürümleri"
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { Fail "Python 3.11+ bulunamadı (https://www.python.org/downloads/)." }
& python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if ($LASTEXITCODE -ne 0) { Fail "Python 3.11 veya üstü gerekli." }
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail "Node.js 22.12+ bulunamadı (https://nodejs.org/)." }
& node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=12)?0:1)"
if ($LASTEXITCODE -ne 0) { Fail "Node.js 22.12 veya üstü gerekli." }

Step "Python sanal ortamı ve bağımlılıklar"
if (-not (Test-Path ".venv\Scripts\python.exe")) { & python -m venv .venv }
& .venv\Scripts\python.exe -m pip install --quiet --upgrade pip "setuptools>=84.1"
$extras = if ($NoStream) { "dev" } else { "dev,stream" }
& .venv\Scripts\python.exe -m pip install --quiet -e ".[$extras]"
if ($LASTEXITCODE -ne 0) { Fail "pip install başarısız." }

Step "Frontend bağımlılıkları ve derleme"
Push-Location frontend
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"  # E2E sistemdeki Edge'i kullanır
& npm ci --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm ci başarısız." }
& npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "Arayüz derlenemedi." }
Pop-Location

Step "Derleme araçları (MSYS2 UCRT64)"
& .venv\Scripts\python.exe -m engine doctor
if ($LASTEXITCODE -ne 0) {
  Write-Host @"
MSYS2 UCRT64 araçları eksik. Yönetici onayıyla şu adımları kendiniz çalıştırın:
  winget install MSYS2.MSYS2
  C:\msys64\usr\bin\bash.exe -lc "pacman -Syu --noconfirm"
  C:\msys64\usr\bin\bash.exe -lc "pacman -S --needed --noconfirm mingw-w64-ucrt-x86_64-{gcc,gdb,cmake,ninja,pkgconf,freeglut,glfw,glew,ntldd}"
Farklı bir konum için OGLIDE_MSYS2_ROOT ortam değişkenini ayarlayın.
"@ -ForegroundColor Yellow
  exit 2
}

Write-Host "`nKurulum tamam. Başlatmak için (proje klasöründe): .\start.cmd" -ForegroundColor Green
