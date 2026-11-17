# OpenGL Web IDE

Tarayıcıda C/C++ OpenGL kodu yazıp **kendi bilgisayarınızda** (MinGW-w64 + CMake, yerel GPU) derleyip çalıştıran yerel IDE.
Legacy (FreeGLUT, `glBegin/glEnd`) ve Modern (GLFW + GLAD, OpenGL 3.3 core, shader) profilleri ayrı şablonlarla desteklenir.

## İki mod

- **Tarayıcı modu (kurulumsuz):** `frontend` derlenip (`npm run build`) herhangi bir statik sunucudan yayınlanır. Ziyaretçi hiçbir şey kurmaz; C kodu tarayıcıda clang ile WebAssembly'ye derlenir ve kendi GPU'sunda WebGL2 ile çalışır, projeler tarayıcısında saklanır. İki profil de desteklenir (legacy: FreeGLUT/glBegin; modern: GLFW + shader). Modern profil WebAssembly JSPI ister (Chrome/Edge 137+). İlk açılışta derleyici (~19 MB sıkıştırılmış) bir kez indirilir.
- **Yerel mod:** Aşağıdaki kurulumla; MinGW + gerçek masaüstü OpenGL penceresi, iki profil.

## Gereksinimler (yerel mod)

- Windows 10/11 x64, OpenGL sürücüsü kurulu GPU
- Python 3.11+, Node.js 22.12+
- MSYS2 UCRT64 araçları (gcc, cmake, ninja, freeglut, glfw) — kurulum betiği eksikse talimat verir

## Kurulum ve başlatma

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
.\start.cmd
```

`.\start.cmd` (PowerShell `.\` öneki ister; cmd.exe'de `start.cmd` yeterli) servisi yalnızca `127.0.0.1:8765` üzerinde başlatır ve arayüzü tarayıcıda açar. Konsoldaki `…/#token=…` adresi oturuma özeldir; servis yeniden başlatılınca yeni adres kullanılmalıdır. Projeler `%USERPROFILE%\OpenGLWebIDE\workspace` altında tutulur.

## Tarayıcıda görüntü

Program masaüstünde kendi penceresinde açılır. Alt paneldeki **Görüntü** sekmesi, çalışan programı WebRTC ile tarayıcıda da gösterir; videoya tıklama ve (video odaktayken) tuşlar programa iletilir. Bu özellik kurulum betiğiyle varsayılan kurulur (`setup.ps1 -NoStream` ile atlanır).

## Güvenlik notu

Çalıştırılan programlar düşük bütünlük seviyesinde ve kaynak sınırlarıyla çalışır, ancak ağa erişebilir ve dosyalarınızı okuyabilir. Güvenmediğiniz kodu çalıştırmayın. Ayrıntı: [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md).

## Yayın (tarayıcı modu, GitHub Pages)

Canlı: **https://1ardatoptas.github.io/OpenGL-Web-IDE/**

Site statiktir; ziyaretçinin bir şey kurması gerekmez. İlk derlemede derleyici ~27 MB (sıkıştırılmış) indirilir — durum çubuğunda ilerleme görünür. Bir kez açılıp derleme yapıldıktan sonra site **internet olmadan da** açılır, derler ve çalıştırır (service worker önbelleği).

Tarayıcı desteği: **Chrome / Edge** ve **Firefox** (iki profil, tüm testler). Gerekenler: WebAssembly, WebGL2, OffscreenCanvas; Modern (GLFW) profil ayrıca WebAssembly JSPI. Eksik özellik varsa site açılışta hangisinin eksik olduğunu söyler. Safari: Playwright'ın Windows WebKit'inde OffscreenCanvas olmadığı için çizim denenemedi (gerçek Safari 17+'da var); arayüz, derleme ve uyarı testleri WebKit'te geçiyor.

1. GitHub'da **herkese açık** boş bir repo oluştur (README eklemeden).
2. Repo → Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
3. Bu klasörü o repoya push et; `.github/workflows/pages.yml` test eder, derler ve yayınlar.
4. Adres: `https://<kullanıcı-adı>.github.io/<repo-adı>/` (Actions sekmesinde "Pages" iş akışı yeşil olunca).

## Geliştirme

Mimari, kararlar, görevler ve test planı: [docs/](docs/). Test komutları: [CLAUDE.md](CLAUDE.md).
