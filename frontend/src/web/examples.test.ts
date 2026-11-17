import { describe, expect, it } from "vitest";
import { WEB_EXAMPLES } from "./examples";

const find = (profile: string, id: string) => WEB_EXAMPLES.find((e) => e.profile === profile && e.id === id);

describe("WEB_EXAMPLES (templates/ klasöründen derleme anında)", () => {
  it("legacy örneklerin hepsi dosyalarıyla gelir", () => {
    expect(find("legacy", "baslangic")?.files["src/main.c"]).toContain("glFlush");
    expect(find("legacy", "baslangic")?.files["src/main.c"]).not.toContain("glutTimerFunc");
    expect(find("legacy", "donen-ucgen")?.files["src/main.c"]).toContain("glutTimerFunc");
    expect(find("legacy", "sekiller")?.files["src/main.c"]).toContain("glPolygonMode");
    expect(find("legacy", "etkilesim")?.files["src/main.c"]).toContain("glutMouseFunc");
    expect(find("legacy", "baslangic")?.title).toBe("Üçgen");
    expect(find("legacy", "donen-ucgen")?.title).toBe("Dönen üçgen");
  });

  it("varsayılan örnek, alt örneklerin dosyalarını içermez", () => {
    expect(Object.keys(find("legacy", "baslangic")!.files)).toEqual(["src/main.c"]);
  });

  it("modern örnekler shader dosyalarıyla gelir; GLAD gibi motor dosyaları gelmez", () => {
    const kup = find("modern", "kup")!;
    expect(Object.keys(kup.files).sort()).toEqual(["shaders/kup.frag", "shaders/kup.vert", "src/main.c"]);
    expect(Object.keys(find("modern", "baslangic")!.files).some((p) => p.includes("third_party"))).toBe(false);
  });
});
