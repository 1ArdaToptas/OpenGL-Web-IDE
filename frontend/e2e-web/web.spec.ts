import { type Page, expect, test } from "@playwright/test";

const BG = [26, 26, 31];
const near = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
let n = 0;
const uniqueName = (p: string) => `${p}-${Date.now().toString(36)}-${n++}`;
const terminal = (page: Page) => page.locator(".xterm-rows");
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

async function openWeb(page: Page) {
  await page.goto("/");
  await expect(page.getByText(/Tarayıcı modu/)).toBeVisible();
}

async function createProject(page: Page, name: string, example?: string) {
  await page.getByRole("button", { name: "Yeni proje" }).click();
  const d = page.getByRole("dialog", { name: "Yeni proje" });
  await d.getByLabel("Proje adı").fill(name);
  if (example) await d.getByLabel("Örnek").selectOption({ label: example });
  await d.getByRole("button", { name: "Oluştur" }).click();
  await expect(d).toBeHidden();
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
}

/** Editöre metin ekler. Firefox'ta Playwright'ın insertText'i Monaco'da metni iki kez ekliyor (test aracı
 *  tuhaflığı; gerçek yazma etkilenmez) — orada gerçek tuş vuruşları kullanılır. */
async function insertCode(page: Page, text: string) {
  if (test.info().project.name === "firefox") {
    // Gerçek yazmada Monaco parantez/tırnak kapatır ve girinti ekler; satır satır yazıp otomatik ekleri sileriz
    const lines = text.split("\n");
    for (const [i, line] of lines.entries()) {
      if (line) await page.keyboard.type(line);
      await page.keyboard.press("Shift+End");
      await page.keyboard.press("Delete");
      if (i < lines.length - 1) await page.keyboard.press("Enter");
    }
  } else {
    await page.keyboard.insertText(text);
  }
}

async function showTerminal(page: Page) {
  await page.getByRole("tab", { name: "Terminal" }).click();
}

/** Canvas ekran görüntüsündeki merkez piksel (program OffscreenCanvas'ta; doğrudan okunamaz). */
async function canvasCenter(page: Page): Promise<number[]> {
  const png = (await page.getByLabel(/Program penceresi/).screenshot()).toString("base64");
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(img.width >> 1, img.height >> 1, 1, 1).data.slice(0, 3)];
  }, png);
}

test("kurulumsuz: tarayıcıda derler, ziyaretçinin GPU'sunda çizer", async ({ page }) => {
  await openWeb(page);
  await createProject(page, uniqueName("ucgen"));
  await button(page, "Çalıştır").click(); // kaydet → derle (tarayıcıda clang) → çalıştır
  await expect(page.getByRole("tab", { name: "Görüntü" })).toHaveAttribute("aria-selected", "true", { timeout: 120_000 });
  await expect(page.getByLabel(/Program penceresi/)).toBeVisible();
  // Başlangıç: turuncu dolu üçgen (masaüstü GPU referansı 255,128,0)
  await expect.poll(async () => near(await canvasCenter(page), [255, 128, 0], 12), { timeout: 20_000 }).toBe(true);
  await showTerminal(page);
  await expect(terminal(page)).toContainText("clang → WebAssembly");
  await button(page, "Durdur").click();
  await expect(terminal(page)).toContainText("Program durduruldu");
});

test("sonsuz döngü sayfayı dondurmaz; Durdur anında çalışır", async ({ page }) => {
  await openWeb(page);
  await createProject(page, uniqueName("dongu"));
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await insertCode(page, '#include <stdio.h>\nint main(void) { printf("basladi\\n"); for (;;) {} }\n');
  await button(page, "Çalıştır").click();
  await expect(page.getByRole("status")).toHaveText("Çalışıyor…", { timeout: 120_000 });
  // Ana iş parçacığı serbest: arayüz tepki veriyor
  await page.getByRole("tab", { name: "Terminal" }).click();
  await expect(terminal(page)).toContainText("basladi");
  const t0 = Date.now();
  await button(page, "Durdur").click();
  await expect(terminal(page)).toContainText("Program durduruldu");
  expect(Date.now() - t0).toBeLessThan(3000);
  await expect(button(page, "Çalıştır")).toBeEnabled();
});

