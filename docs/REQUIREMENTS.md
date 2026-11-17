# Gereksinimler

## 1. Kapsam

Tek kullanıcılı, yerel çalışan bir Web IDE. Tarayıcı arayüzü yerel bir servise bağlanır; servis kullanıcının makinesindeki MinGW-w64/CMake ile kodu derler ve programı yerel GPU'da masaüstü penceresi olarak çalıştırır. Çok kullanıcılı/uzak sunucu senaryosu kapsam dışıdır (bkz. DECISIONS ADR-002).

## 2. Fonksiyonel gereksinimler

| ID | Gereksinim |
|---|---|
| FR-01 | Proje oluşturma: ad + profil (`legacy` / `modern`) seçimi; şablondan başlangıç dosyaları. |
| FR-02 | Proje listeleme, açma, yeniden adlandırma, silme (yalnızca workspace içinde). |
| FR-03 | Dosya ağacı: kaynak dosya oluştur/yeniden adlandır/sil. İzinli uzantılar: `.c .cpp .h .hpp .vert .frag .geom .glsl .txt`. |
| FR-04 | Monaco editör: C/C++/GLSL sözdizimi vurgusu, çoklu sekme, kaydetme (Ctrl+S), kaydedilmemiş değişiklik göstergesi. |
| FR-05 | Derle: CMake configure + build; çıktı canlı olarak xterm.js terminaline akar. |
| FR-06 | Derleme hataları ayrıştırılır (dosya:satır:sütun) ve editörde işaretlenir. |
| FR-07 | Çalıştır: kaydedilmemiş dosyalar kaydedilir, proje derlenir, başarılıysa program masaüstü OpenGL penceresinde açılır; stdout/stderr terminale akar. |
| FR-14 | Örnek galerisi: her profil için animasyonlu ve statik en az bir örnekten proje oluşturma. |
| FR-08 | Durdur: çalışan derleme veya program, tüm alt süreçleriyle birlikte sonlandırılır. |
| FR-09 | Durum göstergesi: idle / building / running / failed; çıkış kodu ve süre. |
| FR-10 | Toolchain durumu: gcc/cmake/ninja/kütüphane tespiti ve eksiklerin raporlanması. |
| FR-11 | Çalışma başında `GL_VENDOR/GL_RENDERER/GL_VERSION` bilgisi gösterilir (şablon tarafından yazdırılır). |
| FR-12 | Seçili derleme ayarları: Debug/Release, C standardı (c11/c17), C++ standardı (c++17/c++20), uyarı seviyesi. Serbest bayrak yok. |
| FR-13 | (Faz 7) Çalışan programın görüntüsü WebRTC ile tarayıcıya aktarılır. |

## 3. OpenGL uyumluluk gereksinimleri

- **Legacy profil** (FreeGLUT + GLU, compatibility context) şu çağrıları eksiksiz destekler:
  `glBegin glEnd glVertex2f glVertex3f glColor3f glColor4f glClearColor glMatrixMode glLoadIdentity glTranslatef glRotatef glScalef glOrtho glLineWidth glPointSize glPolygonMode glFlush`
  ve FreeGLUT: `glutInit glutCreateWindow glutDisplayFunc glutTimerFunc` (+ yaygın callback'ler).
- **Modern profil** (GLFW + GLAD, 3.3 core): GLSL shader derleme/link, VAO, VBO, EBO.
- İki profil asla aynı context'te zorla çalıştırılmaz; şablon, CMake yapılandırması ve link listesi profile özeldir.
- Her profil için en az bir örnek proje (statik çizim + animasyon) bulunur.

## 4. Teknik gereksinimler

| ID | Gereksinim |
|---|---|
| TR-01 | Hedef OS: Windows 10/11 x64. Toolchain: MSYS2 UCRT64 (gcc, cmake, ninja, freeglut, glfw). |
| TR-02 | Frontend: React + TypeScript + Vite + Tailwind CSS + Monaco + xterm.js. |
| TR-03 | Backend: Python 3.11+, FastAPI, WebSocket (uvicorn). |
| TR-04 | Engine backend'den ayrı Python paketidir; HTTP'ye bağımlı değildir, CLI ile tek başına çalışabilir. |
| TR-05 | Testler: pytest (backend+engine), Vitest (frontend), Playwright (E2E). |
| TR-06 | Derleme başlangıcından ilk çıktıya gecikme < 1 sn; terminal akışı satır bazlı, < 200 ms gecikme. |
| TR-07 | Proje başına aynı anda tek aktif iş (derleme **veya** çalıştırma — Windows çalışan exe'yi kilitlediği için ikisi birlikte olamaz); global üst sınır vars. 4. Aşımda 409 / 429. |

## 5. Güvenlik gereksinimleri

| ID | Gereksinim |
|---|---|
| SR-01 | Servis yalnızca `127.0.0.1`'e bağlanır. |
| SR-02 | Her HTTP isteği ve WS bağlantısı, servis başlangıcında üretilen rastgele token ile yetkilendirilir. |
| SR-03 | `Origin` beyaz listesi ve `Host` başlığı kontrolü (CSRF / CSWSH / DNS rebinding). |
| SR-04 | Tüm yollar workspace köküne göre çözülür; dışarı çıkış, symlink/junction, ADS (`:`), aygıt adları (`CON`, `NUL`…) reddedilir. |
| SR-05 | Keyfi shell komutu çalıştırma yok; süreçler sabit ikili yolu + argüman listesiyle başlatılır. |
| SR-06 | Kullanıcı derleyici bayrağı veya CMake içeriği giremez; yalnızca FR-12 beyaz listesi. |
| SR-07 | Sınırlar: derleme zaman aşımı (vars. 60 sn), çalışma zaman aşımı (yapılandırılabilir), bellek limiti, süreç sayısı limiti, çıktı boyutu limiti, dosya boyutu limiti. |
| SR-08 | Süreç ağacı Windows Job Object (`KILL_ON_JOB_CLOSE`) ile yönetilir; servis kapanırsa alt süreçler de ölür. |
| SR-09 | Süreçler mümkün olan en düşük ayrıcalıkla (kısıtlı token / düşük bütünlük seviyesi) çalıştırılır; yönetici olarak çalıştırma reddedilir. |
| SR-10 | Tüm API girdileri Pydantic şemalarıyla doğrulanır (ad regex'i, boyut, enum). |
| SR-11 | Loglar token ve tam kullanıcı yollarını gizler. |

## 6. Kapsam dışı (şimdilik)

Uzak/çok kullanıcılı erişim, Linux/macOS, hata ayıklayıcı (gdb) entegrasyonu, paket yöneticisi, git entegrasyonu, WebGL/Emscripten derlemesi.
