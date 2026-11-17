import { type Page, expect } from "@playwright/test";

export const ideUrl = () => {
  const url = process.env.OGLIDE_E2E_URL;
  if (!url) throw new Error("OGLIDE_E2E_URL yok (global-setup çalışmadı)");
  return url;
};

let counter = 0;
export const uniqueName = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${counter++}`;

export async function openIde(page: Page) {
  await page.goto(ideUrl());
  await expect(page.getByLabel("Proje", { exact: true })).toBeVisible();
}

export async function createProject(page: Page, name: string, profile: "Legacy" | "Modern", example?: string) {
  await page.getByRole("button", { name: "Yeni proje" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni proje" });
  await dialog.getByLabel("Proje adı").fill(name);
  await dialog.getByLabel(new RegExp(`^${profile}`)).check();
  if (example) await dialog.getByLabel("Örnek").selectOption({ label: example });
  await dialog.getByRole("button", { name: "Oluştur" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Proje", { exact: true })).toHaveValue(name);
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
  await expect(page.getByText("Bağlı", { exact: true })).toBeVisible();
}

/** xterm DOM renderer'ın görünen satırları (son çıktı burada). */
export const terminal = (page: Page) => page.locator(".xterm-rows");

export const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

/** Dosya ağacındaki dosya (editör sekmesi aynı adlı bir buton daha içerir). */
export const treeFile = (page: Page, name: string) =>
  page.getByRole("list", { name: "Proje dosyaları" }).getByRole("button", { name, exact: true });

/** Uygulamanın uyarı bandı; Monaco'nun boş ekran okuyucu `role=alert` bölgeleri hariç. */
export const alertWith = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });

export async function buildOk(page: Page) {
  await button(page, "Derle").click();
  await expect(terminal(page)).toContainText("Derleme başarılı", { timeout: 90_000 });
  await expect(button(page, "Çalıştır")).toBeEnabled();
}

/** Editörde içeriği klavye ile değiştirir; insertText otomatik parantez tamamlamayı atlar. */
export async function replaceEditorContent(page: Page, text: string) {
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(text);
}
