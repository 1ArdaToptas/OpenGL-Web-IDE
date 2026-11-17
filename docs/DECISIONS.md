# Mimari Kararlar (ADR)

Durum: ✅ kabul · ⏳ kullanıcı onayı bekliyor

## ADR-001 ✅ Frontend / Backend / Engine üç ayrı modül
Engine HTTP'den bağımsız Python paketi. **Gerekçe:** native derleme mantığı UI olmadan test edilebilir; ileride ayrı süreç/servis yapılabilir.

## ADR-002 ✅ Yalnızca yerel, tek kullanıcı
`127.0.0.1`, başlangıçta üretilen token. **Gerekçe:** kullanıcının derleyicisi ve GPU'su kullanılıyor; uzak erişim keyfi kod çalıştırma demek.

## ADR-003 ✅ Legacy ve Modern ayrı şablon + context
Legacy: FreeGLUT + GLU, compatibility. Modern: GLFW + loader, 3.3 core. **Gerekçe:** core profile immediate mode'u kaldırır; compatibility'de modern çağrılar sürücüye bağlı. Ayrım öngörülebilirlik sağlar.

## ADR-004 ✅ Süreçler argüman listesiyle, shell yok
**Gerekçe:** komut enjeksiyonunu yapısal olarak engeller.

## ADR-005 ✅ Derleme ayarları beyaz listeli
Serbest `CFLAGS`/link bayrağı yok. **Gerekçe:** `-fplugin`, `-wrapper`, `@file` gibi bayraklar kod çalıştırabilir/dosya okuyabilir.

## ADR-006 ✅ CMake betiği motorun kontrolünde, kullanıcı projesinde değil
**Gerekçe:** CMake betiği `execute_process` ile keyfi komut çalıştırabilir. **Uygulama (Faz 2):** dosya üretilmez; `cmake -S templates/<profil>` ile şablondaki betik kullanılır, proje yolu ve ayarlar `-DOGLIDE_*` argümanlarıyla geçer ve `templates/common/oglide_common.cmake` içinde beyaz listeye göre yeniden doğrulanır. Kaynaklar `src/*.c|*.cpp` GLOB ile bulunur. Betik metnine kullanıcı girdisi hiç yazılmadığı için CMake enjeksiyonu yoktur.

## ADR-007 ✅ Windows Job Object ile süreç yönetimi
Bellek, aktif süreç sayısı, `KILL_ON_JOB_CLOSE`. **Gerekçe:** `terminate()` alt süreçleri öldürmez; Job Object servis çökse de temizlik garantiler.

## ADR-008 ✅ Token URL fragment'ında, WS'de URL'de değil
**Gerekçe:** fragment sunucuya/loglara gitmez; WS query string'leri loglanabilir.

