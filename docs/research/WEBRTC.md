# Faz 7 Araştırması: OpenGL Penceresini Tarayıcıya Aktarma (WebRTC)

Tarih: 2026-11-15 · Kod: `spikes/webrtc/` (üretim kodu değil) · Makine: RTX 3050 Ti Laptop, 16 mantıksal çekirdek, ekran ölçeği %125

## Sonuç

**Hedef karşılandı:** 800×600, **30 fps** kesintisiz, gecikme hedefin (< 150 ms) altında. Girdi geri kanalı çalışıyor. WebRTC yaklaşımı ürüne entegrasyon için uygun.

| Ölçüm | Değer |
|---|---|
| Yakalama (PrintWindow) | 10–16 ms/kare, 52–55 kare/sn tavan; ilk yakalama ~1.2 sn (bir kerelik DWM ısınması) |
| Sunucu kare üretimi | 30.8 kare/sn (aiortc 30 fps tempo) |
| Tarayıcı kod çözme | **30 kare/sn**, 67 sn'de 2003 kare, **0 düşen kare**, kod çözme 1.2–1.5 ms, jitter tamponu 13–20 ms |
| Kodek | VP8 (aiortc yazılım kodlayıcı, libvpx) |
| Gecikme: yakalama damgası → ekrana çizilen kare (n=98) | **medyan 63 ms, p90 85 ms, p95 88 ms, max 98 ms** |
| Tahmini uçtan uca (+ yakalama ~10 ms + GL çizim ≤ 16 ms) | medyan ~90 ms, p95 ~115 ms |
| Sunucu maliyeti | tek çekirdeğin ~%61'i (toplam CPU %3.8), 114 MB |
| Girdi (DataChannel → `PostMessage`) | tuşlar ve tıklamalar Low IL FreeGLUT programına birebir koordinatla ulaştı |

**Ölçüm sınırı:** Ölçüm, Claude'un gizli tarayıcı panelinde yapıldı; panel ekrana çizimi kıstığı için çizilen kare hızı ~2/sn göründü (kod çözme 30/sn). Gecikme örnekleri yalnızca çizilen karelerden alındığından istatistik geçerli ama örnek sayısı sınırlı. Görünür bir sekmede tekrar ölçülmeli (`spikes/webrtc` → `window.__summary()`).

## Bulgular

1. **PrintWindow(`PW_CLIENTONLY | PW_RENDERFULLCONTENT`) OpenGL pencerelerini doğru yakalıyor** (siyah kare yok; merkez piksel referansla eşleşti), pencere başka pencerelerin altındayken de. DXGI/Windows Graphics Capture'a gerek kalmadı.
2. **DPI tuzağı (kritik):** GLFW pencereleri DPI-farkında, FreeGLUT değil. Yakalayan iş parçacığının DPI bağlamı hedef pencereyle aynı değilse boyut sanallaşır (%125 ölçekte 800×600 → 640×480 ya da 1000×750) ve yanlış bölge yakalanır. Çözüm: her yakalamada `SetThreadDpiAwarenessContext(GetWindowDpiAwarenessContext(hwnd))`. İki profil de bununla doğru.
3. **Simge durumundaki pencere yakalanamaz** (`PrintWindow` başarısız). Üretimde: son kareyi dondur + kullanıcıya bildir; pencereyi küçültmek yerine arka planda tutmak.
4. **Medium → Low IL `PostMessage` izinli** (UIPI yalnızca düşükten yükseğe engeller); girdi enjeksiyonu yönetici yetkisi gerektirmiyor.
5. PyAV 18 tekerleği **h264_nvenc** (NVIDIA donanım kodlayıcı) ve **h264_mf** içeriyor → yüksek çözünürlük/fps için CPU yükü düşürülebilir.

## Önerilen entegrasyon (Faz 8 adayı)

- **engine/stream:** `WindowCapture` (DPI eşleştirme, simge durumu → son kare), pencereyi **başlığa göre değil iş sürecinin PID'ine göre** bulma (`EnumWindows` + `GetWindowThreadProcessId`, yalnızca job'daki süreçler).
- **backend:** aiortc isteğe bağlı bağımlılık (`[stream]` extra). Sinyalleşme **mevcut kimlik doğrulamalı WS** üzerinden (`stream.offer`/`stream.answer`); yeni kimliksiz uç yok. Çalışan iş başına tek eş; iş bitince eş kapanır. ICE yalnız loopback host adayı, STUN/TURN yok (dış ağ trafiği yok).
- **Girdi güvenliği:** yalnızca o işin kendi penceresine; mesaj şeması doğrulama (tek karakter, koordinat kırpma), hız sınırı; yalnız `WM_CHAR`/fare mesajları.
- **frontend:** alt panelde "Görüntü" sekmesi (`<video>` + girdi eşleme), "Tarayıcıda göster" anahtarı; masaüstü penceresi varsayılan kalır.

## Riskler / açık sorular

- **Lisans:** PyAV tekerlekleri FFmpeg + libx264 (GPL) içerir; dağıtım senaryosu varsa lisans incelenmeli (VP8/libvpx BSD; yalnız VP8 kullanmak GPL bileşenini gerektirmez ama tekerlek yine içerir).
- **Boyut:** aiortc + av ~100 MB; ayrı opsiyonel kurulum önerilir.
- **Kalite:** aiortc VP8 varsayılan bit hızı düşük başlar (REMB ile artar); ince çizgiler (glLineWidth 1) bulanıklaşabilir — bit hızı/çözünürlük ayarı denenmeli.
- **Alternatif:** Sunucu ve tarayıcı aynı makinede olduğundan WebRTC'nin NAT/tıkanıklık avantajları kullanılmıyor. Daha basit bir taban çizgisi olarak JPEG/WebSocket veya WebCodecs ölçülebilir; WebRTC ise donanım kod çözme ve akıcı oynatmayı hazır sunuyor ve ölçümle doğrulandı.

## Spike'ı yeniden çalıştırma

```
python -m venv .venv-spike && .venv-spike\Scripts\python -m pip install -e . aiortc==1.16.0
.venv\Scripts\python -m engine new girdi --profile legacy --workspace <ws> && copy spikes\webrtc\input_test.c <ws>\girdi\src\main.c
.venv\Scripts\python -m engine build <ws>\girdi
.venv-spike\Scripts\python -m spikes.webrtc.server <ws>\girdi "OpenGL Web IDE - Girdi"   →  http://127.0.0.1:8790/
python -m spikes.webrtc.capture_bench <proje> "<pencere başlığı>" r,g,b   (yalnız yakalama ölçümü)
```
