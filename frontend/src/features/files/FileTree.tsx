import type { TreeEntry } from "../../lib/types";
import { Icon } from "../../ui/Icon";

interface Props {
  entries: TreeEntry[];
  active: string | null;
  dirty: string[];
  onOpen: (path: string) => void;
  onDelete?: (path: string) => void;
}

export function FileTree({ entries, active, dirty, onOpen, onDelete }: Props) {
  if (entries.length === 0) {
    return <p className="px-3 py-2 text-fg-muted">Dosyaları görmek için bir proje seçin.</p>;
  }
  return (
    <ul className="py-1" aria-label="Proje dosyaları">
      {entries.map((e) => {
        const depth = e.path.split("/").length - 1;
        const name = e.path.split("/").at(-1)!;
        const indent = { paddingLeft: `${8 + depth * 12}px` };
        if (e.type === "dir") {
          return (
            <li key={e.path} style={indent} className="flex h-6 items-center gap-1.5 text-fg-muted select-none">
              <Icon name="folder" />
              <span>{name}</span>
            </li>
          );
        }
        const isActive = e.path === active;
        const isDirty = dirty.includes(e.path);
        return (
          <li key={e.path} className="group relative">
            <button
              type="button"
              style={indent}
              aria-current={isActive ? "true" : undefined}
              aria-label={name}
              onClick={() => onOpen(e.path)}
              className={`flex h-6 w-full cursor-pointer items-center gap-1.5 pr-7 text-left hover:bg-surface-2 ${
                isActive ? "bg-surface-2 text-fg" : "text-fg/90"
              }`}
            >
              <Icon name="file" />
              <span className="truncate">{name}</span>
              {isDirty && (
                <span className="ml-auto text-warning" title="Kaydedilmemiş değişiklik">
                  ●<span className="sr-only">kaydedilmedi</span>
                </span>
              )}
            </button>
            {onDelete && (
              // Fareyle üzerine gelince veya klavye odağında görünür (yalnız hover'a bağlı değil).
              <button
                type="button"
                aria-label={`Sil ${name}`}
                title={`Sil: ${e.path}`}
                onClick={() => onDelete(e.path)}
                className="absolute top-0 right-1 h-6 cursor-pointer rounded px-1 text-fg-muted opacity-0 group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
              >
                <Icon name="close" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
