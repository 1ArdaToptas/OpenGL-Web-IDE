import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, type Deps } from "./App";
import { ApiError } from "./lib/api";
import type { IdeEvent } from "./lib/types";
import type { SocketStatus } from "./lib/ws";

const terminalWrites: string[] = [];

vi.mock("./features/editor/EditorPane", () => ({
  EditorPane: (p: { path: string; value: string; onChange: (v: string) => void; markers: unknown[] }) => (
    <textarea aria-label={`editör ${p.path}`} data-markers={p.markers.length} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
}));
vi.mock("./features/terminal/TerminalPane", async () => {
  const { useImperativeHandle } = await import("react");
  return {
    TerminalPane: ({ ref }: { ref: React.Ref<unknown> }) => {
      useImperativeHandle(ref, () => ({ write: (t: string) => terminalWrites.push(t), clear: () => {} }));
      return <div>terminal</div>;
    },
  };
});

vi.mock("./features/stream/StreamView", () => ({
  StreamView: (p: { send: (m: object) => boolean; event: unknown }) => (
    <div data-testid="stream" data-event={JSON.stringify(p.event)}>
      <button type="button" onClick={() => p.send({ type: "stream.offer", sdp: "s", sdp_type: "offer" })}>
        teklif gönder
      </button>
    </div>
  ),
}));

let handlers:{ onEvent: (e: IdeEvent) => void; onStatus: (s: SocketStatus) => void } | null;

function makeDeps(over: Partial<Deps["api"]> = {}) {
  const api = {
    health: vi.fn().mockResolvedValue({ version: "0.1.0", toolchain: { ok: true, missing: [], versions: {} } }),
    listProjects: vi.fn().mockResolvedValue([{ name: "ucgen", profile: "legacy" }]),
    createProject: vi.fn().mockResolvedValue({ name: "yeni", profile: "modern" }),
    examples: vi.fn().mockResolvedValue([
      { id: "baslangic", profile: "legacy", title: "Dönen üçgen", description: "a", kind: "animasyon" },
      { id: "sekiller", profile: "legacy", title: "Şekiller", description: "b", kind: "statik" },
      { id: "baslangic", profile: "modern", title: "Dönen kare", description: "c", kind: "animasyon" },
      { id: "kup", profile: "modern", title: "Küp", description: "d", kind: "statik" },
    ]),
    deleteProject: vi.fn(),
    tree: vi.fn().mockResolvedValue([
      { path: "src", type: "dir" },
      { path: "src/main.c", type: "file" },
    ]),
    readFile: vi.fn().mockResolvedValue({ path: "src/main.c", content: "int main(void){}" }),
    writeFile: vi.fn().mockResolvedValue({ path: "src/main.c", size: 1 }),
    deleteFile: vi.fn(),
    build: vi.fn().mockResolvedValue({ jobId: "b1" }),
    run: vi.fn().mockResolvedValue({ jobId: "r1" }),
    stop: vi.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as Deps["api"];
  const createSocket = vi.fn((_project: string, h: NonNullable<typeof handlers>) => {
    handlers = h;
    return { close: vi.fn(), send: socketSend };
  });
  return { api, createSocket };
}

function emit(e: IdeEvent) {
  act(() => handlers!.onEvent(e));
}

async function openProject(deps: Deps) {
  render(<App token="tok" deps={deps} />);
  await userEvent.selectOptions(await screen.findByLabelText("Proje"), "ucgen");
  await screen.findByLabelText("editör src/main.c");
  act(() => handlers!.onStatus("connected"));
  emit({ type: "ready", project: "ucgen", activeJob: null });
}

const socketSend = vi.fn().mockReturnValue(true);

beforeEach(() => {
  terminalWrites.length = 0;
  handlers = null;
  socketSend.mockClear();
});

describe("App", () => {
  it("token yoksa nasıl bağlanılacağını anlatır ve API çağırmaz", () => {
    const deps = makeDeps();
    render(<App token={null} deps={deps} />);
    expect(screen.getByRole("alert")).toHaveTextContent("#token=");
    expect(deps.api.listProjects).not.toHaveBeenCalled();
  });

  it("proje seçilince ağacı yükler, soket açar ve main.c'yi editörde açar", async () => {
    const deps = makeDeps();
    await openProject(deps);
    expect(deps.api.tree).toHaveBeenCalledWith("ucgen");
    expect(deps.createSocket).toHaveBeenCalledWith("ucgen", expect.anything());
    expect(screen.getByLabelText("editör src/main.c")).toHaveValue("int main(void){}");
  });

  it("Derle önce kaydedilmemiş dosyaları kaydeder, sonra seçili yapılandırmayla derler", async () => {
    const deps = makeDeps();
    await openProject(deps);
    await userEvent.type(screen.getByLabelText("editör src/main.c"), " ");
    await userEvent.selectOptions(screen.getByLabelText("Yapılandırma"), "Release");
    await userEvent.click(screen.getByRole("button", { name: "Derle" }));
    await waitFor(() => expect(deps.api.build).toHaveBeenCalledWith("ucgen", { config: "Release" }));
    expect(deps.api.writeFile).toHaveBeenCalledWith("ucgen", "src/main.c", "int main(void){} ");
    const writeOrder = (deps.api.writeFile as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const buildOrder = (deps.api.build as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(writeOrder).toBeLessThan(buildOrder);
  });

  it("iş olayları araç çubuğunu ve terminali günceller", async () => {
    const deps = makeDeps();
    await openProject(deps);
    emit({ type: "job.started", jobId: "b1", kind: "build" });
    expect(screen.getByRole("button", { name: "Durdur" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Derle" })).toBeDisabled();
    emit({ type: "job.output", jobId: "b1", stream: "stdout", data: "[1/2] gcc\n" });
    expect(terminalWrites.join("")).toContain("[1/2] gcc\r\n");
    await userEvent.click(screen.getByRole("button", { name: "Durdur" }));
    expect(deps.api.stop).toHaveBeenCalledWith("b1");
  });

  it("başarısız derlemede sorunlar sekmesine geçer ve editöre işaret koyar", async () => {
    const deps = makeDeps();
    await openProject(deps);
    emit({ type: "job.started", jobId: "b1", kind: "build" });
    emit({ type: "build.diagnostics", jobId: "b1", items: [{ file: "src/main.c", line: 1, col: 5, severity: "error", message: "x tanımsız" }] });
    emit({ type: "job.exited", jobId: "b1", kind: "build", code: 1, durationMs: 900, reason: "exit", outputTruncated: false, ok: false });
    expect(screen.getByRole("tab", { name: /Sorunlar \(1\)/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /src\/main.c:1:5/ })).toBeInTheDocument();
    expect(screen.getByLabelText("editör src/main.c")).toHaveAttribute("data-markers", "1");
    expect(terminalWrites.join("")).toContain("Derleme başarısız (0.9 sn)");
  });

  it("Çalıştır önce kaydeder ve derler, derleme başarılıysa çalıştırır", async () => {
    const deps = makeDeps();
    await openProject(deps);
    await userEvent.type(screen.getByLabelText("editör src/main.c"), " ");
    await userEvent.click(screen.getByRole("button", { name: "Çalıştır" }));
    await waitFor(() => expect(deps.api.build).toHaveBeenCalledWith("ucgen", { config: "Debug" }));
    expect(deps.api.writeFile).toHaveBeenCalled();
    expect(deps.api.run).not.toHaveBeenCalled();
    emit({ type: "job.started", jobId: "b1", kind: "build" });
    emit({ type: "job.exited", jobId: "b1", kind: "build", code: 0, durationMs: 5, reason: "exit", outputTruncated: false, ok: true });
    await waitFor(() => expect(deps.api.run).toHaveBeenCalledWith("ucgen", {}));
  });

  it("Çalıştır'daki derleme başarısızsa programı çalıştırmaz", async () => {
    const deps = makeDeps();
    await openProject(deps);
    await userEvent.click(screen.getByRole("button", { name: "Çalıştır" }));
    await waitFor(() => expect(deps.api.build).toHaveBeenCalled());
    emit({ type: "job.started", jobId: "b1", kind: "build" });
    emit({ type: "job.exited", jobId: "b1", kind: "build", code: 1, durationMs: 5, reason: "exit", outputTruncated: false, ok: false });
    // Sonraki ayrı bir Derle de çalıştırmayı tetiklememeli
    await userEvent.click(screen.getByRole("button", { name: "Derle" }));
    emit({ type: "job.started", jobId: "b2", kind: "build" });
    emit({ type: "job.exited", jobId: "b2", kind: "build", code: 0, durationMs: 5, reason: "exit", outputTruncated: false, ok: true });
    expect(deps.api.run).not.toHaveBeenCalled();
  });

  it("çalıştırma hatasını kullanıcıya gösterir", async () => {
    const deps = makeDeps({ run: vi.fn().mockRejectedValue(new ApiError(429, "Çok fazla eşzamanlı iş")) });
    await openProject(deps);
    await userEvent.click(screen.getByRole("button", { name: "Çalıştır" }));
    emit({ type: "job.exited", jobId: "b1", kind: "build", code: 0, durationMs: 5, reason: "exit", outputTruncated: false, ok: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("Çok fazla eşzamanlı iş");
  });

  it("yeni dosya oluşturur, ağacı yeniler ve dosyayı açar", async () => {
    const deps = makeDeps();
    await openProject(deps);
    (deps.api.tree as ReturnType<typeof vi.fn>).mockResolvedValue([
      { path: "src", type: "dir" },
      { path: "src/main.c", type: "file" },
      { path: "src/util.h", type: "file" },
    ]);
    (deps.api.readFile as ReturnType<typeof vi.fn>).mockResolvedValue({ path: "src/util.h", content: "" });
    await userEvent.click(screen.getByRole("button", { name: "Yeni dosya" }));
    await userEvent.type(screen.getByLabelText("Dosya yolu"), "util.h{Enter}") // kutu "src/" ile başlar;
    await waitFor(() => expect(deps.api.writeFile).toHaveBeenCalledWith("ucgen", "src/util.h", ""));
    expect(await screen.findByLabelText("editör src/util.h")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Proje dosyaları" })).getByRole("button", { name: "util.h" })).toBeInTheDocument();
  });

  it("geçersiz dosya yolunda sunucu mesajını gösterir", async () => {
    const deps = makeDeps({ writeFile: vi.fn().mockRejectedValue(new ApiError(400, "İzinli olmayan uzantı: 'x.exe'")) });
    await openProject(deps);
    await userEvent.click(screen.getByRole("button", { name: "Yeni dosya" }));
    await userEvent.type(screen.getByLabelText("Dosya yolu"), "x.exe{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("İzinli olmayan uzantı");
  });

  it("onaylanırsa dosyayı siler ve sekmesini kapatır", async () => {
    const deps = makeDeps();
    await openProject(deps);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "Sil main.c" }));
    expect(deps.api.deleteFile).not.toHaveBeenCalled();
    (deps.api.tree as ReturnType<typeof vi.fn>).mockResolvedValue([{ path: "src", type: "dir" }]);
    await userEvent.click(screen.getByRole("button", { name: "Sil main.c" }));
    await waitFor(() => expect(deps.api.deleteFile).toHaveBeenCalledWith("ucgen", "src/main.c"));
    await waitFor(() => expect(screen.queryByLabelText("editör src/main.c")).not.toBeInTheDocument());
    confirm.mockRestore();
  });

  it("onaylanırsa projeyi siler ve seçimi temizler", async () => {
    const deps = makeDeps();
    await openProject(deps);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    (deps.api.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await userEvent.click(screen.getByRole("button", { name: "Projeyi sil" }));
    await waitFor(() => expect(deps.api.deleteProject).toHaveBeenCalledWith("ucgen"));
    await waitFor(() => expect(screen.getByLabelText("Proje")).toHaveValue(""));
    expect(confirm.mock.calls[0][0]).toContain("ucgen");
    confirm.mockRestore();
  });

  it("yeni proje diyaloğundan proje oluşturur ve açar", async () => {
    const deps = makeDeps();
    (deps.api.listProjects as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ name: "ucgen", profile: "legacy" }])
      .mockResolvedValue([{ name: "ucgen", profile: "legacy" }, { name: "yeni", profile: "modern" }]);
    render(<App token="tok" deps={deps} />);
    await userEvent.click(await screen.findByRole("button", { name: "Yeni proje" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni proje" });
    await userEvent.type(within(dialog).getByLabelText("Proje adı"), "yeni");
    const example = within(dialog).getByLabelText("Örnek");
    expect(within(example).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Dönen üçgen (animasyon)",
      "Şekiller (statik)",
    ]);
    await userEvent.click(within(dialog).getByLabelText(/Modern/));
    expect(example).toHaveValue("baslangic"); // profil değişince o profilin varsayılanı
    await userEvent.selectOptions(example, "kup");
    expect(within(dialog).getByText("d")).toBeInTheDocument(); // seçilen örneğin açıklaması
    await userEvent.click(within(dialog).getByRole("button", { name: "Oluştur" }));
    await waitFor(() => expect(deps.api.createProject).toHaveBeenCalledWith("yeni", "modern", "kup"));
    await waitFor(() => expect(deps.api.tree).toHaveBeenCalledWith("yeni"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("geçersiz proje adında diyalog içinde hata gösterir", async () => {
    const deps = makeDeps({ createProject: vi.fn().mockRejectedValue(new ApiError(422, "name: String should match pattern")) });
    render(<App token="tok" deps={deps} />);
    await userEvent.click(await screen.findByRole("button", { name: "Yeni proje" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni proje" });
    await userEvent.type(within(dialog).getByLabelText("Proje adı"), "kötü ad");
    await userEvent.click(within(dialog).getByRole("button", { name: "Oluştur" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("match pattern");
  });

  it("API 401 dönerse (yanlış/eski token) yeniden bağlanma talimatı gösterir", async () => {
    const deps = makeDeps({ listProjects: vi.fn().mockRejectedValue(new ApiError(401, "Yetkisiz")) });
    render(<App token="eski" deps={deps} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("#token=");
    expect(screen.queryByLabelText("Proje")).not.toBeInTheDocument();
  });

  it("işlem sırasında 401 gelirse de talimat ekranına geçer", async () => {
    const deps = makeDeps({ build: vi.fn().mockRejectedValue(new ApiError(401, "Yetkisiz")) });
    await openProject(deps);
    await userEvent.click(screen.getByRole("button", { name: "Derle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("#token=");
  });

  it("soket token'ı reddederse yeniden bağlanma talimatı gösterir", async () => {
    const deps = makeDeps();
    await openProject(deps);
    act(() => handlers!.onStatus("rejected"));
    expect(screen.getByRole("alert")).toHaveTextContent("#token=");
  });

  it("Görüntü sekmesi: program çalışmıyorsa bilgi verir", async () => {
    const deps = makeDeps();
    await openProject(deps);
    await userEvent.click(screen.getByRole("tab", { name: "Görüntü" }));
    expect(screen.getByText(/Program çalışırken/)).toBeInTheDocument();
    expect(screen.queryByTestId("stream")).not.toBeInTheDocument();
  });

  it("Görüntü sekmesi: çalışan programın akışını açar, sinyalleri soket üzerinden taşır", async () => {
    const deps = makeDeps();
    await openProject(deps);
    emit({ type: "job.started", jobId: "r1", kind: "run" });
    await userEvent.click(screen.getByRole("tab", { name: "Görüntü" }));
    await userEvent.click(screen.getByRole("button", { name: "teklif gönder" }));
    expect(socketSend).toHaveBeenCalledWith({ type: "stream.offer", sdp: "s", sdp_type: "offer" });
    emit({ type: "stream.answer", sdp: "c", sdp_type: "answer" });
    expect(screen.getByTestId("stream").dataset.event).toContain('"stream.answer"');
    emit({ type: "job.exited", jobId: "r1", kind: "run", code: 0, durationMs: 1, reason: "killed", outputTruncated: false });
    expect(screen.queryByTestId("stream")).not.toBeInTheDocument();
  });

  it("Görüntü aktarımı kurulu değilse nedenini söyler", async () => {
    const deps = makeDeps({
      health: vi.fn().mockResolvedValue({
        version: "0.1.0",
        toolchain: { ok: true, missing: [], versions: {} },
        stream: { available: false, reason: "Görüntü aktarımı kurulu değil" },
      }),
    });
    await openProject(deps);
    emit({ type: "job.started", jobId: "r1", kind: "run" });
    await userEvent.click(screen.getByRole("tab", { name: "Görüntü" }));
    expect(screen.getByText("Görüntü aktarımı kurulu değil")).toBeInTheDocument();
    expect(screen.queryByTestId("stream")).not.toBeInTheDocument();
  });

  it("tarayıcı modu: token gerekmez, mod durum çubuğunda yazar", async () => {
    const deps = makeDeps({
      health: vi.fn().mockResolvedValue({ version: "0.1.0", mode: "web", toolchain: { ok: true, missing: [], versions: { clang: "clang (tarayıcı)" } } }),
    });
    render(<App token={null} mode="web" deps={deps} canvasHost={document.createElement("div")} />);
    expect(await screen.findByText(/Tarayıcı modu/)).toBeInTheDocument();
    expect(screen.queryByText(/#token=/)).not.toBeInTheDocument();
    expect(screen.getByText("clang (tarayıcı)")).toBeInTheDocument();
  });

  it("tarayıcı modu: program başlayınca Görüntü sekmesi açılır ve canvas alanı yerleşir", async () => {
    const host = document.createElement("div");
    host.dataset.testid = "canvas-host";
    const deps = makeDeps();
    render(<App token={null} mode="web" deps={deps} canvasHost={host} />);
    await userEvent.selectOptions(await screen.findByLabelText("Proje"), "ucgen");
    await screen.findByLabelText("editör src/main.c");
    act(() => handlers!.onStatus("connected"));
    emit({ type: "job.started", jobId: "r1", kind: "run" });
    expect(screen.getByRole("tab", { name: "Görüntü" })).toHaveAttribute("aria-selected", "true");
    expect(document.querySelector('[data-testid="canvas-host"]')).toBeInTheDocument();
    expect(screen.queryByTestId("stream")).not.toBeInTheDocument(); // WebRTC değil, doğrudan canvas
  });

  it("tarayıcı modu: program hatayla biterse terminale döner (hata mesajı görünsün)", async () => {
    const deps = makeDeps();
    render(<App token={null} mode="web" deps={deps} canvasHost={document.createElement("div")} />);
    await userEvent.selectOptions(await screen.findByLabelText("Proje"), "ucgen");
    await screen.findByLabelText("editör src/main.c");
    act(() => handlers!.onStatus("connected"));
    emit({ type: "job.started", jobId: "r1", kind: "run" });
    expect(screen.getByRole("tab", { name: "Görüntü" })).toHaveAttribute("aria-selected", "true");
    emit({ type: "job.exited", jobId: "r1", kind: "run", code: 1, durationMs: 5, reason: "exit", outputTruncated: false });
    expect(screen.getByRole("tab", { name: "Terminal" })).toHaveAttribute("aria-selected", "true");
  });

  it("tarayıcı modu: başarılı bitiş ya da Durdur görüntüde kalır", async () => {
    const deps = makeDeps();
    render(<App token={null} mode="web" deps={deps} canvasHost={document.createElement("div")} />);
    await userEvent.selectOptions(await screen.findByLabelText("Proje"), "ucgen");
    await screen.findByLabelText("editör src/main.c");
    act(() => handlers!.onStatus("connected"));
    emit({ type: "job.started", jobId: "r1", kind: "run" });
    emit({ type: "job.exited", jobId: "r1", kind: "run", code: 1, durationMs: 5, reason: "killed", outputTruncated: false });
    expect(screen.getByRole("tab", { name: "Görüntü" })).toHaveAttribute("aria-selected", "true");
  });

  it("toolchain eksikse uyarır", async () => {
    const deps = makeDeps({
      health: vi.fn().mockResolvedValue({ version: "0.1.0", toolchain: { ok: false, missing: ["gcc", "glfw"], versions: {} } }),
    });
    render(<App token="tok" deps={deps} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("gcc, glfw");
  });

  it("tarayıcı modunda eksik tarayıcı desteğini açılışta bildirir", async () => {
    const deps = makeDeps();
    render(<App token={null} mode="web" deps={deps} supportNote="Bu tarayıcı programları çalıştıramaz (eksik: WebGL2)." />);
    expect(await screen.findByRole("alert")).toHaveTextContent("eksik: WebGL2");
  });
});
