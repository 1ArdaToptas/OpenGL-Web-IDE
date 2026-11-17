import { describe, expect, it, vi } from "vitest";
import { Exit, createWasi } from "./wasi";

function setup(env: Record<string, string> = {}) {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const stdout = vi.fn();
  const stderr = vi.fn();
  const wasi = createWasi({ args: ["prog"], env, stdout, stderr, memory: () => memory });
  const view = new DataView(memory.buffer);
  const bytes = new Uint8Array(memory.buffer);
  return { wasi, view, bytes, stdout, stderr };
}

describe("WASI", () => {
  it("fd_write stdout'a UTF-8 metni (iovec'ler birleşerek) iletir", () => {
    const { wasi, view, bytes, stdout } = setup();
    const a = new TextEncoder().encode("merhaba ");
    const b = new TextEncoder().encode("dünya\n");
    bytes.set(a, 100);
    bytes.set(b, 200);
    view.setUint32(0, 100, true);
    view.setUint32(4, a.length, true);
    view.setUint32(8, 200, true);
    view.setUint32(12, b.length, true);
    expect(wasi.fd_write(1, 0, 2, 50)).toBe(0);
    expect(stdout).toHaveBeenCalledWith("merhaba dünya\n");
    expect(view.getUint32(50, true)).toBe(a.length + b.length);
  });

  it("parçalı UTF-8 karakterini iki yazma arasında doğru birleştirir", () => {
    const { wasi, view, bytes, stdout } = setup();
    const ç = new TextEncoder().encode("ç"); // 2 bayt
    bytes[100] = ç[0];
    bytes[101] = ç[1];
    view.setUint32(0, 100, true);
    view.setUint32(4, 1, true);
    wasi.fd_write(1, 0, 1, 50);
    view.setUint32(0, 101, true);
    wasi.fd_write(1, 0, 1, 50);
    expect(stdout.mock.calls.map((c) => c[0]).join("")).toBe("ç");
  });

  it("stderr ayrı kanaldır; bilinmeyen fd EBADF", () => {
    const { wasi, view, bytes, stderr } = setup();
    bytes.set(new TextEncoder().encode("hata"), 100);
    view.setUint32(0, 100, true);
    view.setUint32(4, 4, true);
    wasi.fd_write(2, 0, 1, 50);
    expect(stderr).toHaveBeenCalledWith("hata");
    expect(wasi.fd_write(7, 0, 1, 50)).toBe(8);
  });

  it("ortam değişkenleri getenv için doğru biçimde yazılır", () => {
    const { wasi, view, bytes } = setup({ OGLIDE_TEST_FRAMES: "10" });
    wasi.environ_sizes_get(0, 4);
    expect(view.getUint32(0, true)).toBe(1);
    expect(view.getUint32(4, true)).toBe("OGLIDE_TEST_FRAMES=10".length + 1);
    wasi.environ_get(16, 64);
    const ptr = view.getUint32(16, true);
    expect(new TextDecoder().decode(bytes.subarray(ptr, ptr + 21))).toBe("OGLIDE_TEST_FRAMES=10");
    expect(bytes[ptr + 21]).toBe(0);
  });

  it("proc_exit Exit istisnası fırlatır", () => {
    const { wasi } = setup();
    expect(() => wasi.proc_exit(3)).toThrow(Exit);
    try {
      wasi.proc_exit(3);
    } catch (e) {
      expect((e as Exit).code).toBe(3);
    }
  });

  it("desteklenmeyen çağrı ENOSYS döner", () => {
    const { wasi } = setup();
    expect((wasi as Record<string, () => number>).sock_accept()).toBe(52);
  });

  describe("salt okunur proje dosya sistemi (shader dosyaları için)", () => {
    function fsSetup() {
      const memory = new WebAssembly.Memory({ initial: 1 });
      const wasi = createWasi({
        stdout: vi.fn(), stderr: vi.fn(), memory: () => memory,
        files: { "shaders/basic.vert": "#version 330 core\nvoid main(){}\n", "src/main.c": "x" },
      });
      const view = new DataView(memory.buffer);
      const bytes = new Uint8Array(memory.buffer);
      const open = (path: string, oflags = 0) => {
        bytes.set(new TextEncoder().encode(path), 1000);
        const errno = wasi.path_open(3, 0, 1000, path.length, oflags, 0n, 0n, 0, 2000);
        return { errno, fd: view.getUint32(2000, true) };
      };
      return { wasi, view, bytes, open };
    }

    it("fd 3 '.' olarak önceden açılmış dizindir", () => {
      const { wasi, view, bytes } = fsSetup();
      expect(wasi.fd_prestat_get(3, 0)).toBe(0);
      expect(view.getUint8(0)).toBe(0); // dizin
      expect(view.getUint32(4, true)).toBe(1);
      wasi.fd_prestat_dir_name(3, 100, 1);
      expect(String.fromCharCode(bytes[100])).toBe(".");
      expect(wasi.fd_prestat_get(4, 0)).toBe(8); // başka preopen yok
    });

    it("dosyayı açar, okur; fseek(SEEK_END)/ftell ile boyut alınır", () => {
      const { wasi, view, bytes, open } = fsSetup();
      const { errno, fd } = open("shaders/basic.vert");
      expect(errno).toBe(0);
      expect(wasi.fd_seek(fd, 0n, 2, 16)).toBe(0); // SEEK_END
      expect(Number(view.getBigUint64(16, true))).toBe(32);
      wasi.fd_seek(fd, 0n, 0, 16); // SEEK_SET
      view.setUint32(0, 3000, true);
      view.setUint32(4, 100, true);
      expect(wasi.fd_read(fd, 0, 1, 24)).toBe(0);
      expect(view.getUint32(24, true)).toBe(32);
      expect(new TextDecoder().decode(bytes.subarray(3000, 3017))).toBe("#version 330 core");
      expect(wasi.fd_read(fd, 0, 1, 24)).toBe(0);
      expect(view.getUint32(24, true)).toBe(0); // dosya sonu
      expect(wasi.fd_close(fd)).toBe(0);
    });

    it("'./' önekini kabul eder; olmayan dosya ENOENT", () => {
      const { open } = fsSetup();
      expect(open("./src/main.c").errno).toBe(0);
      expect(open("shaders/yok.frag").errno).toBe(44);
    });

    it("dizin dışına çıkış ve yazma reddedilir", () => {
      const { open } = fsSetup();
      expect(open("../gizli.txt").errno).toBe(44);
      expect(open("shaders/../../x").errno).toBe(44);
      expect(open("shaders/basic.vert", 1 /* O_CREAT */).errno).toBe(69); // EROFS
    });
  });

  it("stdout karakter aygıtı görünür (satır tamponlu printf)", () => {
    const { wasi, view } = setup();
    expect(wasi.fd_fdstat_get(1, 0)).toBe(0);
    expect(view.getUint8(0)).toBe(2);
  });
});
