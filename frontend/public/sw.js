// Çevrimdışı önbellek (tarayıcı modu, T10.7). Elle yazılmış, bağımlılıksız.
// - assets/ altındaki dosyalar içerik özetli adlara sahip (değişmez): önce önbellek, yoksa ağ + kaydet.
//   Derleyici (~100 MB açılmış) ilk derlemede buraya girer; sonraki açılışlar internetsiz derleyebilir.
// - Sayfanın kendisi (index.html): önce ağ (güncellemeler hemen gelir), ağ yoksa son kaydedilen kopya.
// - Başka her şey (ör. yerel moddaki /api, /ws) dokunulmadan geçer.
const CACHE = "oglide-v1";
const BASE = new URL("./", self.location).pathname; // ör. /OpenGL-Web-IDE/
const ASSETS = `${BASE}assets/`;
const PAGE = `${BASE}index.html`;

// İlk ziyaretteki sayfa yüklemesi çalışan kurulmadan olur ve önbelleğe girmez: kurulurken sayfayı kaydet.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(BASE, { cache: "no-cache" });
        if (res.ok) {
          const html = await res.clone().text();
          await cache.put(PAGE, res);
          // Sayfanın doğrudan yüklediği betik/stil dosyaları da ilk yüklemede çalışandan önce indi
          const refs = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((m) => new URL(m[1], self.location).href);
          await cache.addAll([...new Set(refs)]);
        }
      } catch {
        /* çevrimdışı kurulum: sonraki ziyarette kaydedilir */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim(); // ilk ziyarette de derleyici indirmesi önbelleğe girsin
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate" && (url.pathname === BASE || url.pathname === PAGE)) {
    event.respondWith(networkFirstPage(req));
  } else if (url.pathname.startsWith(ASSETS)) {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirstPage(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(PAGE, res.clone());
    return res;
  } catch {
    return (await cache.match(PAGE, { ignoreVary: true })) ?? Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") await cache.put(req, res.clone());
  return res;
}
