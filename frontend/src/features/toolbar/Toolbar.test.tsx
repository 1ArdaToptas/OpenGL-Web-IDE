import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toolbar, type ToolbarProps } from "./Toolbar";

function setup(over: Partial<ToolbarProps> = {}) {
  const props: ToolbarProps = {
    projects: [
      { name: "ucgen", profile: "legacy" },
      { name: "kare", profile: "modern" },
    ],
    current: { name: "ucgen", profile: "legacy" },
    flags: { canBuild: true, canRun: true, canStop: false },
    phase: "idle",
    config: "Debug",
    onSelectProject: vi.fn(),
    onNewProject: vi.fn(),
    onConfig: vi.fn(),
    onBuild: vi.fn(),
    onRun: vi.fn(),
    onStop: vi.fn(),
    ...over,
  };
  render(<Toolbar {...props} />);
  return props;
}

describe("Toolbar", () => {
  it("butonlar bayraklara göre etkin/pasif", () => {
    setup({ flags: { canBuild: false, canRun: false, canStop: true } });
    expect(screen.getByRole("button", { name: "Derle" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Çalıştır" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Durdur" })).toBeEnabled();
  });

  it("tıklamalar ilgili işleyicileri çağırır", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: "Derle" }));
    await userEvent.click(screen.getByRole("button", { name: "Çalıştır" }));
    expect(p.onBuild).toHaveBeenCalledOnce();
    expect(p.onRun).toHaveBeenCalledOnce();
  });

  it("proje seçimi ve yapılandırma değişikliği bildirilir", async () => {
    const p = setup();
    await userEvent.selectOptions(screen.getByLabelText("Proje"), "kare");
    expect(p.onSelectProject).toHaveBeenCalledWith("kare");
    await userEvent.selectOptions(screen.getByLabelText("Yapılandırma"), "Release");
    expect(p.onConfig).toHaveBeenCalledWith("Release");
  });

  it("profil rozetini metinle gösterir", () => {
    setup();
    expect(screen.getByText("Legacy · FreeGLUT")).toBeInTheDocument();
  });

  it("iş durumunu canlı bölgede duyurur", () => {
    setup({ phase: "building", flags: { canBuild: false, canRun: false, canStop: true } });
    expect(screen.getByRole("status")).toHaveTextContent("Derleniyor…");
  });

  it("yeni proje butonu", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: "Yeni proje" }));
    expect(p.onNewProject).toHaveBeenCalledOnce();
  });
});
