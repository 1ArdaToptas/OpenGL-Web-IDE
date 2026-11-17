// VS Code tarzı renklendirme: Monaco'nun C/C++ tanımı tüm adları tek "identifier" sayar; burada fonksiyon
// çağrıları, OpenGL sabitleri ve OpenGL tipleri ayrı tokenlara ayrılır ve Dark+ renkleriyle boyanır.
import type { languages } from "monaco-editor";

/** `ad(` — ileri bakışla; ad fonksiyon çağrısı ya da tanımıdır. */
export const FUNCTION_CALL = /[a-zA-Z_]\w*(?=\s*\()/;
/** GL_*, GLU_*, GLUT_*, GLFW_* sabitleri. */
export const GL_CONSTANT = /\bGL(?:U|UT|FW)?_[A-Z0-9_]+\b/;
/** OpenGL/GLFW tipleri. */
export const GL_TYPE =
  /\b(?:GL(?:enum|boolean|bitfield|byte|short|int|sizei|ubyte|ushort|uint|float|clampf|double|clampd|void|char|sizeiptr|intptr)|GLFWwindow|GLFWmonitor)\b/;

type Rule = languages.IMonarchLanguageRule;

/** GLSL'e özgü tipler, nitelikler ve gl_* yerleşikleri (yalnızca shader dili). */
export const GLSL_RULES: [RegExp, string][] = [
  [/\b(?:[biu]?vec[234]|mat[234](?:x[234])?|sampler(?:[123]D|Cube)(?:Shadow)?)\b/, "type"],
  [/\b(?:in|out|inout|uniform|layout|location|precision|highp|mediump|lowp|flat|smooth|attribute|varying)\b/, "keyword"],
  [/\bgl_\w+/, "constant"],
];

export function enhanceCLanguage(
  base: languages.IMonarchLanguage,
  tokenPostfix: string,
  extraRules: [RegExp, string][] = [],
): languages.IMonarchLanguage {
  const extra: Rule[] = [
    ...extraRules,
    [GL_CONSTANT, "constant"],
    [GL_TYPE, "type"],
    // if/while/sizeof/return da parantezle gelir: anahtar sözcükse anahtar sözcük kalır.
    [FUNCTION_CALL, { cases: { "@keywords": { token: "keyword.$0" }, "@default": "function" } }],
  ];
  const root = [...(base.tokenizer.root as Rule[])];
  const identifier = root.findIndex((r) => Array.isArray(r) && String(r[0]) === String(/[a-zA-Z_]\w*/));
  root.splice(identifier < 0 ? 0 : identifier, 0, ...extra);
  return { ...base, tokenPostfix, tokenizer: { ...base.tokenizer, root } };
}

const CONTROL = ["if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "return", "goto"];

/** VS Code "Dark+" renkleri (token öneki eşleşir: "keyword" → "keyword.int.c"). */
export const VSCODE_DARK_RULES: { token: string; foreground: string; fontStyle?: string }[] = [
  { token: "function", foreground: "DCDCAA" },
  { token: "keyword", foreground: "569CD6" },
  ...CONTROL.map((k) => ({ token: `keyword.${k}`, foreground: "C586C0" })),
  { token: "keyword.directive", foreground: "C586C0" },
  { token: "type", foreground: "4EC9B0" },
  { token: "constant", foreground: "4FC1FF" },
  { token: "number", foreground: "B5CEA8" },
  { token: "string", foreground: "CE9178" },
  { token: "comment", foreground: "6A9955" },
  { token: "identifier", foreground: "9CDCFE" },
  { token: "delimiter", foreground: "D4D4D4" },
];
