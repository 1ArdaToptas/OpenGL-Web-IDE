import { expect, test } from "@playwright/test";
import {
  alertWith,
  button,
  buildOk,
  createProject,
  ideUrl,
  openIde,
  replaceEditorContent,
  terminal,
  treeFile,
  uniqueName,
} from "./helpers";

test("legacy: oluştur → derle → çalıştır (GPU) → durdur", async ({ page }) => {
  await openIde(page);
  await createProject(page, uniqueName("legacy"), "Legacy");
  await expect(treeFile(page, "main.c")).toBeVisible();
  await expect(page.getByText("Legacy · FreeGLUT")).toBeVisible();

  await buildOk(page);

  await button(page, "Çalıştır").click();
  await expect(page.getByRole("status")).toHaveText("Çalışıyor…");
  await page.waitForTimeout(1500); // sade başlangıç hiçbir şey yazmaz; açık kalmalı (çökmemeli)
  await expect(page.getByRole("status")).toHaveText("Çalışıyor…");
  await expect(button(page, "Derle")).toBeDisabled();

  await button(page, "Durdur").click();
  await expect(terminal(page)).toContainText("Program durduruldu");
  await expect(page.getByRole("status")).toHaveText("Hazır");
  await expect(button(page, "Çalıştır")).toBeEnabled();
});

test("sözdizimi hatası: kaydedilir, Sorunlar'da listelenir, editörde işaretlenir", async ({ page }) => {
  await openIde(page);
  await createProject(page, uniqueName("hata"), "Legacy");

  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\nint bozuk = ;\n");
  await expect(page.getByText("kaydedilmedi").first()).toBeAttached();

  await button(page, "Derle").click();
  const problemsTab = page.getByRole("tab", { name: /Sorunlar \(\d+\)/ });
  await expect(problemsTab).toHaveAttribute("aria-selected", "true", { timeout: 90_000 });
  await expect(page.getByText("kaydedilmedi")).toHaveCount(0); // Derle önce kaydetti

  // gcc iletisi Türkçe gösterilir (özgün İngilizce ileti title'da)
  const problem = page.getByRole("button", { name: /src\/main\.c:\d+:\d+.*öncesinde bir ifade bekleniyordu/ });
  await expect(problem).toBeVisible();
  await problem.click();
  await expect(page.locator(".monaco-editor .squiggly-error").first()).toBeVisible();
});

test("modern: shader düzenle → derle → çalıştır (3.3 core)", async ({ page }) => {
  await openIde(page);
  await createProject(page, uniqueName("modern"), "Modern");
  await expect(page.getByText("Modern · GLFW 3.3")).toBeVisible();

  await treeFile(page, "basic.frag").click();
  await expect(page.getByRole("button", { name: "Kapat basic.frag" })).toBeVisible();
  await replaceEditorContent(
    page,
    "#version 330 core\nin vec3 vColor;\nout vec4 FragColor;\nvoid main() { FragColor = vec4(1.0, 0.5, 0.0, 1.0); }\n",
  );
  await page.keyboard.press("Control+S");
  await expect(page.getByText("kaydedilmedi")).toHaveCount(0);

  await buildOk(page);
  await button(page, "Çalıştır").click();
  await expect(terminal(page)).toContainText("GL_VERSION: 3.3", { timeout: 30_000 });
  await expect(terminal(page)).not.toContainText("shader derleme hatası");
  await button(page, "Durdur").click();
  await expect(terminal(page)).toContainText("Program durduruldu");
});

test("Çalıştır derlenmemiş projeyi önce derler, sonra çalıştırır", async ({ page }) => {
  await openIde(page);
  await createProject(page, uniqueName("derlenmemis"), "Modern");
  await button(page, "Çalıştır").click();
  await expect(terminal(page)).toContainText("Derleme başarılı", { timeout: 90_000 });
  await expect(terminal(page)).toContainText("GL_VERSION: 3.3", { timeout: 30_000 });
  await button(page, "Durdur").click();
  await expect(terminal(page)).toContainText("Program durduruldu");
});

test("galeriden statik örnek: Küp (perspektif + derinlik testi)", async ({ page }) => {
  await openIde(page);
  await createProject(page, uniqueName("kup"), "Modern", "Küp (statik)");
  await expect(treeFile(page, "kup.vert")).toBeVisible();
  await button(page, "Çalıştır").click();
  await expect(terminal(page)).toContainText("GL_VERSION: 3.3", { timeout: 90_000 });
  await expect(terminal(page)).not.toContainText("hata");
  await button(page, "Durdur").click();
  await expect(terminal(page)).toContainText("Program durduruldu");
});

