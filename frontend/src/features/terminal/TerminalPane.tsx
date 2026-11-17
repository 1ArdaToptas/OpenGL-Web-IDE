import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { type Ref, useEffect, useImperativeHandle, useRef } from "react";

export interface TerminalHandle {
  write: (text: string) => void;
  clear: () => void;
}

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function TerminalPane({ ref }: { ref: Ref<TerminalHandle> }) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);

  useEffect(() => {
    const t = new Terminal({
      fontFamily: "Cascadia Code, Cascadia Mono, Consolas, monospace",
      fontSize: 13,
      disableStdin: true, // stdin henüz desteklenmiyor
      scrollback: 5000,
      theme: { background: token("--color-bg"), foreground: token("--color-fg") },
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(host.current!);
    fit.fit();
    term.current = t;
    // Panel gizliyken (Sorunlar sekmesi) boyut 0 olur; yeniden görünür olunca sığdır ve en alta in.
    const ro = new ResizeObserver(() => {
      if (!host.current?.offsetWidth) return;
      fit.fit();
      t.scrollToBottom();
    });
    ro.observe(host.current!);
    return () => {
      ro.disconnect();
      t.dispose();
      term.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    write: (text) => term.current?.write(text),
    clear: () => term.current?.clear(),
  }));

  return <div ref={host} className="h-full w-full px-2 py-1" aria-label="Terminal çıktısı" />;
}
