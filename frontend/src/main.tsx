import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BrowserCompiler } from "./compiler/compiler";
import "./index.css";
import { takeTokenFromLocation } from "./lib/token";
import { ProgramRunner } from "./runtime/runner";
import { BrowserIde } from "./web/browserIde";
import { WEB_EXAMPLES } from "./web/examples";
import { IdbStore, MemoryStore } from "./web/store";

// Token yalnızca bellekte tutulur (ADR-016); adres çubuğundan hemen silinir.
const token = takeTokenFromLocation(window.location, window.history);
// Aynı adres yeniden açılırsa sayfa yüklenmez, yalnızca hash değişir: token'ı adres çubuğundan yine sil.
window.addEventListener("hashchange", () => takeTokenFromLocation(window.location, window.history));

const root = createRoot(document.getElementById("root")!);

if (token) {
  // Yerel mod: konsoldaki #token adresiyle açılan yerel servis (MinGW, masaüstü penceresi).
  root.render(
    <StrictMode>
      <App token={token} />
    </StrictMode>,
  );
} else {
  // Tarayıcı modu (ADR-019): kurulum yok; derleme ve çalıştırma bu tarayıcıda, ziyaretçinin donanımında.
  const canvasHost = document.createElement("div");
  canvasHost.className = "flex h-full w-full items-center justify-center";

  const rendererInfo = () => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : "WebGL2 yok";
  };

  let lastQuarter = -1;
  const compiler = new BrowserCompiler(undefined, (fraction) => {
    // İlk derlemede derleyici (~19 MB) indirilir; durum çubuğunda değil terminalde dörtte bir adımlarla göster.
    const quarter = Math.floor(fraction * 4);
    if (quarter !== lastQuarter) {
      lastQuarter = quarter;
      ide.notify(`Derleyici indiriliyor (yalnız ilk seferde): %${Math.round(fraction * 100)}\n`);
    }
  });

  let store;
  try {
    store = new IdbStore();
  } catch {
    store = new MemoryStore(); // IndexedDB kapalıysa projeler yalnız bu oturumda kalır
  }

  const ide: BrowserIde = new BrowserIde({
    store,
    examples: WEB_EXAMPLES,
    compiler,
    createRunner: (o) => new ProgramRunner(o),
    createCanvas: () => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      canvas.tabIndex = 0;
      canvas.setAttribute("aria-label", "Program penceresi (tıklayın veya odaklayıp tuşa basın)");
      canvas.className = "max-h-full max-w-full border border-border bg-black outline-none focus-visible:outline-info";
      canvasHost.replaceChildren(canvas);
      return canvas;
    },
    rendererInfo,
  });

  root.render(
    <StrictMode>
      <App
        token={null}
        mode="web"
        deps={{ api: ide.api, createSocket: (project, h) => ide.createSocket(project, h) }}
        canvasHost={canvasHost}
      />
    </StrictMode>,
  );
}
