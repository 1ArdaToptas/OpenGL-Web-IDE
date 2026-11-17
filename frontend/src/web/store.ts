// Tarayıcı modunda kalıcı depo: projeler ziyaretçinin tarayıcısında (IndexedDB). Sunucuya hiçbir şey gitmez.

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Testler ve IndexedDB kullanılamayan ortamlar (ör. gizli pencere kısıtları) için. */
export class MemoryStore implements KeyValueStore {
  private data = new Map<string, unknown>();
  async get<T>(key: string) {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async set<T>(key: string, value: T) {
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string) {
    this.data.delete(key);
  }
}

export class IdbStore implements KeyValueStore {
  private db: Promise<IDBDatabase>;

  constructor(name = "opengl-web-ide") {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async tx<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = op(db.transaction("kv", mode).objectStore("kv"));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  }

  get<T>(key: string) {
    return this.tx<T | undefined>("readonly", (s) => s.get(key));
  }
  async set<T>(key: string, value: T) {
    await this.tx("readwrite", (s) => s.put(value, key));
  }
  async delete(key: string) {
    await this.tx("readwrite", (s) => s.delete(key));
  }
}
