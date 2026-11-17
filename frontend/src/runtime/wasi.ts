// Tarayıcıda WebAssembly programı için en küçük WASI (preview1) uygulaması:
// stdout/stderr, argümanlar, ortam değişkenleri, saat, rastgele sayı, exit. Dosya sistemi yok.

export class Exit extends Error {
  constructor(public code: number) {
    super(`exit(${code})`);
  }
}

const ERRNO_SUCCESS = 0;
const ERRNO_BADF = 8;
const ERRNO_INVAL = 28;
const ERRNO_NOENT = 44;
const ERRNO_NOSYS = 52;
const ERRNO_ROFS = 69;
const ERRNO_SPIPE = 70;
const FILETYPE_CHARACTER_DEVICE = 2;
const FILETYPE_DIRECTORY = 3;
const FILETYPE_REGULAR_FILE = 4;
const PREOPEN_FD = 3; // "." = proje kökü (salt okunur)
const OFLAGS_WRITE = 0x1 | 0x4 | 0x8; // CREAT | EXCL | TRUNC
const FDFLAGS_APPEND = 0x1;
const ALL_RIGHTS = 0xffff_ffff_ffff_ffffn;

interface Options {
  args?: string[];
  env?: Record<string, string>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  memory: () => WebAssembly.Memory;
  /** Programın fopen ile okuyabileceği proje dosyaları (ör. shaders/*.vert); salt okunur. */
  files?: Record<string, string | Uint8Array>;
}

/** "./a/b" → "a/b"; kök dışına çıkan ya da mutlak yollar null. */
function normalize(path: string): string | null {
  const parts: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return null;
    parts.push(seg);
  }
  return path.startsWith("/") ? null : parts.join("/");
}

export type Wasi = Record<string, (...args: never[]) => number>;

