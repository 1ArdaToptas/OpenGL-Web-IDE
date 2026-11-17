import { describe, expect, it } from "vitest";
import { FUNCTION_CALL, GLSL_RULES, GL_CONSTANT, GL_TYPE, VSCODE_DARK_RULES, enhanceCLanguage } from "./syntax";

const whole = (re: RegExp, text: string) => {
  const m = new RegExp(`^(?:${re.source})`).exec(text);
  return m?.[0] ?? null;
};

describe("sözdizimi kuralları", () => {
  it.each([
    ["glVertex2f(0, 1)", "glVertex2f"],
    ["glutTimerFunc (16, t, 0)", "glutTimerFunc"],
    ["kendi_fonksiyonum(x)", "kendi_fonksiyonum"],
    ["printf(\"%d\")", "printf"],
  ])("fonksiyon çağrısı: %s", (text, name) => {
    expect(whole(FUNCTION_CALL, text)).toBe(name);
  });

  it.each(["angle = 1", "GL_TRIANGLES)", "x+1"])("fonksiyon olmayan: %s", (text) => {
    expect(whole(FUNCTION_CALL, text)).toBeNull();
  });

  it.each(["GL_COLOR_BUFFER_BIT", "GLUT_DOUBLE", "GLFW_KEY_ESCAPE", "GLU_FILL"])("OpenGL sabiti: %s", (c) => {
    expect(whole(GL_CONSTANT, c)).toBe(c);
  });

  it("OpenGL tipi sabitle karışmaz", () => {
    expect(whole(GL_CONSTANT, "GLfloat")).toBeNull();
    expect(whole(GL_TYPE, "GLfloat x")).toBe("GLfloat");
    expect(whole(GL_TYPE, "GLFWwindow *w")).toBe("GLFWwindow");
  });
});

describe("enhanceCLanguage", () => {
  const base = {
    tokenPostfix: ".cpp",
    keywords: ["if", "int"],
    tokenizer: {
      root: [
        [/raw/, "string.raw.begin"],
        [/[a-zA-Z_]\w*/, { cases: { "@keywords": { token: "keyword.$0" }, "@default": "identifier" } }],
        { include: "@whitespace" },
      ],
      whitespace: [],
    },
  };

  it("yeni kuralları genel tanımlayıcı kuralından önce ekler, diğerlerini korur", () => {
    const lang = enhanceCLanguage(base as never, ".c");
    const root = lang.tokenizer.root as unknown[];
    const identifierIndex = root.findIndex((r) => Array.isArray(r) && String(r[0]) === String(/[a-zA-Z_]\w*/));
    const fnIndex = root.findIndex((r) => Array.isArray(r) && r[0] === FUNCTION_CALL);
    expect(fnIndex).toBeGreaterThan(-1);
    expect(fnIndex).toBeLessThan(identifierIndex);
    expect(root).toHaveLength(base.tokenizer.root.length + 3);
    expect(lang.tokenPostfix).toBe(".c");
  });

  it("anahtar sözcük + parantez (if, while) fonksiyon sayılmaz", () => {
    const lang = enhanceCLanguage(base as never, ".c");
    const rule = (lang.tokenizer.root as unknown[]).find((r) => Array.isArray(r) && r[0] === FUNCTION_CALL) as [
      RegExp,
      { cases: Record<string, unknown> },
    ];
    expect(rule[1].cases["@keywords"]).toEqual({ token: "keyword.$0" });
    expect(rule[1].cases["@default"]).toBe("function");
  });

  it("temel tanımı değiştirmez", () => {
    enhanceCLanguage(base as never, ".c");
    expect(base.tokenizer.root).toHaveLength(3);
  });
});

describe("GLSL kuralları", () => {
  it.each([
    ["vec3 renk", "type"],
    ["mat4 uMVP", "type"],
    ["uniform float", "keyword"],
    ["layout(location", "keyword"],
    ["gl_Position =", "constant"],
  ])("%s → %s", (text, token) => {
    const rule = GLSL_RULES.find(([re]) => whole(re, text));
    expect(rule?.[1]).toBe(token);
  });
});

describe("VS Code Dark+ renkleri", () => {
  const color = (token: string) => VSCODE_DARK_RULES.find((r) => r.token === token)?.foreground;
  it.each([
    ["function", "DCDCAA"],
    ["keyword", "569CD6"],
    ["keyword.if", "C586C0"],
    ["keyword.return", "C586C0"],
    ["keyword.directive", "C586C0"],
    ["type", "4EC9B0"],
    ["constant", "4FC1FF"],
    ["number", "B5CEA8"],
    ["string", "CE9178"],
    ["comment", "6A9955"],
  ])("%s → #%s", (token, hex) => {
    expect(color(token)).toBe(hex);
  });
});