test("klavye ve fare tarayıcıdaki programa ulaşır", async ({ page }) => {
  await openWeb(page);
  await createProject(page, uniqueName("girdi"), "Klavye ve fare (animasyon)");
  await button(page, "Çalıştır").click();
  const canvas = page.getByLabel(/Program penceresi/);
  await expect(canvas).toBeVisible({ timeout: 120_000 });
  await showTerminal(page);
  await expect(terminal(page)).toContainText("Tuşlar:");
  await page.getByRole("tab", { name: "Görüntü" }).click();
  await canvas.click();
  await canvas.press("r");
  await showTerminal(page);
  await expect(terminal(page)).toContainText(/CLICK \d+ \d+/);
  await expect(terminal(page)).toContainText("KEY r");
  await button(page, "Durdur").click();
});

test("derleme hatası Sorunlar paneline düşer", { tag: "@tum-tarayicilar" }, async ({ page }) => {
  await openWeb(page);
  await createProject(page, uniqueName("hata"));
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+End");
  await insertCode(page, "\nint bozuk = ;\n");
  await button(page, "Derle").click();
  await expect(page.getByRole("tab", { name: /Sorunlar \(\d+\)/ })).toHaveAttribute("aria-selected", "true", { timeout: 120_000 });
  await expect(page.getByRole("button", { name: /src\/main\.c:\d+:\d+.*Burada bir ifade bekleniyordu/ })).toBeVisible();
  await expect(page.getByTitle("expected expression")).toBeVisible(); // özgün ileti ipucunda

  // Editörde hatalı satırın üzerine gelince Türkçe açıklama + özgün ileti
  await page.locator(".monaco-editor .squiggly-error").first().hover({ force: true });
  const hover = page.locator(".monaco-hover").filter({ hasText: "Burada bir ifade bekleniyordu" });
  await expect(hover).toBeVisible({ timeout: 10_000 });
  await expect(hover).toContainText("(expected expression)");
});

async function createModern(page: Page, name: string, example?: string) {
  await page.getByRole("button", { name: "Yeni proje" }).click();
  const d = page.getByRole("dialog", { name: "Yeni proje" });
  await d.getByLabel("Proje adı").fill(name);
  await d.getByLabel(/^Modern/).check();
  if (example) await d.getByLabel("Örnek").selectOption({ label: example });
  await d.getByRole("button", { name: "Oluştur" }).click();
  await expect(d).toBeHidden();
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
}


test("modern: GLFW + shader + VAO/VBO/EBO tarayıcıda; merkez piksel masaüstüyle aynı", async ({ page }) => {
  await openWeb(page);
  await createModern(page, uniqueName("kare"));
  await button(page, "Çalıştır").click();
  await expect(page.getByLabel(/Program penceresi/)).toBeVisible({ timeout: 120_000 });
  // Dönen kare: merkez rengi dönüşten bağımsız (masaüstü GPU referansı 127,0,127)
  await expect.poll(async () => near(await canvasCenter(page), [127, 0, 127], 12), { timeout: 20_000 }).toBe(true);
  await showTerminal(page);
  await expect(terminal(page)).toContainText("GL_VERSION: 3.3 Core");
  await button(page, "Durdur").click();
  await expect(terminal(page)).toContainText("Program durduruldu");
});

test("modern: Küp (perspektif + derinlik testi) çizilir", async ({ page }) => {
  await openWeb(page);
  await createModern(page, uniqueName("kup"), "Küp (statik)");
  await button(page, "Çalıştır").click();
  await expect(page.getByLabel(/Program penceresi/)).toBeVisible({ timeout: 120_000 });
  await expect.poll(async () => near(await canvasCenter(page), BG, 6), { timeout: 20_000 }).toBe(false);
  await showTerminal(page);
  await expect(terminal(page)).not.toContainText("hata");
  await button(page, "Durdur").click();
});

