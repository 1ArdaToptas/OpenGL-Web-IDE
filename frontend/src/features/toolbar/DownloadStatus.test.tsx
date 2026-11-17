import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DownloadStatus, createProgressStore } from "./DownloadStatus";

describe("createProgressStore", () => {
  it("değeri saklar ve aboneleri bilgilendirir; indirme bitince temizlenir", () => {
    const store = createProgressStore();
    const fn = vi.fn();
    const off = store.subscribe(fn);
    expect(store.get()).toBeNull();
    store.set(3, 10);
    expect(store.get()).toEqual({ done: 3, total: 10 });
    expect(fn).toHaveBeenCalledTimes(1);
    store.set(10, 10);
    expect(store.get()).toBeNull(); // tamamlandı → gizle
    off();
    store.set(1, 10);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("boyutu bilinmeyen (total 0) indirmeyi göstermez", () => {
    const store = createProgressStore();
    store.set(5, 0);
    expect(store.get()).toBeNull();
  });
});

describe("<DownloadStatus>", () => {
  it("indirme sürerken yüzdeyle ilerleme çubuğu gösterir", () => {
    const store = createProgressStore();
    render(<DownloadStatus store={store} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    act(() => store.set(12_300_000, 26_700_000));
    const bar = screen.getByRole("progressbar", { name: "Derleyici indiriliyor" });
    expect(bar).toHaveAttribute("aria-valuenow", "46");
    expect(screen.getByText(/yalnız ilk seferde/)).toHaveTextContent("%46");
    act(() => store.set(26_700_000, 26_700_000));
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
