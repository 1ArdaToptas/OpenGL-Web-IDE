// Tarayıcı modunda ilk derlemede derleyici (~27 MB sıkıştırılmış) indirilir; durum çubuğunda görünür ilerleme.
import { useSyncExternalStore } from "react";

export type DownloadProgress = { done: number; total: number } | null;

export interface ProgressStore {
  get(): DownloadProgress;
  set(done: number, total: number): void;
  subscribe(listener: () => void): () => void;
}

export function createProgressStore(): ProgressStore {
  let value: DownloadProgress = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(done, total) {
      // Boyut bilinmiyorsa veya indirme bittiyse gösterme
      value = total > 0 && done < total ? { done, total } : null;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function DownloadStatus({ store }: { store: ProgressStore }) {
  const p = useSyncExternalStore(store.subscribe, store.get);
  if (!p) return null;
  const percent = Math.round((p.done / p.total) * 100);
  return (
    <span className="flex items-center gap-2 text-accent">
      <span
        role="progressbar"
        aria-label="Derleyici indiriliyor"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2"
      >
        <span className="block h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </span>
      <span>
        {/* Yüzde: kütüphane açılmış baytı sayar (~102 MB); ağdan gelen ~27 MB sıkıştırılmış olduğundan MB göstermiyoruz */}
        Derleyici indiriliyor (yalnız ilk seferde) %{percent}
      </span>
    </span>
  );
}
