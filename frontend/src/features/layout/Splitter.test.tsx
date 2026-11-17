import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Splitter, clampRatio, loadRatio, ratioFromPointer, saveRatio } from "./Splitter";

describe("oran yardımcıları", () => {
  it("oranı %10–%90 arasına sıkıştırır ve yuvarlar", () => {
    expect(clampRatio(5)).toBe(10);
    expect(clampRatio(95)).toBe(90);
    expect(clampRatio(61.26)).toBe(61.3);
    expect(clampRatio(Number.NaN)).toBe(50);
  });

  it("işaretçi konumunu kap içindeki yüzdeye çevirir", () => {
    expect(ratioFromPointer(260, { top: 100, height: 400 })).toBe(40);
    expect(ratioFromPointer(0, { top: 100, height: 400 })).toBe(10);
    expect(ratioFromPointer(200, { top: 100, height: 0 })).toBe(50);
  });

  it("kayıtlı oranı okur; bozuk veya erişilemeyen depoda 50 döner", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(loadRatio(storage)).toBe(50);
    saveRatio(70, storage);
    expect(loadRatio(storage)).toBe(70);
    store.set("oglide.split", "abc");
    expect(loadRatio(storage)).toBe(50);
    const broken = { getItem: () => { throw new Error("yasak"); }, setItem: () => { throw new Error("yasak"); } };
    expect(loadRatio(broken)).toBe(50);
    expect(() => saveRatio(30, broken)).not.toThrow();
  });
});

describe("<Splitter>", () => {
  it("erişilebilir ayırıcıdır; ok tuşları %5 değiştirir, çift tık 50'ye döner", () => {
    const onChange = vi.fn();
    render(<Splitter ratio={50} onChange={onChange} getBounds={() => ({ top: 0, height: 100 })} />);
    const sep = screen.getByRole("separator", { name: "Kod ve çıktı bölücüsü" });
    expect(sep).toHaveAttribute("aria-orientation", "horizontal");
    expect(sep).toHaveAttribute("aria-valuenow", "50");
    fireEvent.keyDown(sep, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(55);
    fireEvent.keyDown(sep, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(45);
    fireEvent.doubleClick(sep);
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  it("sürükleme işaretçinin konumuna göre oran verir", () => {
    const onChange = vi.fn();
    render(<Splitter ratio={50} onChange={onChange} getBounds={() => ({ top: 0, height: 500 })} />);
    const sep = screen.getByRole("separator");
    fireEvent.pointerDown(sep, { clientY: 250, pointerId: 1, button: 0 });
    fireEvent.pointerMove(sep, { clientY: 100, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(20);
    fireEvent.pointerUp(sep, { clientY: 100, pointerId: 1 });
    onChange.mockClear();
    fireEvent.pointerMove(sep, { clientY: 400, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled(); // bırakınca sürükleme biter
  });
});
