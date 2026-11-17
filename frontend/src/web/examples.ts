// Örnek galerisi tarayıcı modunda: depo kökündeki templates/ derleme anında pakete gömülür (tek kaynak;
// yerel motor da aynı dosyaları kullanır). Şablon kökü = "baslangic", ek örnekler examples/<id>/.
import type { Profile } from "../lib/types";
import type { WebExample } from "./browserIde";

const PROFILE_DIRS: Record<string, Profile> = { "legacy-freeglut": "legacy", "modern-glfw": "modern" };

const metas = import.meta.glob("../../../templates/*/{example.json,examples/*/example.json}", {
  eager: true,
  import: "default",
}) as Record<string, { title: string; description: string; kind: "statik" | "animasyon" }>;

const sources = import.meta.glob(
  ["../../../templates/*/{src,shaders}/**/*.*", "../../../templates/*/examples/*/{src,shaders}/**/*.*"],
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

function build(): WebExample[] {
  const result: WebExample[] = [];
  for (const [metaPath, meta] of Object.entries(metas)) {
    const m = /templates\/([^/]+)\/(?:examples\/([^/]+)\/)?example\.json$/.exec(metaPath);
    const profile = m && PROFILE_DIRS[m[1]];
    if (!profile) continue;
    const base = metaPath.slice(0, -"example.json".length);
    const files: Record<string, string> = {};
    for (const [path, text] of Object.entries(sources)) {
      if (!path.startsWith(base)) continue;
      const rel = path.slice(base.length);
      if (rel.startsWith("src/") || rel.startsWith("shaders/")) files[rel] = text; // examples/ alt klasörleri hariç
    }
    result.push({ id: m[2] ?? "baslangic", profile, ...meta, files });
  }
  // Varsayılan örnek her profilde ilk sırada
  return result.sort((a, b) => a.profile.localeCompare(b.profile) || (a.id === "baslangic" ? -1 : b.id === "baslangic" ? 1 : a.id.localeCompare(b.id)));
}

export const WEB_EXAMPLES = build();
