// Tarayıcıda WebAssembly programı için en küçük WASI (preview1) uygulaması:
// stdout/stderr, argümanlar, ortam değişkenleri, saat, rastgele sayı, exit. Dosya sistemi yok.

export class Exit extends Error {
  constructor(code) {
    super(`exit(${code})`);
    this.code = code;
  }
}

const ERRNO_SUCCESS = 0;
const ERRNO_BADF = 8;
const ERRNO_NOSYS = 52;
const ERRNO_SPIPE = 70;
const FILETYPE_CHARACTER_DEVICE = 2;

export function createWasi({ args = ["program"], env = {}, stdout, stderr, memory }) {
  const encoder = new TextEncoder();
  const decoders = { 1: new TextDecoder(), 2: new TextDecoder() };
  const view = () => new DataView(memory().buffer);
  const bytes = () => new Uint8Array(memory().buffer);
  const envList = Object.entries(env).map(([k, v]) => `${k}=${v}`);

  // Dizi listesini (argv / environ) WASI biçiminde yazar.
  function sizes(list, countPtr, sizePtr) {
    view().setUint32(countPtr, list.length, true);
    view().setUint32(sizePtr, list.reduce((n, s) => n + encoder.encode(s).length + 1, 0), true);
    return ERRNO_SUCCESS;
  }
  function fill(list, ptrsPtr, bufPtr) {
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
    args_sizes_get: (c, s) => sizes(args, c, s),
    args_get: (p, b) => fill(args, p, b),
    environ_sizes_get: (c, s) => sizes(envList, c, s),
    environ_get: (p, b) => fill(envList, p, b),

    fd_write(fd, iovs, iovsLen, nwrittenPtr) {
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
    fd_read(fd, iovs, iovsLen, nreadPtr) {
      view().setUint32(nreadPtr, 0, true); // stdin: dosya sonu
      return fd === 0 ? ERRNO_SUCCESS : ERRNO_BADF;
    },
    fd_fdstat_get(fd, ptr) {
      if (fd > 2) return ERRNO_BADF;
      // Karakter aygıtı: libc stdout'u satır tamponlu tutar (terminal gibi).
      view().setUint8(ptr, FILETYPE_CHARACTER_DEVICE);
      view().setUint16(ptr + 2, 0, true);
      view().setBigUint64(ptr + 8, 0n, true);
      view().setBigUint64(ptr + 16, 0n, true);
      return ERRNO_SUCCESS;
    },
    fd_close: () => ERRNO_SUCCESS,
    fd_seek: () => ERRNO_SPIPE,
    fd_prestat_get: () => ERRNO_BADF,
    fd_prestat_dir_name: () => ERRNO_BADF,
    clock_time_get(id, _precision, ptr) {
      const ns = id === 0 ? BigInt(Date.now()) * 1_000_000n : BigInt(Math.round(performance.now() * 1e6));
      view().setBigUint64(ptr, ns, true);
      return ERRNO_SUCCESS;
    },
    clock_res_get(_id, ptr) {
      view().setBigUint64(ptr, 1000n, true);
      return ERRNO_SUCCESS;
    },
    random_get(ptr, len) {
      crypto.getRandomValues(bytes().subarray(ptr, ptr + len));
      return ERRNO_SUCCESS;
    },
    sched_yield: () => ERRNO_SUCCESS,
    proc_exit(code) {
      throw new Exit(code);
    },
  };
  // Desteklenmeyen WASI çağrıları "ENOSYS" döner (program kendi hatasını yönetir).
  return new Proxy(impl, { get: (t, name) => t[name] ?? (() => ERRNO_NOSYS) });
}