test("Görüntü: çalışan program tarayıcıda görünür, tıklama ve tuş programa ulaşır", async ({ page }) => {
  await openIde(page);
  await createProject(page, uniqueName("goruntu"), "Legacy", "Klavye ve fare (animasyon)");
  await button(page, "Çalıştır").click();
  await expect(terminal(page)).toContainText("GL_RENDERER:", { timeout: 90_000 });

  await page.getByRole("tab", { name: "Görüntü" }).click();
  const video = page.getByLabel(/Program görüntüsü/);
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBe(800);
  // Kare akıyor mu: oynatma süresi ilerlemeli
  const t0 = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(t0 + 0.5);

  // Ortaya tıkla: object-contain yanlarda boşluk bırakır ve görüntü dışındaki tıklamalar bilerek yok sayılır.
  await video.click();
  await video.press("r");
  await page.getByRole("tab", { name: "Terminal" }).click();
  await expect(terminal(page)).toContainText("KEY r");
  await expect(terminal(page)).toContainText(/CLICK \d+ \d+/);

  await button(page, "Durdur").click();
  await expect(terminal(page)).toContainText("Program durduruldu");
});

test("editör VS Code Dark+ renkleriyle boyar; kod ve çıktı alanı yarı yarıya", async ({ page }) => {
  await openIde(page);
  await createProject(page, uniqueName("renk"), "Legacy");
  await replaceEditorContent(
    page,
    [
      "// yorum satiri",
      "#include <GL/freeglut.h>",
      "static float a = 1.5f;",
      "void ciz(void) {",
      "    if (a > 0) glBegin(GL_TRIANGLES);",
      "    GLint v = 2;",
      '    printf("metin");',
      "}",
    ].join("\n"),
  );
  const colors = await page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const span of document.querySelectorAll(".monaco-editor .view-line span span")) {
      const text = span.textContent?.replace(/ /g, " ").trim(); // Monaco boşlukları nbsp çizer
      if (text && !(text in out)) out[text] = getComputedStyle(span).color;
    }
    return out;
  });
  expect(colors).toMatchObject({
    glBegin: "rgb(220, 220, 170)", // fonksiyon
    ciz: "rgb(220, 220, 170)",
    printf: "rgb(220, 220, 170)",
    GL_TRIANGLES: "rgb(79, 193, 255)", // OpenGL sabiti
    if: "rgb(197, 134, 192)", // kontrol akışı
    float: "rgb(86, 156, 214)", // anahtar sözcük/tip
    GLint: "rgb(78, 201, 176)", // OpenGL tipi
    "1.5f": "rgb(181, 206, 168)", // sayı
    "// yorum satiri": "rgb(106, 153, 85)", // yorum
  });

  const code = await page.getByTestId("code-area").boundingBox();
  const output = await page.getByTestId("output-area").boundingBox();
  expect(Math.abs(code!.height - output!.height)).toBeLessThanOrEqual(2);
});

test("dosya oluştur ve sil", async ({ page }) => {
  await openIde(page);
  await createProject(page, uniqueName("dosya"), "Legacy");
  await page.getByRole("button", { name: "Yeni dosya" }).click();
  await page.getByLabel("Dosya yolu").press("End");
  await page.getByLabel("Dosya yolu").pressSequentially("yardimci.h");
  await page.getByLabel("Dosya yolu").press("Enter");
  await expect(treeFile(page, "yardimci.h")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kapat yardimci.h" })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await treeFile(page, "yardimci.h").hover();
  await page.getByRole("button", { name: "Sil yardimci.h" }).click();
  await expect(treeFile(page, "yardimci.h")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kapat yardimci.h" })).toHaveCount(0);
});

test("token: adres çubuğundan silinir; tokensız açılış tarayıcı moduna düşer (ADR-019)", async ({ page }) => {
  await openIde(page);
  expect(page.url()).not.toContain("token");
  await page.reload();
  // Yerel servise tokensız erişim yok; sayfa kurulumsuz tarayıcı modunda açılır.
  await expect(page.getByText(/Tarayıcı modu/)).toBeVisible();
});

test("yanlış token ile arayüz bağlanamaz", async ({ page }) => {
  const bad = ideUrl().replace(/#token=.*/, "#token=yanlis-token-yanlis-token-yanlis-token");
  await page.goto(bad);
  await expect(alertWith(page, "#token=")).toBeVisible();
  await expect(page.getByLabel("Proje", { exact: true })).toHaveCount(0);
});
