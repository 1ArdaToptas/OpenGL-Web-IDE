// Monaco yerel paketten yüklenir, CDN kullanılmaz (ADR-016).
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { conf, language } from "monaco-editor/languages/definitions/cpp/cpp";
import { GLSL_RULES, VSCODE_DARK_RULES, enhanceCLanguage } from "./syntax";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

// Kendi dil kimliklerimiz: C/C++ ve GLSL, fonksiyon/sabit/tip ayrımlı VS Code tarzı renklendirme ile.
const LANGUAGES: [id: string, postfix: string, extra: typeof GLSL_RULES][] = [
  ["oglide-c", ".c", []],
  ["oglide-cpp", ".cpp", []],
  ["oglide-glsl", ".glsl", GLSL_RULES],
];
for (const [id, postfix, extra] of LANGUAGES) {
  monaco.languages.register({ id });
  monaco.languages.setLanguageConfiguration(id, conf);
  monaco.languages.setMonarchTokensProvider(id, enhanceCLanguage(language, postfix, extra));
}

monaco.editor.defineTheme("oglide-dark", {
  base: "vs-dark",
  inherit: true,
  rules: VSCODE_DARK_RULES,
  colors: { "editor.background": "#0f172a", "editor.lineHighlightBackground": "#1b2336" },
});

loader.config({ monaco });

export { monaco };
