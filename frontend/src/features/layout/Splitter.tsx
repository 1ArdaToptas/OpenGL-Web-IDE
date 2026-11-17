// Kod ve çıktı alanları arasındaki sürüklenebilir yatay bölücü. Oran = kod alanının yüzdesi.
import { useRef } from "react";

const MIN = 10;
const MAX = 90;
const STEP = 5;
const KEY = "oglide.split";

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.round(Math.min(MAX, Math.max(MIN, value)) * 10) / 10;
}

export function ratioFromPointer(clientY: number, bounds: { top: number; height: number }): number {
  if (bounds.height <= 0) return 50;
  return clampRatio(((clientY - bounds.top) / bounds.height) * 100);
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // gizli pencere / engellenmiş site verisi
  }
}

/** Kullanıcının son seçtiği oran (yalnız bu tarayıcıda; yoksa 50). */
export function loadRatio(storage: Storage | undefined = defaultStorage()): number {
  try {
    const raw = storage?.getItem(KEY);
    return raw == null ? 50 : clampRatio(Number(raw));
  } catch {
    return 50;
  }
}

export function saveRatio(ratio: number, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(KEY, String(clampRatio(ratio)));
  } catch {
    /* kaydedilemezse oran yalnız bu oturumda geçerli */
  }
}

export function Splitter({
  ratio,
  onChange,
  getBounds,
}: {
  ratio: number;
  onChange: (ratio: number) => void;
  getBounds: () => { top: number; height: number } | undefined;
}) {
  const dragging = useRef(false);

  const move = (clientY: number) => {
    const bounds = getBounds();
    if (bounds) onChange(ratioFromPointer(clientY, bounds));
  };

  return (
    <div
      role="separator"
      aria-label="Kod ve çıktı bölücüsü"
      aria-orientation="horizontal"
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={Math.round(ratio)}
      tabIndex={0}
      title="Sürükleyerek boyutlandır · çift tık: yarı yarıya"
      className="group relative h-1.5 shrink-0 cursor-row-resize touch-none bg-border outline-none hover:bg-accent focus-visible:bg-accent"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId); // canvas/video üzerinde de takip et
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (dragging.current) move(e.clientY);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onDoubleClick={() => onChange(50)}
      onKeyDown={(e) => {
        const delta = { ArrowUp: -STEP, ArrowDown: STEP }[e.key];
        if (delta === undefined) return;
        e.preventDefault();
        onChange(clampRatio(ratio + delta));
      }}
    />
  );
}