test("modern: shader hatası programın kendi günlüğünde, doğru satırla görünür", async ({ page }) => {
  await openWeb(page);
  await createModern(page, uniqueName("shader"));
  await page.getByRole("list", { name: "Proje dosyaları" }).getByRole("button", { name: "basic.frag", exact: true }).click();
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await insertCode(page, "#version 330 core\nout vec4 FragColor;\nvoid main() { FragColor = vec4(1.0) + yok; }\n");
  await button(page, "Çalıştır").click();
  await showTerminal(page);
  await expect(terminal(page)).toContainText("shaders/basic.frag: shader derleme hatası", { timeout: 120_000 });
  await expect(terminal(page)).toContainText(/0:3: '?yok'?/); // #line ile öğrencinin 3. satırı
  await expect(terminal(page)).toContainText("Program çıkış kodu 1");
});

test("modern: GLFW tuş/fare geri çağırmaları; Escape while döngüsünü bitirir", async ({ page }) => {
  await openWeb(page);
  await createModern(page, uniqueName("glfwgirdi"));
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await insertCode(page, 
    [
      "#include <glad/gl.h>",
      "#include <GLFW/glfw3.h>",
      "#include <stdio.h>",
      "static void key(GLFWwindow *w, int k, int sc, int action, int mods) {",
      "    (void)sc; (void)mods;",
      '    if (action == GLFW_PRESS) printf("KEY %d\\n", k);',
      "    if (k == GLFW_KEY_ESCAPE && action == GLFW_PRESS) glfwSetWindowShouldClose(w, GLFW_TRUE);",
      "}",
      "static void mouse(GLFWwindow *w, int b, int action, int mods) {",
      "    (void)mods; double x, y; glfwGetCursorPos(w, &x, &y);",
      '    if (action == GLFW_PRESS) printf("CLICK %d %.0f %.0f\\n", b, x, y);',
      "}",
      "int main(void) {",
      "    glfwInit();",
      '    GLFWwindow *w = glfwCreateWindow(800, 600, "Girdi", NULL, NULL);',
      "    glfwMakeContextCurrent(w); gladLoadGL(glfwGetProcAddress);",
      "    glfwSetKeyCallback(w, key); glfwSetMouseButtonCallback(w, mouse);",
      '    printf("hazir\\n");',
      "    while (!glfwWindowShouldClose(w)) {",
      "        glClearColor(0.2f, 0.3f, 0.3f, 1.0f); glClear(GL_COLOR_BUFFER_BIT);",
      "        glfwSwapBuffers(w); glfwPollEvents();",
      "    }",
      '    printf("bitti\\n"); glfwTerminate(); return 0;',
      "}",
    ].join("\n"),
  );
  await button(page, "Çalıştır").click();
  const canvas = page.getByLabel(/Program penceresi/);
  await expect(canvas).toBeVisible({ timeout: 120_000 });
  // Viewport + glClear doğru: temizleme rengi (0.2, 0.3, 0.3) → (51, 77, 77)
  await expect.poll(async () => near(await canvasCenter(page), [51, 77, 77], 3), { timeout: 20_000 }).toBe(true);
  await canvas.click();
  await canvas.press("w");
  await canvas.press("Escape");
  await showTerminal(page);
  await expect(terminal(page)).toContainText(/CLICK 0 \d+ \d+/);
  await expect(terminal(page)).toContainText("KEY 87");
  await expect(terminal(page)).toContainText("KEY 256");
  await expect(terminal(page)).toContainText("bitti");
  await expect(terminal(page)).toContainText("Program çıkış kodu 0");
});

test("projeler tarayıcıda saklanır (yenileme sonrası kalır)", { tag: "@tum-tarayicilar" }, async ({ page }) => {
  await openWeb(page);
  const name = uniqueName("kalici");
  await createProject(page, name);
  await page.reload();
  await expect(page.getByText(/Tarayıcı modu/)).toBeVisible();
  await expect(page.getByLabel("Proje", { exact: true }).locator("option", { hasText: name })).toHaveCount(1);
});

