import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi } from "./api";

function fakeFetch(status: number, body?: unknown) {
  return vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

describe("createApi", () => {
  it("Bearer token ve JSON gövdesi gönderir", async () => {
    const f = fakeFetch(201, { name: "p", profile: "legacy" });
    const api = createApi("tok", f);
    await expect(api.createProject("p", "legacy")).resolves.toEqual({ name: "p", profile: "legacy" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/projects");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ name: "p", profile: "legacy" });
  });

  it("örnek seçilirse proje oluşturma isteğine ekler", async () => {
    const f = fakeFetch(201, { name: "k", profile: "modern" });
    await createApi("t", f).createProject("k", "modern", "kup");
    expect(JSON.parse(f.mock.calls[0][1]!.body as string)).toEqual({ name: "k", profile: "modern", example: "kup" });
  });

  it("örnek listesini getirir", async () => {
    const f = fakeFetch(200, []);
    await createApi("t", f).examples();
    expect(f.mock.calls[0][0]).toBe("/api/examples");
  });

  it("dosya yolunun her parçasını ayrı kodlar", async () => {
    const f = fakeFetch(200, { path: "src/a b.c", content: "" });
    await createApi("t", f).readFile("p q", "src/a b.c");
    expect(f.mock.calls[0][0]).toBe("/api/projects/p%20q/files/src/a%20b.c");
  });

  it("204 yanıtında undefined döner", async () => {
    await expect(createApi("t", fakeFetch(204)).deleteFile("p", "src/x.c")).resolves.toBeUndefined();
  });

  it("hata yanıtını durum kodu ve mesajla ApiError'a çevirir", async () => {
    const err = await createApi("t", fakeFetch(409, { detail: "Önce derleyin" })).run("p", {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe("Önce derleyin");
  });

  it("servise ulaşılamazsa (Failed to fetch) ne yapılacağını söyleyen hata verir", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await createApi("t", down).createProject("p", "legacy").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toContain("Servise ulaşılamıyor");
    expect(err.message).toContain("start.cmd");
  });

  it("503 toolchain eksik ayrıntısını korur", async () => {
    const body = { detail: { message: "Derleme araçları eksik", missing: ["gcc"] } };
    const err = await createApi("t", fakeFetch(503, body)).build("p", {}).catch((e) => e);
    expect(err.message).toBe("Derleme araçları eksik");
    expect(err.detail).toEqual({ message: "Derleme araçları eksik", missing: ["gcc"] });
  });

  it("422 doğrulama listesini okunur mesaja çevirir", async () => {
    const body = { detail: [{ loc: ["body", "name"], msg: "String should match pattern" }] };
    const err = await createApi("t", fakeFetch(422, body)).createProject("../x", "legacy").catch((e) => e);
    expect(err.message).toContain("name");
  });

  it("build ayarlarını ve stop çağrısını doğru uca yollar", async () => {
    const f = fakeFetch(202, { jobId: "j1" });
    const api = createApi("t", f);
    await expect(api.build("p", { config: "Release" })).resolves.toEqual({ jobId: "j1" });
    expect(f.mock.calls[0][0]).toBe("/api/projects/p/build");
    await api.stop("j1");
    expect(f.mock.calls[1][0]).toBe("/api/jobs/j1/stop");
  });
});