export function createWasi({ args = ["program"], env = {}, stdout, stderr, memory, files = {} }: Options) {
  const fileData = new Map(
    Object.entries(files).map(([p, c]) => [p, typeof c === "string" ? new TextEncoder().encode(c) : c] as const),
  );
  const open = new Map<number, { data: Uint8Array; pos: number }>();
  let nextFd = PREOPEN_FD + 1;
  const encoder = new TextEncoder();
  const decoders: Record<number, TextDecoder> = { 1: new TextDecoder(), 2: new TextDecoder() };
  const view = () => new DataView(memory().buffer);
  const bytes = () => new Uint8Array(memory().buffer);
  const envList = Object.entries(env).map(([k, v]) => `${k}=${v}`);

  function sizes(list: string[], countPtr: number, sizePtr: number) {
    view().setUint32(countPtr, list.length, true);
    view().setUint32(sizePtr, list.reduce((n, s) => n + encoder.encode(s).length + 1, 0), true);
    return ERRNO_SUCCESS;
  }
  function fill(list: string[], ptrsPtr: number, bufPtr: number) {
    let offset = bufPtr;
    list.forEach((s, i) => {
      view().setUint32(ptrsPtr + i * 4, offset, true);
      const data = encoder.encode(s);
      bytes().set(data, offset);
      bytes()[offset + data.length] = 0;
      offset += data.length + 1;
    });
    return ERRNO_SUCCESS;
  }

  const impl = {
    args_sizes_get: (c: number, s: number) => sizes(args, c, s),
    args_get: (p: number, b: number) => fill(args, p, b),
    environ_sizes_get: (c: number, s: number) => sizes(envList, c, s),
    environ_get: (p: number, b: number) => fill(envList, p, b),

    fd_write(fd: number, iovs: number, iovsLen: number, nwrittenPtr: number) {
      if (fd !== 1 && fd !== 2) return ERRNO_BADF;
      let written = 0;
      let text = "";
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = view().getUint32(iovs + i * 8 + 4, true);
        text += decoders[fd].decode(bytes().subarray(ptr, ptr + len), { stream: true });
        written += len;
      }
      view().setUint32(nwrittenPtr, written, true);
      if (text) (fd === 1 ? stdout : stderr)(text);
      return ERRNO_SUCCESS;
    },
    fd_read(fd: number, iovs: number, iovsLen: number, nreadPtr: number) {
      const file = open.get(fd);
      if (!file) {
        view().setUint32(nreadPtr, 0, true); // stdin: dosya sonu
        return fd === 0 ? ERRNO_SUCCESS : ERRNO_BADF;
      }
      let total = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = view().getUint32(iovs + i * 8 + 4, true);
        const chunk = file.data.subarray(file.pos, file.pos + len);
        bytes().set(chunk, ptr);
        file.pos += chunk.length;
        total += chunk.length;
        if (chunk.length < len) break;
      }
      view().setUint32(nreadPtr, total, true);
      return ERRNO_SUCCESS;
    },
    fd_fdstat_get(fd: number, ptr: number) {
      const type = fd <= 2 ? FILETYPE_CHARACTER_DEVICE // libc stdout'u satır tamponlu tutar (terminal gibi)
        : fd === PREOPEN_FD ? FILETYPE_DIRECTORY : open.has(fd) ? FILETYPE_REGULAR_FILE : 0;
      if (!type) return ERRNO_BADF;
      view().setUint8(ptr, type);
      view().setUint16(ptr + 2, 0, true);
      view().setBigUint64(ptr + 8, fd > 2 ? ALL_RIGHTS : 0n, true);
      view().setBigUint64(ptr + 16, fd === PREOPEN_FD ? ALL_RIGHTS : 0n, true);
      return ERRNO_SUCCESS;
    },
    fd_filestat_get(fd: number, ptr: number) {
      const file = open.get(fd);
      if (!file) return ERRNO_BADF;
      for (let o = 0; o < 64; o += 8) view().setBigUint64(ptr + o, 0n, true);
      view().setUint8(ptr + 16, FILETYPE_REGULAR_FILE);
      view().setBigUint64(ptr + 24, 1n, true);
      view().setBigUint64(ptr + 32, BigInt(file.data.length), true);
      return ERRNO_SUCCESS;
    },
    fd_close: (fd: number) => (open.delete(fd), ERRNO_SUCCESS),
    fd_seek(fd: number, offset: bigint, whence: number, newOffsetPtr: number) {
      const file = open.get(fd);
      if (!file) return fd <= 2 ? ERRNO_SPIPE : ERRNO_BADF;
      const base = whence === 0 ? 0 : whence === 1 ? file.pos : file.data.length;
      const pos = base + Number(offset);
      if (pos < 0) return ERRNO_INVAL;
      file.pos = pos;
      view().setBigUint64(newOffsetPtr, BigInt(pos), true);
      return ERRNO_SUCCESS;
    },
    fd_tell(fd: number, ptr: number) {
      const file = open.get(fd);
      if (!file) return ERRNO_BADF;
      view().setBigUint64(ptr, BigInt(file.pos), true);
      return ERRNO_SUCCESS;
    },
    fd_prestat_get(fd: number, ptr: number) {
      if (fd !== PREOPEN_FD) return ERRNO_BADF;
      view().setUint8(ptr, 0); // dizin
      view().setUint32(ptr + 4, 1, true); // "." uzunluğu
      return ERRNO_SUCCESS;
    },
    fd_prestat_dir_name(fd: number, pathPtr: number, len: number) {
      if (fd !== PREOPEN_FD || len < 1) return ERRNO_BADF;
      bytes()[pathPtr] = ".".charCodeAt(0);
      return ERRNO_SUCCESS;
    },
    path_open(dirFd: number, _dirflags: number, pathPtr: number, pathLen: number, oflags: number,
      _rightsBase: bigint, _rightsInheriting: bigint, fdflags: number, fdPtr: number) {
      if (dirFd !== PREOPEN_FD) return ERRNO_BADF;
      if (oflags & OFLAGS_WRITE || fdflags & FDFLAGS_APPEND) return ERRNO_ROFS;
      const path = normalize(new TextDecoder().decode(bytes().subarray(pathPtr, pathPtr + pathLen)));
      const data = path === null ? undefined : fileData.get(path);
      if (!data) return ERRNO_NOENT;
      const fd = nextFd++;
      open.set(fd, { data, pos: 0 });
      view().setUint32(fdPtr, fd, true);
      return ERRNO_SUCCESS;
    },
    clock_time_get(id: number, _precision: bigint, ptr: number) {
      const ns = id === 0 ? BigInt(Date.now()) * 1_000_000n : BigInt(Math.round(performance.now() * 1e6));
      view().setBigUint64(ptr, ns, true);
      return ERRNO_SUCCESS;
    },
    clock_res_get(_id: number, ptr: number) {
      view().setBigUint64(ptr, 1000n, true);
      return ERRNO_SUCCESS;
    },
    random_get(ptr: number, len: number) {
      crypto.getRandomValues(bytes().subarray(ptr, ptr + len));
      return ERRNO_SUCCESS;
    },
    sched_yield: () => ERRNO_SUCCESS,
    proc_exit(code: number): number {
      throw new Exit(code);
    },
  };
  // Desteklenmeyen WASI çağrıları "ENOSYS" döner (program kendi hatasını yönetir).
  return new Proxy(impl, {
    get: (t, name) => (t as Record<string | symbol, unknown>)[name] ?? (() => ERRNO_NOSYS),
  }) as typeof impl & Record<string, (...args: never[]) => number>;
}
