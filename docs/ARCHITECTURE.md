# Mimari

## 1. Genel görünüm

```
┌──────────────── Tarayıcı ────────────────┐
│ React UI: FileTree · Monaco · xterm.js   │
│ api/ (REST client)   ws/ (event stream)  │
└───────────┬──────────────────┬───────────┘
   HTTP (token)        WebSocket (token, Origin)
            │ 127.0.0.1:<port>  │
┌───────────▼──────────────────▼───────────┐
│ Backend (FastAPI)                        │
│  security/  auth · origin/host · limits  │
│  workspace/ path guard · file CRUD       │
│  api/       projects · files · toolchain │
│  ws/        session hub (build/run olay) │
└───────────┬──────────────────────────────┘
            │ Python API (async, event callback)
┌───────────▼──────────────────────────────┐
│ Engine (bağımsız paket)                  │
│  toolchain/ tespit · sürüm               │
│  templates/ profil → dosyalar + CMake    │
│  build/     cmake configure/build, parse │
│  run/       sandbox (Job Object, token)  │
└───────────┬──────────────────────────────┘
            │ subprocess (argv, shell=False)
     gcc/g++ · cmake · ninja  →  program.exe  →  GPU (masaüstü pencere)
```

## 2. Bileşenler

### Frontend (`frontend/`)
- `features/editor` Monaco, sekmeler, hata işaretleri (marker).
- `features/terminal` xterm.js; WS'den gelen `stdout/stderr` olaylarını yazar.
- `features/files` dosya ağacı.
- `features/toolbar` Derle / Çalıştır / Durdur, profil ve ayarlar.
- `lib/api`, `lib/ws`: tip güvenli istemci; token bellekte tutulur (localStorage'a yazılmaz). WS kopunca artan gecikmeyle (0.5→5 sn) yeniden bağlanır; 4400/4401/4403/4404'te denemez.
- `state/ide.ts`: saf reducer (sekmeler, kirli dosyalar, iş fazı, teşhisler); `toolbarState` buton durumlarını türetir.
- `features/problems`: konumlu teşhisler tıklanınca dosya açılır ve satıra gidilir.
- Derle önce kaydedilmemiş tüm sekmeleri kaydeder. Monaco/xterm ince sarmalayıcılardır; mantık saf fonksiyonlarda (`editorLogic`, `terminalText`) test edilir.
- Native motor hakkında bilgisi yoktur; yalnızca API sözleşmesini bilir.
- Backend `frontend/dist`'i sunar; tüm yanıtlarda CSP (`script-src 'self'`, `connect-src` yalnızca kendi ws), `nosniff`, `no-referrer`, `no-store`.

### Backend (`backend/`)
- İnce katman: kimlik doğrulama, girdi doğrulama, workspace erişimi, engine çağrısı, olayların WS'ye yayını.
- Durum: proje başına `Session { build: Job?, run: Job? }` bellekte.

### Engine (`engine/`)
- `toolchain`: yapılandırılmış MSYS2 kökünden tam yolları çözer, `--version` ile doğrular.
- `project`: profil, `BuildSettings` (beyaz liste), şablondan proje oluşturma (`src/`, `shaders/` kopyalanır; CMake betiği kopyalanmaz — ADR-006).
- `build`: `BuildJob` — `cmake -S templates/<profil> -B <proj>/build -GNinja -DOGLIDE_*` + `cmake --build`; `LC_ALL=C`; çıktıyı `on_output(stream, text)` ile akıtır; `stop()`.
- `diagnostics`: GCC/ld çıktısı → `{file,line,col,severity,message}` (proje içi yollar göreli).
- `sandbox`: `SandboxedProcess` — `CreateProcessAsUserW` (askıda) → Job Object (bellek, süreç sayısı, `KILL_ON_JOB_CLOSE`) → devam; yalnızca stdout/stderr kalıtılır (handle list); minimal ortam; zaman aşımı; çıktı limiti (keser, süreci öldürmez); ana süreç bitince job'daki kalanlar öldürülür.
- `run`: `RunJob` — Low IL (TEMP/TMP = `%USERPROFILE%\AppData\LocalLow\OpenGLWebIDE\tmp`), PATH başında `ucrt64/bin`, çalışma dizini = proje kökü, `test_frames` ile test modu.
- Örnekler: şablon kökü varsayılan örnek (`baslangic`), ek örnekler `templates/<profil>/examples/<id>/` (`example.json` + `src/`, `shaders/`).
- API eşzamanlı (thread tabanlı); backend `run_in_executor` ile sarar, `on_output`'u asyncio kuyruğuna köprüler.
- CLI: `python -m engine new|build|run|doctor` — backend olmadan kullanım/test için.

## 3. İletişim sözleşmesi

### REST (hepsi `Authorization: Bearer <token>`)
| Metot | Yol | Açıklama |
|---|---|---|
| GET | `/api/health` | sürüm, toolchain durumu |
| GET | `/api/examples` | örnek galerisi `{id, profile, title, description, kind}` |
| GET/POST | `/api/projects` | listele / oluştur `{name, profile, example?}` |
| DELETE | `/api/projects/{name}` | sil |
| GET | `/api/projects/{name}/tree` | dosya ağacı |
| GET/PUT/DELETE | `/api/projects/{name}/files/{path}` | dosya oku/yaz/sil |
| POST | `/api/projects/{name}/build` | `{config, cStd, cxxStd, warnings}` → `jobId` |
| POST | `/api/projects/{name}/run` | → `jobId` |
| POST | `/api/jobs/{jobId}/stop` | durdur |

### WebSocket `/ws?project=<name>`
Bağlantıdan sonra ilk mesaj (5 sn içinde) `{"type":"auth","token":"…"}`; token URL'de değil. Kapanış kodları: `4400` Host, `4403` Origin, `4401` yetki, `4404` proje yok. Başarıda `{"type":"ready","project":…,"activeJob":{jobId,kind}|null}` (yeniden bağlanınca süren iş görülür). Hata kodları REST: 400 yol/ad, 404 yok, 409 aktif iş / önce derleyin, 413 dosya büyük, 422 şema, 429 global sınır, 503 toolchain eksik.
Sunucu → istemci olaylar:
```json
{"type":"job.started","jobId":"…","kind":"build|run"}
{"type":"job.output","jobId":"…","stream":"stdout|stderr","data":"…"}
{"type":"build.diagnostics","jobId":"…","items":[{"file":"main.c","line":12,"col":5,"severity":"error","message":"…"}]}
{"type":"job.exited","jobId":"…","kind":"build|run","code":0,"durationMs":1234,"reason":"exit|timeout|killed|error|limit","outputTruncated":false,"limit":null,"ok":true}
```
`limit` (`memory`|`processes`) Job Object tamamlama portundan gelen ihlal bildirimidir; `reason=limit` yalnızca ihlal + sıfır dışı çıkışta. İstek gövdesi 4 MB ile sınırlıdır (413). Arayüzde **Çalıştır** = kaydet → derle → başarılıysa çalıştır.
`ok` yalnızca build'de. `EventHub.publish` iş parçacığı güvenlidir: motor iş parçacıkları olayları her abonenin kendi loop'una `call_soon_threadsafe` ile FIFO taşır.

## 4. Workspace düzeni

```
<WORKSPACE_ROOT>/            (vars. %USERPROFILE%\OpenGLWebIDE\workspace, ADR-013)
  <project>/
    project.json            {profile, settings}
    src/ main.c …           (kullanıcı dosyaları)
    shaders/ *.vert *.frag  (modern)
    build/                  (motor yönetir, kullanıcıya gösterilmez)
```

## 5. Başlatma akışı

1. `python -m backend` → token üretir, `127.0.0.1:<port>`'u dinler, `http://127.0.0.1:<port>/#token=…` URL'sini konsola yazar.
2. Frontend URL fragment'ından token'ı okur, bellekte tutar, fragment'ı temizler.
3. Geliştirmede Vite dev server ayrı port'ta; `Origin` beyaz listesine yalnızca o port eklenir. Üretimde backend `frontend/dist`'i kendisi sunar (tek origin).

## 7. Tarayıcı modu (ADR-019, Faz 10)

Adreste `#token` yoksa `main.tsx` arayüzü `BrowserIde` ile kurar; backend gerekmez, site statik sunulabilir.
- `frontend/src/web/browserIde.ts`: yerel API + olay soketiyle **aynı arayüz** (App değişmeden çalışır); projeler `IdbStore` (IndexedDB); örnekler `templates/`'ten derleme anında (`examples.ts`).
- `frontend/src/compiler/`: `compiler-worker.ts` (@yowasp/clang, `wasm32-wasip1`, taklit başlıklar `include/GL`), `compileArgs` beyaz listesi, `diagnostics.ts`.
- `frontend/src/runtime/`: `runner.ts` (ana iş parçacığı: Worker, girdi eşleme, zaman aşımı, çıktı sınırı, `terminate()` ile Durdur) → `program-worker.ts` (WASI + `Glut` + `LegacyGL` → WebGL2, OffscreenCanvas). `glutMainLoop` yığını `MainLoopStarted` ile bırakır.
- Legacy: `Glut` + `LegacyGL`. Modern: `Glfw` + `ModernGL` (GL 3.3 → WebGL2, GLuint↔WebGL nesne tabloları); `glfwSwapBuffers` JSPI (`WebAssembly.Suspending`/`promising`) ile programı bir kare askıya alır → kendi `while` döngüsü sayfayı dondurmaz; JSPI yoksa açık hata (Chrome/Edge 137+).
- Shader'lar `translateGlsl` ile `#version 300 es` + varsayılan hassasiyet; `#line` ile satır numaraları korunur. Proje dosyaları WASI'de salt okunur `.` dizini (fd 3) olarak açılır: `fopen("shaders/x.vert")` çalışır, yazma `EROFS`.
- Taklit başlıklar: `frontend/src/compiler/include/{GL,glad,GLFW}`.

## 6. Grafik aktarımı (ADR-018, ölçümler: `docs/research/WEBRTC.md`)

- Program her zaman kendi masaüstü penceresini açar; "Görüntü" sekmesi isteğe bağlı olarak tarayıcıda gösterir.
- `engine/stream/window.py`: pencere iş sürecinin PID'iyle bulunur (Job Object süreç listesi + `EnumWindows`); `PrintWindow(PW_CLIENTONLY|PW_RENDERFULLCONTENT)`, her yakalamada iş parçacığı DPI bağlamı pencereninkine eşitlenir; simge durumunda `WindowUnavailable` (son kare tekrarlanır).
- `backend/stream.py`: aiortc `RTCPeerConnection`, 30 fps VP8; DataChannel `input` → `engine/stream/input.py` (yalnız tek yazdırılabilir karakter `WM_CHAR` ve sol tıklama, koordinat kırpma, ≤ 200 mesaj/sn, ≤ 256 bayt).
- Sinyalleşme proje WS'si üzerinden: istemci `{"type":"stream.offer","sdp","sdp_type":"offer"}` → sunucu `stream.answer` veya `stream.error` (çalışan program yok / pencere yok / aiortc kurulu değil). WS başına tek oturum; yeni teklif eskisini kapatır; `job.exited` (run) ve WS kopması oturumu kapatır. ICE sunucusu yok (yalnız yerel adaylar).
- `GET /api/health` → `stream: {available, reason}`.