## ADR-009 ✅ Toolchain: MSYS2 UCRT64 (2026-11-15 kuruldu)
`C:\msys64`, winget `MSYS2.MSYS2` 20260927 + pacman: gcc 16.2.0, cmake 4.5.0, ninja 1.13.2, gdb 18.1, pkgconf, freeglut, glfw, glew, ntldd. **Gerekçe:** tüm bağımlılıklar tek paket yöneticisiyle. Duman testi: legacy → 4.6 compat, modern → 3.3 core, ikisi de NVIDIA RTX 3050 Ti (Optimus export'ları çalışıyor).

## ADR-010 ✅ Modern loader: GLAD 2 (vendored)
3.3 core için `glad2` ile üretilir, `templates/modern-glfw/third_party/glad/` altına kaynak olarak gömülür. **Gerekçe:** ek DLL yok, sürüm sabit. GLEW sistemde kurulu kalır ama şablonda kullanılmaz.

## ADR-011 ✅ Çalışma zamanı DLL'leri: alt sürecin PATH'ine `ucrt64in`
Yalnızca çalıştırılan sürecin ortamına eklenir, sistem PATH'i değişmez. **Gerekçe:** basit ve hızlı derleme. **Sonuç:** exe yalnızca bu makinede çalışır; dağıtım gerekirse statik link ayrı karar olur.

## ADR-012 ✅ Ayrıcalık: Job Object → sonra Low IL
Başlangıç: Job Object limitleri + yönetici olarak çalıştırma reddi. Ayrı Windows kullanıcısı reddedildi (karmaşık, GPU/masaüstü oturumu sorunları).
**T1.8 sonucu (2026-11-15):** `spikes/sandbox_spike.py` ile iki şablon da Job Object (512 MB, 4 süreç, KILL_ON_JOB_CLOSE) + Low IL (`S-1-16-4096`, `CreateProcessAsUserW`) altında NVIDIA'da çalıştı, GL hatası 0. Job kapatılınca süreç sonlandı. → **Low IL varsayılan olarak etkin.** Notlar: Low IL süreç proje dizinine yazamaz (yalnızca okuma; çıktı dosyası gerekirse Low IL yazılabilir ayrı dizin); job ile öldürülen süreç exit=0 döner → `TerminateJobObject(job, kod)` ile ayırt edici kod verilmeli.

## ADR-013 ✅ Workspace kökü: `%USERPROFILE%\OpenGLWebIDE\workspace`
Yapılandırılabilir. **Gerekçe:** IDE kaynak kodundan ayrı; IDE güncellense/silinse de projeler korunur.

## ADR-015 ✅ Arayüz tasarım sistemi
ui-ux-pro-max önerisi (dev tool, yoğunluk 8, hareket 2): Minimal/Swiss, koyu öncelikli slate paleti, Çalıştır için yeşil vurgu; token'lar `frontend/src/index.css` `@theme` içinde, bileşenlerde ham hex yok. **Sapmalar:** Google Fonts yerine sistem fontları (Segoe UI / Cascadia Code) — yerel IDE dış ağa bağımlı olmamalı; ikon kütüphanesi yerine az sayıda satır içi SVG (bağımlılık yok). Arayüz metni 13 px (IDE yoğunluğu), editör 14 px; tıklanabilir hedefler ≥ 24 px, görünür odak halkası, `prefers-reduced-motion` desteği. Önerilen "FAQ landing" deseni ürüne uymadığı için kullanılmadı.

## ADR-016 ✅ Frontend yalnızca aynı origin'e konuşur
Göreli `/api` ve `/ws`. Geliştirmede Vite proxy (`backend --dev-origin http://127.0.0.1:5173`), üretimde backend `frontend/dist`'i sunar. Monaco CDN'den değil `monaco-editor` paketinden yüklenir (çevrimdışı, üçüncü taraf istek yok). Token yalnızca bellekte; sayfa yenilenirse konsoldaki URL ile yeniden açılır.

## ADR-017 ✅ E2E: @playwright/test, Playwright MCP yok
Kullanıcı kararı (Faz 5). Otomatik testler `@playwright/test` ile, sistemdeki Microsoft Edge (`channel: "msedge"`) üzerinde — ayrı tarayıcı indirilmez. Etkileşimli kontrol için oturumun yerleşik tarayıcısı yeterli; aynı işi yapan ikinci araç (MCP) kurulmadı. E2E kendi backend'ini geçici workspace ve 8799 portunda başlatır; kullanıcının servisine/projelerine dokunmaz.

## ADR-018 ✅ Tarayıcıya görüntü aktarımı: WebRTC (aiortc) + PrintWindow
Faz 7 ölçümü (`docs/research/WEBRTC.md`): 800×600 30 fps, 0 düşen kare, yakalama→ekran medyan 63 / p95 88 ms, girdi geri kanalı çalışıyor. Kullanıcı Faz 8'i onayladı. **Varsayılanlar:** masaüstü penceresi varsayılan kalır, tarayıcı görüntüsü "Görüntü" sekmesinden isteğe bağlı; aiortc `[stream]` ekstrası olarak kurulum betiğiyle varsayılan kurulur (`-NoStream` ile atlanır), yoksa özellik devre dışı ve arayüz nedenini söyler. Sinyalleşme kimlik doğrulamalı mevcut WS üzerinden; pencere iş sürecinin PID'iyle bulunur; girdi yalnızca o pencereye. Lisans (PyAV içindeki FFmpeg/x264) yalnız dağıtımda incelenmeli.

## ADR-019 ✅ Kurulumsuz web IDE: derleme ve çalıştırma ziyaretçinin tarayıcısında
Kullanıcı hedefi (2026-11-17): siteye giren herkes hiçbir şey kurmadan kullanır; kod ziyaretçinin donanımında çalışır. ADR-002'deki "yalnız yerel" modelin yerine geçer. Faz 9 denemesi (`docs/research/BROWSER-RUNTIME.md`): tarayıcıda clang (WASM) + kendi OpenGL/GLUT taklit katmanımız (WebGL2) ile legacy örnekler değiştirilmeden derlenip yerel GPU sürümüyle **birebir aynı piksellerle** çalıştı (14/14). **Önerilen:** Faz 10'da ürüne taşı — program Worker + OffscreenCanvas'ta, projeler tarayıcıda, site statik. Kullanıcı onayladı (2026-11-17). **Uygulama:** adreste `#token` varsa yerel mod (mevcut), yoksa tarayıcı modu; yerel sürüm silinmedi (kaldırma kararı kullanıcıya ait, bekliyor).

## ADR-020 ✅ Yayın: GitHub Pages + GitHub Actions
Kullanıcı seçimi (2026-11-17). Derleyici WASM'ı 72.7 MB: Cloudflare Pages (25 MiB/dosya) elendi; Netlify sürükle-bırak hesap + aylık bant sınırı ister. **Uygulama:** `.github/workflows/pages.yml` her `main` push'unda `npm ci` → `npm test` → `vite build --base=/<repo>/` → Pages'e dağıtır; büyük dosya repoya girmez. Kısıt: Pages özel HTTP başlığı (CSP vb.) koyamaz — bkz. SECURITY-REVIEW. Repo herkese açık; üçüncü taraf skill'ler `.gitignore` ile dışarıda.

## ADR-014 ✅ npm + git
npm (11.6.2, kurulu). Proje kökünde git deposu; commit yalnızca kullanıcı isteyince.
