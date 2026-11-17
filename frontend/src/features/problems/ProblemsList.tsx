import type { Diagnostic } from "../../lib/types";
import { translateMessage } from "./turkish";

const LABEL = { error: "hata", warning: "uyarı", note: "not" } as const;
const COLOR = { error: "text-danger", warning: "text-warning", note: "text-info" } as const;

interface Props {
  items: Diagnostic[];
  onGoto: (file: string, line: number, col: number) => void;
}

export function ProblemsList({ items, onGoto }: Props) {
  if (items.length === 0) return <p className="px-3 py-2 text-fg-muted">Sorun yok</p>;
  return (
    <ul className="py-1 font-mono text-[12px]">
      {items.map((d, i) => {
        const badge = <span className={`w-12 shrink-0 ${COLOR[d.severity]}`}>{LABEL[d.severity]}</span>;
        const location = `${d.file}:${d.line}:${Math.max(d.col, 1)}`;
        const tr = translateMessage(d.message);
        // Türkçe açıklama; özgün İngilizce ileti fareyle üzerine gelince (title) görünür
        const message = tr ? <span title={d.message}>{tr}</span> : d.message;
        return (
          <li key={i}>
            {d.file && d.line > 0 ? (
              <button
                type="button"
                onClick={() => onGoto(d.file, d.line, Math.max(d.col, 1))}
                className="flex w-full cursor-pointer gap-2 px-3 py-0.5 text-left hover:bg-surface-2"
              >
                {badge}
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="mr-2 text-fg-muted">{location}</span>
                  {message}
                </span>
              </button>
            ) : (
              <div className="flex gap-2 px-3 py-0.5">
                {badge}
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{message}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
