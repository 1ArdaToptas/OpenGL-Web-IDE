import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileTree } from "./FileTree";

const entries = [
  { path: "src", type: "dir" as const },
  { path: "src/main.c", type: "file" as const },
  { path: "src/util", type: "dir" as const },
  { path: "src/util/math.h", type: "file" as const },
  { path: "shaders", type: "dir" as const },
  { path: "shaders/basic.vert", type: "file" as const },
];

describe("FileTree", () => {
  it("dosyaları adlarıyla, dizinleri başlık olarak gösterir", () => {
    render(<FileTree entries={entries} active={null} dirty={[]} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: "main.c" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "math.h" })).toBeInTheDocument();
    expect(screen.getByText("util")).toBeInTheDocument();
  });

  it("tıklanan dosyanın tam yolunu bildirir", async () => {
    const onOpen = vi.fn();
    render(<FileTree entries={entries} active={null} dirty={[]} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "basic.vert" }));
    expect(onOpen).toHaveBeenCalledWith("shaders/basic.vert");
  });

  it("aktif dosyayı aria-current ile işaretler", () => {
    render(<FileTree entries={entries} active="src/main.c" dirty={[]} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: "main.c" })).toHaveAttribute("aria-current", "true");
  });

  it("kaydedilmemiş dosyayı metinle de belirtir (yalnız renk değil)", () => {
    render(<FileTree entries={entries} active={null} dirty={["src/main.c"]} onOpen={() => {}} />);
    expect(screen.getByText("kaydedilmedi")).toBeInTheDocument();
  });

  it("boşken yönlendirici mesaj gösterir", () => {
    render(<FileTree entries={[]} active={null} dirty={[]} onOpen={() => {}} />);
    expect(screen.getByText(/proje seçin/i)).toBeInTheDocument();
  });
});
