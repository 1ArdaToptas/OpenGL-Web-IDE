import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProblemsList } from "./ProblemsList";

const items = [
  { file: "src/main.c", line: 12, col: 5, severity: "error" as const, message: "'x' undeclared" },
  { file: "src/main.c", line: 3, col: 1, severity: "warning" as const, message: "unused" },
  { file: "", line: 0, col: 0, severity: "error" as const, message: "ld returned 1 exit status" },
];

describe("ProblemsList", () => {
  it("konumlu teşhise tıklayınca dosya ve satırı bildirir", async () => {
    const onGoto = vi.fn();
    render(<ProblemsList items={items} onGoto={onGoto} />);
    await userEvent.click(screen.getByRole("button", { name: /src\/main.c:12:5.*undeclared/ }));
    expect(onGoto).toHaveBeenCalledWith("src/main.c", 12, 5);
  });

  it("konumsuz teşhisi tıklanamaz metin olarak gösterir", () => {
    render(<ProblemsList items={items} onGoto={() => {}} />);
    expect(screen.getByTitle("ld returned 1 exit status").closest("button")).toBeNull();
  });

  it("şiddeti metinle de belirtir ve sayar", () => {
    render(<ProblemsList items={items} onGoto={() => {}} />);
    expect(screen.getAllByText("hata")).toHaveLength(2);
    expect(screen.getByText("uyarı")).toBeInTheDocument();
  });

  it("boşken bilgi verir", () => {
    render(<ProblemsList items={[]} onGoto={() => {}} />);
    expect(screen.getByText("Sorun yok")).toBeInTheDocument();
  });

  it("Türkçe açıklamayı gösterir, özgün İngilizce ileti ipucunda kalır", () => {
    render(<ProblemsList items={items} onGoto={() => {}} />);
    const tr = screen.getByText("Bağlayıcı (ld) hata ile bitti (yukarıdaki bağlama hatalarına bakın)");
    expect(tr).toHaveAttribute("title", "ld returned 1 exit status");
  });
});
