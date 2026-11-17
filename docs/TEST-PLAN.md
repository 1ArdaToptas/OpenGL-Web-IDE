# Test Planı

Araçlar: **pytest** (engine, backend), **Vitest** (frontend), **Playwright** (E2E, Faz 5). OpenGL/toolchain gerektiren testler `@pytest.mark.native` ile işaretlenir; toolchain yoksa atlanır (skip, geçti sayılmaz — raporda ayrıca gösterilir).

## 1. Fonksiyonel (birim)

| Alan | Test |
|---|---|
| templates | Her profil doğru dosya setini ve doğru link listesini üretir; legacy CMake'te `glfw` yok, modern'de `freeglut` yok. |
| build ayarları | FR-12 beyaz listesi dışındaki değer → doğrulama hatası. |
| diagnostics | Örnek GCC çıktılarından (hata, uyarı, not, linker `undefined reference`) doğru `{file,line,col,severity}`. |
| toolchain | Eksik/sahte ikili yol → anlamlı "toolchain yok" hatası. |
| frontend | API/WS istemcisi olay ayrıştırma, editör marker eşlemesi, toolbar durum makinesi (Vitest). |

## 2. Entegrasyon

| Test | Beklenen |
|---|---|
| engine CLI build legacy örnek | çıkış 0, exe oluşur |
| engine CLI build modern örnek | çıkış 0, exe oluşur |
| bozuk kaynak build | çıkış ≠ 0, diagnostics olayı ≥ 1 hata |
| API proje oluştur → dosya yaz → build → run → stop | olay sırası `started → output* → exited` |
| WS yeniden bağlanma | çalışan job'un durumu yeniden alınabilir |
| eşzamanlılık | aynı projede ikinci build → 409 |

## 3. OpenGL testleri (`native`)

Şablonlar test modunda (`OGLIDE_TEST_FRAMES=N` ortam değişkeni) N kare çizip `OGLIDE_PIXEL r g b` ve `OGLIDE_GLERROR n` satırlarını yazar ve çıkar. Animasyon zamana bağlı olduğundan piksel karşılaştırması **toleranslı** yapılır (±8) ve arka plan rengi (26/26/31) olmamalıdır. Referans: legacy 69/70/116, modern 127/0/127.

| Test | Beklenen |
|---|---|
| legacy: `glBegin/glVertex/glColor` üçgen | merkez piksel beklenen renk |
| legacy: `glTranslatef/glRotatef/glScalef`, `glOrtho` | dönüşüm sonrası piksel konumu doğru |
| legacy: `glPolygonMode(GL_LINE)`, `glLineWidth`, `glPointSize` | GL hatası yok |
| legacy: `GLUT_SINGLE + glFlush` ve `GLUT_DOUBLE + swap` | ikisi de çizer |
| legacy: `glutTimerFunc` animasyon | N kare sonra açı/değer değişmiş |
| modern: shader derleme hatası | info log stderr'de, çıkış ≠ 0 |
| modern: VAO/VBO/EBO dörtgen | merkez piksel beklenen renk |
| her iki profil | `GL_RENDERER` stdout'ta; Optimus export sembolleri exe'de mevcut (`objdump -p`) |
| profil karışması | modern şablonda `glBegin` → GL hatası raporlanır (beklenen davranış belgelenir) |

## 4. Güvenlik testleri (Faz 3'te, özelliğin kendisiyle birlikte)

| Kategori | Test |
|---|---|
| Yol | `../`, `..\\`, mutlak yol, `C:\\`, UNC `\\\\host\\`, `%2e%2e`, Unicode normalizasyonu, `file.c:stream` (ADS), `CON`/`NUL`/`COM1`, sonda nokta/boşluk, symlink & junction → hepsi reddedilir |
| Ad | proje/dosya adı regex'i, uzunluk sınırı, izinsiz uzantı (`.exe`, `.bat`, `.dll`, `CMakeLists.txt`) |
| Kimlik | token yok / yanlış → 401; WS token'sız → kapanır |
| Origin/Host | yabancı `Origin` ile WS → red; `Host: evil.com` → 400 |
| Enjeksiyon | proje adı `a;calc`, `a&&calc`, `$(..)` → doğrulama hatası; hiçbir süreç başlatılmaz (süreç başlatma mock'lanarak doğrulanır) |
| Bayrak | build isteğinde bilinmeyen alan → 422 |
| Limitler | sonsuz döngü → zaman aşımı `reason=timeout`; fork bombası (çok süreç) → Job limiti; bellek şişirme → limit; 100 MB stdout → kesilir, servis ayakta |
| Durdurma | çalışan programı durdur → süreç ağacında kalıntı yok; backend süreci öldürülünce alt süreçler de ölür |
| Ayrıcalık | backend yönetici olarak başlatılırsa reddeder; (ADR-012 kabul edilirse) çalıştırılan sürecin bütünlük seviyesi Low |
| Bağlanma | servis yalnızca 127.0.0.1'de dinliyor (0.0.0.0'da değil) |

## 5. E2E (Playwright, `frontend/e2e/`, `npm run e2e`)

Edge (headless) + gerçek backend/toolchain/GPU; geçici workspace, port 8799, tek işçi.
1. Legacy: yeni proje → Derle → "Derleme başarılı" → Çalıştır → `GL_RENDERER`/`GL_VERSION` → Durdur → "Program durduruldu".
2. Sözdizimi hatası: kaydedilmemiş işareti → Derle önce kaydeder → Sorunlar sekmesi → teşhise tıkla → `.squiggly-error`.
3. Modern: `basic.frag` düzenle → Ctrl+S → derle → çalıştır (`GL_VERSION: 3.3`), shader hatası yok.
4. Derlenmemiş projede Çalıştır → önce derler, sonra çalıştırır.
7. Galeriden "Küp" örneği → çalıştır (3.3 core).
8. Dosya oluştur (ağaç + sekme) ve onaylı sil.
9. Görüntü: "Klavye ve fare" örneği çalışırken video 800 px akar; video ortasına tıklama ve `r` tuşu programa ulaşır (`CLICK`, `KEY r`).
5. Token adres çubuğundan silinir; yenilemede bağlanma talimatı.
6. Yanlış token → bağlanma talimatı, IDE açılmaz.

## 6. Raporlama

Her görev sonunda: `pytest` özet satırı (passed/failed/skipped), Vitest özeti; atlanan `native` testleri açıkça belirtilir.
