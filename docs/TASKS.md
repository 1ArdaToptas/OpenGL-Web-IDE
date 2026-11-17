# Görevler

Sıra bağımlılığa göredir. `Bağ.` = önce bitmesi gereken görevler. Her görev: değişecek dosyaları listele → test yaz → uygula → test sonucunu ilerleme kaydına yaz.

## Faz 1 — Toolchain & Native Spike

| ID | Görev | Bağ. | Tamamlanma kriteri |
|---|---|---|---|
| T1.1 ✅ | ADR-009…014 kararlarını kullanıcıyla netleştir | — | DECISIONS'ta ⏳ kalmadı |
| T1.2 ✅ | MSYS2 + UCRT64 paketlerini kur (kullanıcı onayıyla) | — | `gcc/cmake/ninja --version` çalışır; freeglut/glfw başlıkları mevcut |
| T1.3 | `git init`, `.gitignore` (build/, node_modules/, dist/, workspace/) | T1.1 | ilk commit |
| T1.4 ✅ | GLAD 2 (3.3 core) üret, `templates/modern-glfw/third_party/glad` | T1.2 | dosyalar vendorlandı, lisans notu |
| T1.5 ✅ | `templates/legacy-freeglut` örnek + CMake; elle derle/çalıştır | T1.2 | pencere açılır, dönen üçgen, `GL_RENDERER` NVIDIA |
| T1.6 ✅ | `templates/modern-glfw` örnek (shader+VAO/VBO/EBO) + CMake | T1.4 | pencere açılır, dörtgen, `GL_RENDERER` NVIDIA |
| T1.7 ✅ | Şablonlara test modu (`OGLIDE_TEST_FRAMES`, piksel çıktısı) | T1.5, T1.6 | N kare sonra çıkış 0 + piksel satırı |
| T1.8 ✅ | Spike: Job Object + Low IL altında T1.5/T1.6 çalışıyor mu | T1.5, T1.6 | sonuç ADR-012'ye işlendi |

## Faz 2 — Engine

| ID | Görev | Bağ. | Tamamlanma kriteri |
|---|---|---|---|
| T2.1 ✅ | `engine/` paket iskeleti, pytest yapılandırması, `native` marker | T1.3 | `pytest` boş set ile çalışır |
| T2.2 ✅ | `toolchain`: yapılandırılmış yoldan tespit + sürüm | T2.1 | birim testleri yeşil |
| T2.3 ✅ | `project`: proje oluşturma + şablon CMake'e -D parametreleri | T2.1, T1.7 | profil ayrımı testleri yeşil |
| T2.4 ✅ | `build`: configure/build, çıktı akışı, zaman aşımı | T2.2, T2.3 | entegrasyon testleri yeşil |
| T2.5 ✅ | `diagnostics`: GCC/ld çıktı ayrıştırıcı | T2.1 | fixture testleri yeşil |
| T2.6 ✅ | `sandbox`: Job Object (bellek, süreç, kill-on-close), zaman aşımı, çıktı limiti | T1.8 | limit/durdurma testleri yeşil |
| T2.7 ✅ | `run`: sandbox ile çalıştırma, DLL PATH stratejisi | T2.4, T2.6 | OpenGL `native` testleri yeşil |
| T2.8 ✅ | CLI `python -m engine new|build|run|doctor` | T2.7 | iki şablon CLI'dan çalışır |

**Faz 2'den Faz 3'e devredilen açıklar:** `RunJob.stop()` `start()`'tan önce çağrılırsa etkisiz (T3.5'te bayrakla kapat) · bellek limiti aşımı `reason=exit` + sıfır dışı kod olarak görünür, ayrı `limit` nedeni yok · Low IL süreçte TEMP yazılamaz (gerekirse LocalLow altında geçici dizin) · derleyici orta bütünlük seviyesinde çalışır (build/ yazması için).

## Faz 3 — Backend + Güvenlik

| ID | Görev | Bağ. | Tamamlanma kriteri |
|---|---|---|---|
| T3.1 ✅ | FastAPI iskeleti, 127.0.0.1 bağlama, yönetici reddi, config | T2.8 | health testi yeşil |
| T3.2 ✅ | Token + Origin/Host middleware (HTTP+WS) | T3.1 | kimlik/origin testleri yeşil |
| T3.3 ✅ | `workspace` path guard + ad doğrulama | T3.1 | yol güvenlik testlerinin tamamı yeşil |
| T3.4 ✅ | Proje & dosya REST API (Pydantic) | T3.2, T3.3 | CRUD + enjeksiyon testleri yeşil |
| T3.5 ✅ | Job yönetimi (proje başına 1 aktif iş, global sınır), stop | T3.4 | eşzamanlılık + durdurma testleri |
| T3.6 ✅ | WS olay hub'ı (sözleşme ARCHITECTURE §3) | T3.5 | olay sırası entegrasyon testi |
| T3.7 ✅ | Log gizleme, çıktı limiti uçtan uca | T3.6 | limit testleri yeşil |

