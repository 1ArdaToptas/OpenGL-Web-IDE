import { describe, expect, it, vi } from "vitest";
import { takeTokenFromLocation } from "./token";

function fakeEnv(hash: string) {
  const location = { hash, pathname: "/", search: "?x=1" } as Location;
  const history = { replaceState: vi.fn() } as unknown as History;
  return { location, history };
}

describe("takeTokenFromLocation", () => {
  it("fragment'taki token'ı döndürür ve adres çubuğundan siler", () => {
    const { location, history } = fakeEnv("#token=abc123");
    expect(takeTokenFromLocation(location, history)).toBe("abc123");
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/?x=1");
  });

  it("fragment yoksa null döner ve geçmişe dokunmaz", () => {
    const { location, history } = fakeEnv("");
    expect(takeTokenFromLocation(location, history)).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it("boş token'ı kabul etmez", () => {
    const { location, history } = fakeEnv("#token=");
    expect(takeTokenFromLocation(location, history)).toBeNull();
  });

  it("başka fragment parametrelerinin yanında da okur", () => {
    const { location, history } = fakeEnv("#a=1&token=t-_9");
    expect(takeTokenFromLocation(location, history)).toBe("t-_9");
  });
});
