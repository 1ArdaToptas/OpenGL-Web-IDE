import { describe, expect, it } from "vitest";
import { toVideoCoords } from "./streamLogic";

// object-contain: 800x600 video, 1000x500 kutuda → yükseklik sığar (ölçek 5/6), yatayda boşluk
const rect = { left: 100, top: 50, width: 1000, height: 500 };

describe("toVideoCoords", () => {
  it("kutu ortası video ortasına eşlenir", () => {
    expect(toVideoCoords(600, 300, rect, 800, 600)).toEqual({ x: 400, y: 300 });
  });

  it("kenar boşluklu (letterbox) alanda ölçeği hesaba katar", () => {
    // içerik genişliği 800*5/6 = 666.67, sol boşluk (1000-666.67)/2 = 166.67
    const p = toVideoCoords(100 + 166.67, 50, rect, 800, 600)!;
    expect(p.x).toBeCloseTo(0, 0);
    expect(p.y).toBe(0);
  });

  it("görüntü dışındaki (boşluk) tıklamalar null döner", () => {
    expect(toVideoCoords(120, 300, rect, 800, 600)).toBeNull();
    expect(toVideoCoords(1090, 300, rect, 800, 600)).toBeNull();
  });

  it("video boyutu bilinmiyorsa null", () => {
    expect(toVideoCoords(600, 300, rect, 0, 0)).toBeNull();
  });
});