test("kod/çıktı bölücüsü sürüklenir (60/40), yenilemede korunur, çift tıkla yarıya döner", { tag: "@tum-tarayicilar" }, async ({ page }) => {
  await openWeb(page);
  await createProject(page, uniqueName("bolucu"));
  const sep = page.getByRole("separator", { name: "Kod ve çıktı bölücüsü" });
  const heights = async () => {
    const c = (await page.getByTestId("code-area").boundingBox())!.height;
    const o = (await page.getByTestId("output-area").boundingBox())!.height;
    return c / (c + o);
  };
  expect(await heights()).toBeCloseTo(0.5, 1);

  const main = (await page.getByRole("main").boundingBox())!;
  const box = (await sep.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, main.y + main.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await expect(sep).toHaveAttribute("aria-valuenow", "60");
  expect(await heights()).toBeCloseTo(0.6, 1);

  await page.reload();
  await expect(page.getByRole("separator", { name: "Kod ve çıktı bölücüsü" })).toHaveAttribute("aria-valuenow", "60");

  await page.getByRole("separator", { name: "Kod ve çıktı bölücüsü" }).dblclick();
  await expect(page.getByRole("separator", { name: "Kod ve çıktı bölücüsü" })).toHaveAttribute("aria-valuenow", "50");
});

test("ilk derlemede derleyici indirme ilerlemesi durum çubuğunda görünür, bitince kaybolur", async ({ page }) => {
  test.skip(test.info().project.name !== "edge", "ağ yavaşlatma CDP ile; yalnız Chromium");
  // Yavaş bağlantı taklidi (~25 MB/sn): yerel sunucuda indirme göz açıp kapayana kadar biterdi
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 20,
    downloadThroughput: 25 * 1024 * 1024,
    uploadThroughput: 1024 * 1024,
  });
  await openWeb(page);
  await createProject(page, uniqueName("indir"));
  await button(page, "Çalıştır").click();
  const bar = page.getByRole("progressbar", { name: "Derleyici indiriliyor" });
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/yalnız ilk seferde\) %\d+/)).toBeVisible();
  await expect(page.getByLabel(/Program penceresi/)).toBeVisible({ timeout: 120_000 });
  await expect(bar).toBeHidden();
});

test("OffscreenCanvas'sız tarayıcı açılışta uyarılır; çalıştırma boş ekran yerine hata verir", { tag: "@tum-tarayicilar" }, async ({ page }) => {
  // Desteklemeyen tarayıcıyı taklit et (Edge/Firefox'ta); Playwright WebKit'te zaten yok
  await page.addInitScript(() => {
    delete (HTMLCanvasElement.prototype as { transferControlToOffscreen?: unknown }).transferControlToOffscreen;
  });
  await openWeb(page);
  await expect(page.getByRole("alert").filter({ hasText: "eksik: OffscreenCanvas" })).toBeVisible();
  await createProject(page, uniqueName("destek"));
  await button(page, "Çalıştır").click();
  await expect(page.getByRole("tab", { name: "Terminal" })).toHaveAttribute("aria-selected", "true", { timeout: 120_000 });
  await expect(terminal(page)).toContainText("OffscreenCanvas desteklemiyor");
  await expect(page.getByRole("status")).toHaveText("Hazır");
});


test("bir kez açılıp derlendikten sonra internet olmadan da açılır, derler ve çalışır", async ({ page, context }) => {
  await openWeb(page);
  await page.evaluate(() => navigator.serviceWorker.ready); // önbellekleyici etkin
  await createProject(page, uniqueName("cevrimdisi"));
  await button(page, "Çalıştır").click(); // derleyici indirilir → önbelleğe girer
  await expect(page.getByLabel(/Program penceresi/)).toBeVisible({ timeout: 120_000 });
  await button(page, "Durdur").click();

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByText(/Tarayıcı modu/)).toBeVisible();
    await page.getByRole("button", { name: "Yeni proje" }).click();
    const d = page.getByRole("dialog", { name: "Yeni proje" });
    await d.getByLabel("Proje adı").fill(uniqueName("internetsiz"));
    await d.getByRole("button", { name: "Oluştur" }).click();
    await expect(page.locator(".monaco-editor").first()).toBeVisible();
    await button(page, "Çalıştır").click();
    await expect.poll(async () => near(await canvasCenter(page), [255, 128, 0], 12), { timeout: 60_000 }).toBe(true);
  } finally {
    await context.setOffline(false);
  }
});
