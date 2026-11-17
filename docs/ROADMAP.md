# Yol Haritası

Her faz bir önceki tamamlanmadan başlamaz. Görev ayrıntısı: `TASKS.md`.

| Faz | Hedef | Çıkış kriteri |
|---|---|---|
| **0 — Hazırlık** ✅ | Skill, CLAUDE.md, dokümanlar | Bu doküman seti |
| **1 — Toolchain & Native Spike** ✅ | MSYS2 kurulumu; legacy ve modern örnekler elle CMake ile derlenip NVIDIA GPU'da çalışıyor; Job Object + Low IL denemesi | İki örnek pencere açıyor, `GL_RENDERER` NVIDIA; spike notu DECISIONS'a işlendi |
| **2 — Engine** ✅ | toolchain tespiti, şablonlar, build, diagnostics parser, sandbox run, CLI | `python -m engine build/run` iki şablonda çalışıyor; pytest yeşil |
| **3 — Backend + Güvenlik** ✅ | FastAPI, token, Origin/Host, path guard, proje/dosya API, WS olay akışı, durdurma | Güvenlik test seti yeşil; WS üzerinden derleme çıktısı akıyor |
| **4 — Frontend** ✅ | Vite+React+Tailwind iskeleti, Monaco, xterm, dosya ağacı, toolbar, hata işaretleri | Vitest yeşil; elle uçtan uca derle-çalıştır |
| **5 — E2E** ✅ | Playwright testleri (MCP kurulmadı, ADR-017) | Kritik akışlar otomatik test ediliyor |
| **6 — Sertleştirme** ✅ | Limit ayarları, hata mesajları, log gizleme, örnek proje galerisi, paketleme (backend frontend/dist'i sunar) | Güvenlik gözden geçirmesi temiz; tek komutla başlatma |
| **7 — WebRTC (araştırma)** ✅ | Pencere yakalama + aiortc ile tarayıcıya akış, girdi geri kanalı | Prototip: 30 fps, < 150 ms gecikme ölçümü |
| **8 — Tarayıcıda görüntü (entegrasyon)** ✅ | PID ile pencere bulma, yakalama, WS sinyalleşme + aiortc, "Görüntü" sekmesi, DataChannel girdi | E2E: çalışan program tarayıcıda görünür, tuş programa ulaşır |
| **9 — Kurulumsuz tarayıcı çalışma ortamı (araştırma)** ✅ | Tarayıcıda clang→WASM, OpenGL/GLUT taklidi → WebGL2 | 14/14: legacy örnekler yerel GPU ile birebir aynı piksel (`docs/research/BROWSER-RUNTIME.md`) |
| **10 — Web-öncelikli IDE (ADR-019) — legacy ✅ modern ✅, kalan T10.7 yayın hazırlığı** | Çalışma ortamını frontend'e taşı (Worker + OffscreenCanvas), modern profil (GLFW/GL 3.3→WebGL2), projeler tarayıcıda, statik barındırma | E2E: kurulum olmadan iki profil tarayıcıda derlenir/çalışır |
