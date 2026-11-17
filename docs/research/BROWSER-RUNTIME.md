# Faz 9 Araştırması: Kurulumsuz, Tamamen Tarayıcıda C/OpenGL (derleme + çalıştırma)

Tarih: 2026-11-17 · Kod: `spikes/browser/` (üretim kodu değil) · Doğrulama: `node spikes/browser/verify.mjs` (başsız Edge)

## Hedef

Siteye giren herkes **hiçbir şey kurmadan** C/OpenGL kodu yazsın; kod **ziyaretçinin** işlemcisinde (WebAssembly) ve ekran kartında (WebGL2) çalışsın. Sunucuda kod derlenmez, çalıştırılmaz.

## Yaklaşım

1. **Derleyici tarayıcıda:** `@yowasp/clang` (LLVM/Clang/LLD'nin WebAssembly derlemesi, ISC; LLVM Apache-2.0) bir Web Worker'da çalışır; C → `wasm32-wasip1`.
2. **OpenGL/GLUT kütüphanesi taklit edilir:** Öğrenci `#include <GL/freeglut.h>` yazar; bizim başlıklarımız (`spikes/browser/include/GL/*.h`) gerçek sabitleri ve bildirimleri içerir, gövdeler JavaScript'tedir (`runtime/gl.js`, `glut.js`) ve WebAssembly içe aktarımı olarak bağlanır (`-Wl,--allow-undefined`).
3. **Legacy OpenGL → WebGL2:** köşeler CPU'da dönüştürülür; `glBegin/glEnd` ilkelleri üçgen/çizgi/noktaya çevrilir. Bu sayede WebGL'de olmayan **`glPolygonMode(GL_LINE)`** (kenarlar çizgiye) ve **`glLineWidth > 1`** (çizgiler piksel genişliğinde dikdörtgene) de desteklenir.
4. **`glutMainLoop()`:** WebAssembly yığını bir JS istisnasıyla bırakılır; bellek ve global değişkenler kalır, olay döngüsünü tarayıcı yürütür (`setTimeout` zamanlayıcılar, `requestAnimationFrame` çizim, geri çağırmalar fonksiyon tablosundan).
5. **Standart kütüphane:** en küçük WASI uygulaması (`runtime/wasi.js`): `printf` → IDE terminali, `getenv`, saat, `exit`.

## Sonuçlar (14/14 kontrol, iki koşu)

| Kontrol | Sonuç |
|---|---|
| Şablonlar **değiştirilmeden** derlendi | ✅ dönen üçgen, Şekiller, Klavye ve fare |
| Dönen üçgen merkez pikseli | **69,70,116 — yerel GPU sürümüyle birebir aynı**; yön doğru |
| Şekiller merkez pikseli | **51,204,76 — birebir aynı** |
| `glPolygonMode(GL_LINE)` | ✅ altıgenin içi boş, kenarı tam renk (255,204,51) |
| `glLineWidth(2)`, `glPointSize(6)` | ✅ |
| `glColor4f` + `glBlendFunc` | ✅ kesişim (70,6,135) teorik değerle tam eşit |
| `GLUT_SINGLE` + `glFlush`, test modu, `glutLeaveMainLoop` | ✅ |
| Klavye/fare (`glutKeyboardFunc`/`glutMouseFunc`) | ✅ `CLICK 123 456`, `KEY r` birebir |
| Derleme hatası | ✅ `main.c:1:25: error: …` (mevcut Sorunlar paneline doğrudan uyar) |
| Desteklenmeyen fonksiyon (ör. `glNormal3f`) | ✅ derleme anında açık hata (sessiz yanlış çizim yok) |
| Derleme süresi | ilk: ~1.6–1.9 sn (derleyici yükleme dahil), sonraki: **30–50 ms** |
| `GL_RENDERER` | ziyaretçinin GPU'su (ANGLE/D3D11) |
| Derleyici indirme | ham 97.8 MB → **brotli 19 MB** (bir kez; sonra önbellek). 10 Mbit ~16 sn, 50 Mbit ~3 sn |

Spike sırasında bulunan hata: fare koordinatı canvas kenarlığını hesaba katmıyordu (122,454 ≠ 123,456) → düzeltildi.

## Mevcut mimariye etkisi

| Kalır | Değişir |
|---|---|
| Editör, terminal, dosya ağacı, Sorunlar, örnek galerisi, tasarım, test altyapısı | MinGW/CMake/Job Object/Low IL/WebRTC → tarayıcıda clang + taklit katmanı |
| GCC biçimli teşhis ayrıştırıcı (clang aynı biçimi verir) — TS'ye taşınır | Backend zorunlu değil: site **statik** barındırılabilir (projeler tarayıcıda IndexedDB/OPFS) |
| Yerel sürüm | İstenirse "masaüstü modu" olarak kalabilir (kullanıcı kararı) |

## Açık riskler / sonraki işler

1. **Sonsuz döngü sekmeyi kilitler:** program şu an sayfanın ana iş parçacığında çalışıyor; `while(1)` (ana döngü dışı) sekmeyi dondurur. Çözüm: programı **Worker + OffscreenCanvas** içinde çalıştırmak (Durdur = `worker.terminate()`, zaman aşımı mümkün). Edge/Chrome/Firefox destekler; Safari 17+.
2. **Modern profil (GLFW + GL 3.3 core) henüz yok:** WebGL2 neredeyse birebir; gereken: GLFW taklidi, GL 3.3 fonksiyonlarının WebGL2'ye eşlenmesi (VAO/VBO/EBO, shader), `#version 330 core` → `#version 300 es` + varsayılan `precision` dönüştürmesi, GLAD yerine başlık.
3. **Ölçüm başsız tarayıcıda:** Claude'un gizli panelinde `requestAnimationFrame` kısılıyor; görünür sekmede ve farklı tarayıcılarda (Firefox, Safari) ayrıca denenmeli.
4. **Derleyici paketi geliştirme ağırlıklı:** `@yowasp/clang` 21.1.4-3 sabitlenmeli, sürüm geçişleri testle doğrulanmalı.
5. **Taklit kapsamı:** listede olmayan fonksiyon derleme hatası verir; kapsam (ör. ışıklandırma `glLight*`, doku `glTexImage2D`) talebe göre büyür.
