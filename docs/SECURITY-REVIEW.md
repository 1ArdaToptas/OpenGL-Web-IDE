# Güvenlik Gözden Geçirmesi (Faz 6, 2026-11-15)

## Tehdit modeli

| Saldırgan | Hedef | Ana kontrol |
|---|---|---|
| Kullanıcının tarayıcısında açık başka bir web sitesi | Servise istek atıp kod derletmek/çalıştırmak (CSRF, CSWSH, DNS rebinding) | Token (fragment'ta), Origin + Host izin listesi, CORS yalnızca kendi origin |
| Yerel ağdaki başka makine | Servise bağlanmak | Yalnızca `127.0.0.1` dinlenir (canlı netstat ile doğrulandı) |
| Aynı makinedeki başka OS kullanıcısı | Loopback üzerinden servis | Rastgele 256 bit token, `compare_digest` |
| Dosya API'sine kötü niyetli yol | Workspace dışına okuma/yazma | `workspace.py` yol koruması (62 test) |
| Kullanıcı kodu (öğrencinin yapıştırdığı) | Makineye zarar, kaynak tüketimi | Job Object limitleri, Low IL, zaman aşımı, çıktı sınırı |

**Kapsam dışı:** token sahibi = makinenin kullanıcısıdır; ona karşı koruma hedeflenmez.

## Doğrulanan kontroller (testlerle)

- Kimlik/Origin/Host/CORS: `tests/backend/test_security.py`, `test_static.py`
- Yol ve ad doğrulaması, junction: `tests/backend/test_workspace.py`, `test_api_files.py`
- Komut enjeksiyonu yok (argv, `shell=False`, beyaz liste ayarlar, CMake betiği kullanıcıya kapalı): `tests/engine/test_sandbox.py`, `test_build_args.py`, `test_project.py`
- Süreç sınırları ve temizlik: `test_sandbox.py`, `test_native_build_run.py`
- Log gizleme, yönetici reddi, loopback bağlama: `tests/backend/test_main.py`
- CSP ve güvenlik başlıkları: `test_static.py`; arayüz token'ı yalnızca bellekte tutar (E2E 5–6)

## Bu fazda bulunan ve düzeltilenler

| # | Bulgu | Önem | Düzeltme |
|---|---|---|---|
| 1 | `monaco-editor@0.57.0` → `dompurify@3.4.15` (DOM XSS, GHSA-p98j-92pf-mc4p vd.) | Kritik (npm audit) | `package.json` `overrides: dompurify ^3.4.18`; `npm audit` = 0 |
| 2 | İstek gövdesi sınırsız okunuyordu (boyut kontrolü ayrıştırmadan sonra) | Orta (bellek tüketimi) | `BodyLimitMiddleware`: Content-Length ve parça parça gövdede 4 MB → 413 |
| 3 | `server: uvicorn` başlığı | Düşük | `server_header=False` |
| 4 | venv `setuptools 65.5.0` (9 bilinen açık, yalnızca derleme aracı) | Düşük | ≥ 84.1; `pip-audit` = 0 |

## Kabul edilen / açık riskler

1. **Low IL program ağa erişebilir ve kullanıcı dosyalarını okuyabilir.** Low IL yalnızca yazmayı engeller. Güvenilmeyen kodu çalıştırmayın. İyileştirme adayı: AppContainer (ağ + dosya okuma engeli); OpenGL/GPU uyumluluğu araştırılmalı.
2. **Derleyici dosya okuma kanalı:** `#include "C:/…"` herhangi bir okunabilir dosyayı hata mesajına sızdırabilir. Token sahibi zaten kullanıcı olduğundan kabul edildi.
3. **Derleyici orta bütünlük seviyesinde** çalışır (build/ yazmak için). Derleme sırasında kod çalışmaz (plugin/specs bayrakları beyaz liste dışında).
4. **Sistem Python'u 3.11.1** (2022): güncel bir 3.11.x/3.12+ sürümüne yükseltilmesi önerilir.
5. `start.cmd` / `--open` token'lı adresi tarayıcıya verir; adres tarayıcı geçmişine düşer. Token oturuma özeldir ve servis yeniden başlayınca geçersizdir.
6. **Görüntü aktarımı (Faz 8):** sinyalleşme kimlik doğrulamalı WS'den; girdi yalnızca o işin penceresine, şema + boyut + hız sınırıyla. aiortc yerel ağ arayüzlerinde de ICE adayı (UDP) açar; bağlantı DTLS ile şifreli ve ICE kimlik bilgileri yalnızca token sahibine verilen SDP'de olduğundan dışarıdan bağlanılamaz. PyAV tekerleği FFmpeg/x264 içerir (dağıtımda lisans incelemesi).
7. Kullanıcı tarafından yapıştırılan kod dışında tedarik zinciri: npm/pip bağımlılıkları sürüm aralığıyla; kilit dosyası (`package-lock.json`) depoda tutulmalı.
- **Yayın (tarayıcı modu, GitHub Pages, ADR-020):** Pages özel yanıt başlığı koyamaz; yerel moddaki CSP/çerçeveleme başlıkları statik sitede yok. Site sır tutmaz, sunucuya veri göndermez; kullanıcı kodu ziyaretçinin kendi sekmesinde Worker içinde çalışır ve yalnız kendi IndexedDB'sine erişir. Kabul edildi; gerekirse `<meta http-equiv="Content-Security-Policy">` sonradan eklenebilir (Monaco/Worker/WASM ile denenmeli).