**Faz 3'ten devredilen açıklar:** bellek limiti aşımı hâlâ ayrı `limit` nedeni vermiyor · Low IL süreçte TEMP yazılamaz · derleyici orta bütünlük seviyesinde · yavaş WS istemcisinde kuyruk dolarsa olaylar sessizce düşer (Faz 6'da istemciye `overflow` bildirimi) · `frontend_dist` sunumu Faz 4/6'da.

## Faz 4 — Frontend

| ID | Görev | Bağ. | Tamamlanma kriteri |
|---|---|---|---|
| T4.1 ✅ | Vite+React+TS+Tailwind iskeleti, Vitest | T3.6 | `npm test` yeşil |
| T4.2 ✅ | Tasarım sistemi (ui-ux-pro-max ile), layout | T4.1 | tasarım token'ları (ADR-015) |
| T4.3 ✅ | `lib/api`, `lib/ws`, token akışı | T4.1 | istemci testleri yeşil |
| T4.4 ✅ | IDE durumu + dosya ağacı | T4.3 | reducer + bileşen testleri |
| T4.5 ✅ | Monaco editör + sekmeler + kaydet (Ctrl+S) | T4.3 | testler yeşil, tarayıcıda doğrulandı |
| T4.6 ✅ | xterm terminal + toolbar durum makinesi | T4.3 | testler yeşil, tarayıcıda doğrulandı |
| T4.7 ✅ | Diagnostics → Monaco marker + Sorunlar listesi | T4.5, T4.6 | hata satırı işaretlenir |

**Faz 4'ten devredilen açıklar:** dosya oluşturma/silme/yeniden adlandırma arayüzü yok (API var) · proje silme arayüzü yok · ana JS paketi 4.6 MB (Monaco tüm dilleriyle; yalnızca c/cpp/glsl ile küçültülmeli) · terminal stdin yok · sayfa yenilenince token kaybolur (tasarım gereği, ADR-016) · kaydedilmemiş değişiklikle Çalıştır uyarı vermiyor.

## Faz 5 — E2E

| ID | Görev | Bağ. | Tamamlanma kriteri |
|---|---|---|---|
| T5.1 ✅ | @playwright/test (MCP yok, ADR-017), sistem Edge'i | T4.7 | `npx playwright --version` |
| T5.2 ✅ | Global setup: geçici workspace + port 8799'da backend, token konsoldan | T5.1 | iz bırakmadan kapanır |
| T5.3 ✅ | Senaryolar: legacy derle/çalıştır/durdur · hata→Sorunlar+marker · modern shader · derlemeden çalıştır · token kaybı · yanlış token | T5.2 | 6/6, art arda 2 koşuda kararlı |

## Faz 6 — Sertleştirme

| ID | Görev | Tamamlanma kriteri |
|---|---|---|
| T6.1 ✅ | Güvenlik gözden geçirmesi (`docs/SECURITY-REVIEW.md`) + bulgu düzeltmeleri | npm/pip audit 0; gövde sınırı testli |
| T6.2 ✅ | Motor: job limit ihlali (`reason=limit`, `limit=memory|processes`, IOCP), Low IL TEMP (LocalLow) | sandbox testleri |
| T6.3 ✅ | Örnek galerisi: legacy "Şekiller" (statik), modern "Küp" (statik) + varsayılanlar; `GET /api/examples` | her örnek GPU'da uyarısız derlenir/çizer |
| T6.4 ✅ | Arayüz: dosya oluştur/sil, proje sil (onaylı), Çalıştır = kaydet→derle→çalıştır, limit mesajı | vitest + E2E |
| T6.5 ✅ | `scripts/setup.ps1`, `start.cmd`, `backend --open`, README | kurulum ve başlatma canlı doğrulandı |

## Faz 7 — WebRTC araştırması

