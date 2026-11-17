// Spike doğrulaması: başsız Edge'de (rAF kısılmaz) örnekleri tarayıcıda derleyip çalıştırır, pikselleri ölçer.
// Kullanım: node verify.mjs  (statik sunucu http://127.0.0.1:8800 depo kökünü sunmalı)
import { chromium } from "../../frontend/node_modules/@playwright/test/index.mjs";

const BASE = "http://127.0.0.1:8800/spikes/browser/index.html";
const BG = [26, 26, 31];
const near = (a, b, tol = 10) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1700, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function runExample(path, frames) {
  await page.goto(frames ? `${BASE}?frames=${frames}` : BASE);
  await page.waitForFunction(() => typeof window.__run === "function");
  const t0 = Date.now();
  await page.evaluate((p) => window.__run(p), path);
  return Date.now() - t0;
}
const waitResult = () => page.waitForFunction(() => window.__metrics.lastResult, null, { timeout: 30_000 });
const pixel = (x, y) => page.evaluate(([x, y]) => window.__pixel(x, y), [x, y]);
const output = () => page.evaluate(() => window.__output());
const metrics = () => page.evaluate(() => window.__metrics);

// 1) Dönen üçgen: soğuk önbellek, ilk derleme (derleyici indirme dahil) + yön kontrolü
const coldMs = await runExample("../../templates/legacy-freeglut/src/main.c", 10);
await waitResult();
const out1 = await output();
const px1 = out1.match(/OGLIDE_PIXEL (\d+) (\d+) (\d+)/)?.slice(1).map(Number);
check("üçgen: merkez piksel ≈ yerel (69,70,116)", px1 && near(px1, [69, 70, 116], 3), px1);
check("üçgen: GL hatası 0 ve 10 karede çıkış", /OGLIDE_GLERROR 0/.test(out1) && (await metrics()).lastResult === "exit:0", (await metrics()).lastResult);
const bottomLeft = await pixel(220, 165); // NDC(-0.45,-0.45): dik üçgenin içinde
const topLeft = await pixel(220, 420); // NDC(-0.45,0.4): dik üçgenin dışında
check("üçgen: yön doğru (tepe yukarıda)", !near(bottomLeft, BG, 4) && near(topLeft, BG, 4), { bottomLeft, topLeft });
check("üçgen: ilk açılış (soğuk önbellek, derleyici dahil)", true, `${coldMs} ms, ${JSON.stringify(await metrics())}`);

// 2) Şekiller: tek tampon + glFlush, tel kafes, kalın çizgi, nokta, yarı saydam karışım
await runExample("../../templates/legacy-freeglut/examples/sekiller/src/main.c", 1);
await waitResult();
const out2 = await output();
const px2 = out2.match(/OGLIDE_PIXEL (\d+) (\d+) (\d+)/)?.slice(1).map(Number);
check("şekiller: merkez kare ≈ yerel (51,204,76)", px2 && near(px2, [51, 204, 76], 3), px2);
const hexInside = await pixel(160, 465); // altıgen merkezi: tel kafes → boş olmalı
// (1,0)-(0.5,0.866) kenarının ortası; 2 px kenar yumuşatmalı çizgi piksel sınırına düşebilir → 5x5 içinde en dolu piksel
let hexEdge = [0, 0, 0];
for (let dx = -2; dx <= 2; dx++)
  for (let dy = -2; dy <= 2; dy++) {
    const p = await pixel(250 + dx, 504 + dy);
    if (p[0] + p[1] > hexEdge[0] + hexEdge[1]) hexEdge = p;
  }
check("şekiller: glPolygonMode(GL_LINE) içi boş", near(hexInside, BG, 4), hexInside);
check("şekiller: altıgen kenarı sarı (255,204,51)", near(hexEdge, [255, 204, 51], 40), hexEdge);
const blend = await pixel(648, 225); // iki yarı saydam karenin kesişimi
check("şekiller: glColor4f + karışım ≈ (70,6,135)", near(blend, [70, 6, 135], 12), blend);
const point = await pixel(400, 480); // NDC(0,0.6) → glPointSize(6) noktası (0.5,0.6)? kontrol: (600,480)
const pointPx = await pixel(600, 480);
check("şekiller: glPointSize(6) noktası beyaz", near(pointPx, [255, 255, 255], 20), { pointPx, bos: point });

// 3) Etkileşim: tıklama ve tuş programa ulaşır
await runExample("../../templates/legacy-freeglut/examples/etkilesim/src/main.c");
await page.waitForFunction(() => window.__output().includes("Tuşlar:"));
const box = await page.locator("#c").boundingBox();
// Canvas'ın 1 px kenarlığı var: içerik alanı kutunun 1 px içinden başlar.
await page.mouse.click(box.x + 1 + 123, box.y + 1 + 456);
await page.keyboard.press("r");
await page.waitForFunction(() => /KEY r/.test(window.__output()), null, { timeout: 5000 }).catch(() => {});
const out3 = await output();
check("etkileşim: CLICK 123 456 ve KEY r", /CLICK 123 456/.test(out3) && /KEY r/.test(out3), out3.split("\n").filter((l) => /CLICK|KEY/.test(l)));

// 4) Derleme hatası anlaşılır gelir
await page.evaluate(() => { document.getElementById("src").value = "int main(void) { return x; }\n"; });
await page.evaluate(() => { window.__metrics.lastResult = undefined; return window.__run(); });
const out4 = await output();
check("derleme hatası: dosya:satır:sütun ile", /main\.c:1:\d+: error/.test(out4), out4.split("\n")[0]);

// 5) Desteklenmeyen fonksiyon: derleyici açıkça söyler
await page.evaluate(() => {
  document.getElementById("src").value = "#include <GL/freeglut.h>\nint main(void){ glNormal3f(0,0,1); return 0; }\n";
});
await page.evaluate(() => window.__run());
const out5 = await output();
check("desteklenmeyen fonksiyon: derleme hatası", /glNormal3f/.test(out5) && /error/.test(out5), out5.split("\n")[0]);

const warm = (await metrics()).compileMs;
check("sıcak derleme süresi", true, `${warm} ms`);
check("sayfa hatası yok", errors.length === 0, errors);

await browser.close();
for (const r of results) console.log(`${r.ok ? "GEÇTİ " : "KALDI "} ${r.name} :: ${JSON.stringify(r.detail)}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