| ID | Görev | Sonuç |
|---|---|---|
| T7.1 ✅ | Yakalama spike (PrintWindow, DPI eşleştirme) | 10–16 ms/kare, iki profil doğru; simge durumunda başarısız |
| T7.2 ✅ | aiortc akış + ölçüm sayfası (zaman damgalı kare) | 30 fps, 0 düşen, medyan 63 / p95 88 ms |
| T7.3 ✅ | DataChannel girdi → `PostMessage` | tuş + tıklama Low IL programa ulaştı |
| T7.4 ✅ | Rapor + ADR-018 (onay bekliyor) | `docs/research/WEBRTC.md` |

## Faz 8 — Tarayıcıda görüntü (entegrasyon)

| ID | Görev | Sonuç |
|---|---|---|
| T8.1 ✅ | `engine/stream`: PID ile pencere (Job süreç listesi), DPI-güvenli yakalama, doğrulanmış girdi | native: iki profil 800×600 doğru renk; simge durumu raporlanır |
| T8.2 ✅ | Legacy örnek "Klavye ve fare" (`glutKeyboardFunc`/`glutMouseFunc`) | girdi testi hedefi |
| T8.3 ✅ | `backend/stream.py` (aiortc oturumu) + WS `stream.offer/answer/error`, iş bitince oturum kapanır | 12 sinyalleşme + gerçek WebRTC native testi |
| T8.4 ✅ | Arayüz "Görüntü" sekmesi (`StreamView`, letterbox koordinat eşleme) | vitest + E2E (video 800 px akıyor, tuş+tıklama programa ulaşıyor) |
| T8.5 ✅ | `setup.ps1` varsayılan `[stream]` kurar, `-NoStream` ile atlanır | — |

## Faz 9 — Kurulumsuz tarayıcı çalışma ortamı (araştırma)

| ID | Görev | Sonuç |
|---|---|---|
| T9.1 ✅ | Tarayıcıda derleyici (`@yowasp/clang` 21.1.4-3, Worker) | ilk ~1.8 sn, sonra 30–50 ms; brotli 19 MB |
| T9.2 ✅ | OpenGL 1.x / GLU / FreeGLUT taklidi → WebGL2 + en küçük WASI | `spikes/browser/runtime/` |
| T9.3 ✅ | Doğrulama (`verify.mjs`, başsız Edge) | 14/14; legacy örnekler yerel GPU ile birebir aynı piksel |
| T9.4 ✅ | Rapor + ADR-019 (onay bekliyor) | `docs/research/BROWSER-RUNTIME.md` |

## Faz 10 — Web-öncelikli IDE (devam ediyor)

| ID | Görev | Durum |
|---|---|---|
| T10.0 ✅ | VS Code Dark+ renklendirme (fonksiyon/sabit/tip/GLSL), kod ve çıktı alanı yarı yarıya | E2E renkler + yerleşim |
| T10.1 ✅ | Çalışma ortamı TS'ye: `frontend/src/runtime/` (matrix, geometry, wasi, glut, legacyGL) | birim testleri |
| T10.2 ✅ | Program Worker + OffscreenCanvas (`runner.ts`, `program-worker.ts`) | sonsuz döngüde Durdur < 3 sn (E2E) |
| T10.3 ✅ | Tarayıcıda derleyici (`frontend/src/compiler/`, @yowasp/clang 21.1.4-3) + teşhis ayrıştırıcı | birim + E2E |
| T10.4 ✅ | Projeler IndexedDB'de, örnekler `templates/`'ten derleme anında (`frontend/src/web/`) | yenileme sonrası kalır (E2E) |
| T10.5 ✅ | IDE'de tarayıcı modu: token yoksa web; aynı API/olay arayüzü (`BrowserIde`) | web E2E 5/5 (backend'siz, statik) |
| T10.6 ✅ | Modern profil: GLFW taklidi (JSPI ile `glfwSwapBuffers`), GL 3.3 → WebGL2 (`modernGL.ts`), GLSL çevirisi (`#line` ile satır korunur), WASI salt okunur dosya sistemi (shader `fopen`) | web E2E 9/9: kare masaüstüyle aynı piksel, küp, shader hatası doğru satır, GLFW girdisi + Escape döngü çıkışı |
| T10.7 | Statik yayın: GitHub Pages + Actions (ADR-020) ✅ · açık: service worker önbelleği, derleyici indirme göstergesi, Firefox/Safari denemesi | yayın ✅ |

## Kalan açıklar

Terminal stdin · Monaco paketini küçültme (4.6 MB) · WS kuyruk taşması bildirimi · dosya yeniden adlandırma · AppContainer araştırması (ağ/dosya okuma yalıtımı, SECURITY-REVIEW risk 1) · sistem Python'unu güncelleme.

---

## İlerleme Kaydı

| Tarih | Görev | Sonuç |
|---|---|---|
| 2026-11-15 | Faz 0: skill, CLAUDE.md, docs/ | Tamam. Kod yok, test yok. Toolchain (gcc/cmake) bulunamadı → T1.2. |
| 2026-11-15 | T1.2 MSYS2 UCRT64 kurulumu | Tamam. gcc+freeglut ve gcc+glfw+glew duman testleri NVIDIA'da çalıştı, GL hatası 0. CMake ile derleme henüz denenmedi (T1.5). |
| 2026-11-15 | T1.1 kararlar | Tamam. GLAD 2, PATH DLL, Job Object→Low IL, %USERPROFILE%\OpenGLWebIDE, npm+git. |
| 2026-11-15 | T1.3 git | Kısmi: `git init` + .gitignore yapıldı; ilk commit kullanıcı isteyince. |
| 2026-11-15 | T1.4–T1.8 | Tamam. GLAD 2.0.8 vendorlandı. CMake+Ninja ile iki şablon derlendi (uyarı 0). Test modu: legacy piksel 69/70/116, modern ~127/0/127; GL hatası 0, NVIDIA 4.6 compat / 3.3 core. Spike: Job+Low IL ikisinde de çalıştı, job kapatma süreci öldürdü. Otomatik test yok (pytest Faz 2). |
| 2026-11-15 | Faz 2 (T2.1–T2.8) | Tamam. `engine/`: toolchain, project, build, diagnostics, sandbox(+_win32), run, cli. pytest: **80 passed, 0 skipped** (19 native, gerçek GPU). CLI duman testi new→build→run başarılı. |
| 2026-11-15 | Faz 3 (T3.1–T3.7) | Tamam. `backend/`: config, security, workspace, schemas, api, jobs, events, logging_setup, app, __main__. Faz 2 açığı `RunJob.stop()` erken çağrı kapatıldı. pytest: **223 passed, 0 skipped**. Canlı uvicorn duman testi: 401/400/200, yalnızca 127.0.0.1 dinleniyor, WS build+run, yabancı Origin red, logda token yok. Testlerin yakaladığı 3 gerçek hata düzeltildi (CON adı→500, request-loop'a bağlı olay yayını, uvicorn access log çökmesi); `websockets` bağımlılığı eklendi. |
| 2026-11-15 | Faz 4 (T4.1–T4.7) | Tamam. `frontend/`: React 19 + Vite 8 + Tailwind 4 + Monaco 0.57 (yerel) + xterm 6; backend `frontend/dist`'i CSP/güvenlik başlıklarıyla sunuyor. Vitest **78 passed**, tsc temiz; pytest **236 passed**. Tarayıcıda uçtan uca: proje oluştur → düzenle → Ctrl+S → derle (hata → Sorunlar + marker) → çalıştır (NVIDIA) → durdur. Canlı testte bulunan gerçek hata: legacy şablonda pencere X ile kapatılınca freeglut exit 1 → testle yeniden üretildi ve düzeltildi. jsdom 29'a sabitlendi (31, Node 22.22+ istiyor). |
| 2026-11-15 | Faz 5 (T5.1–T5.3) | Tamam. Playwright E2E **6/6** (2 koşu, ~25 sn), sistem Edge'i, gerçek GPU. E2E'nin bulduğu gerçek açık: yanlış/eski token'da arayüz yalnızca "Yetkisiz" gösteriyordu → 401'de bağlanma talimatı (birim testiyle). vitest **80**, pytest **236**. Koşu sonrası süreç/port/geçici dizin kalmadığı doğrulandı. |
| 2026-11-15 | Faz 6 (T6.1–T6.5) | Tamam. Bulunan/düzeltilen: dompurify kritik XSS (override 3.4.18), sınırsız istek gövdesi (4 MB, 413), `server` başlığı, venv setuptools. pytest **261**, vitest **90**, E2E **8/8**, npm/pip audit **0**. Tüm zorunlu legacy API'leri artık örneklerde derlenip GPU'da çalıştırılarak doğrulanıyor. `start.cmd` canlı denendi (yan etki: kullanıcının tarayıcısında 8771 sekmesi açıldı, servis kapatıldı). |
| 2026-11-15 | Faz 7 (T7.1–T7.4) | Tamam (araştırma). Hedef karşılandı: 30 fps, gecikme medyan 63 / p95 88 ms (yakalama damgası→ekran), girdi geri kanalı çalışıyor. Bulunan tuzaklar: DPI sanallaştırması (iş parçacığı DPI bağlamı eşleştirilerek çözüldü), simge durumunda yakalama yok, ilk yakalama ~1.2 sn. Ölçüm gizli tarayıcı panelinde yapıldı (çizim kısılı) — görünür sekmede tekrar önerilir. Spike bağımlılıkları ayrı `.venv-spike`'ta; ana venv/testler etkilenmedi. |
| 2026-11-15 | Faz 8 (T8.1–T8.5) | Tamam. pytest **295**, vitest **104**, E2E **9/9** (2 koşu), npm/pip audit **0**. Testlerin bulduğu gerçek hatalar: aiortc kapanışında iz `stop()` iki kez çağrılıyordu (iş parçacığı havuzu hatası) ve kapanırken gelen `recv` → idempotent stop + `MediaStreamError`; E2E kapanışında sonlandırılan exe dizini kilitli (EBUSY) → yeniden deneme. Görüntü dışına (letterbox) tıklamalar bilinçli olarak yok sayılır. |
| 2026-11-17 | Faz 9 (T9.1–T9.4) | Tamam (araştırma). Kullanıcı hedefi kurulumsuz web IDE. Tarayıcıda clang→WASM + kendi GL/GLUT taklidi: 3 legacy örnek değiştirilmeden derlendi, merkez pikseller yerel GPU ile birebir, glPolygonMode(GL_LINE)/glLineWidth/karışım/girdi doğru; 14/14. Bulunan hata: fare koordinatında canvas kenarlığı (düzeltildi). Açık: sonsuz döngü sekmeyi kilitler (Worker+OffscreenCanvas gerekli), modern profil yok. Ana testler etkilenmedi. |
| 2026-11-17 | Faz 10 (T10.0–T10.5) | VS Code renklendirme + yarı yarıya yerleşim; tarayıcı modu ürüne girdi: tarayıcıda clang, Worker+OffscreenCanvas'ta çalıştırma, IndexedDB projeler. vitest **225**, pytest **295**, yerel E2E **10/10**, web E2E **5/5** (backend olmadan). Bulunan: pencere kapatma testi başlığa göre pencere arıyordu (aynı başlıklı tarayıcı sekmesine WM_CLOSE gidebiliyordu) → PID ile. Davranış değişikliği: tokensız açılış artık tarayıcı modu. Açık: modern profil web'de yok. |
| 2026-11-17 | T10.6 modern profil (tarayıcı) | Tamam. Modern örnekler değiştirilmeden derlenip çalıştı. JSPI (Edge 157 Worker'da doğrulandı) ile GLFW while döngüsü sayfayı dondurmadan çalışır. Bulunan: WebGL varsayılan viewport'u 300×150'de kalıyordu → pencere boyutunda güncelleniyor (iki profil); hızlı biten hatalı programda hata gizli terminalde kalıyordu → hatalı bitişte terminale dönülüyor. vitest **262**, web E2E **9/9** (2 koşu), yerel E2E **10/10**. |
| 2026-11-17 | Kullanıcı istekleri: sade başlangıç, bölücü, Türkçe hatalar | Tamam. Legacy başlangıç = tek renkli turuncu dolu üçgen (dönen üçgen `examples/donen-ucgen`'e taşındı; yerel testler pencere yakalamayla doğruluyor). Kod/çıktı bölücüsü sürüklenir (%10–90, ok tuşu ±5, çift tık 50, tarayıcıda hatırlanır). Derleyici iletileri (clang + gcc, ~40 kalıp) editör üzerine gelince ve Sorunlar'da Türkçe; özgün ileti altta/ipucunda, tanınmayan ileti İngilizce kalır. Bulunan: gcc `expected expression before ';' token` biçimi tabloda yoktu (yerel E2E yakaladı). pytest **296**, vitest **302**, yerel E2E **10/10**, web E2E **10/10**. Monaco'nun Türkçe arayüz dili yok (yalnız iletiler çevrildi). |
| 2026-11-17 | T10.7 yayın hazırlığı | GitHub Pages seçildi (Cloudflare 25 MiB/dosya sınırı 72.7 MB derleyiciyi engeller). Actions iş akışı: test → `--base=/<repo>/` derleme → dağıtım. Alt yol derlemesi tarayıcıda denendi: başlangıç üçgeni derlenip çizildi. Herkese açık repo için temizlik: testteki Windows kullanıcı adı genelleştirildi, üçüncü taraf skill'ler dışarıda. Bulunan: Git Bash `--base=/x/` argümanını Windows yoluna çeviriyor (yalnız yerelde; CI Linux). |
