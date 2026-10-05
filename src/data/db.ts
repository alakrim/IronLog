/**
 * Local persistence. IndexedDB in the browser and in the Capacitor WebView.
 * Small repository surface so it can be swapped for SQLite or wrapped with sync later.
 * Falls back to in-memory storage (with a warning flag) if IndexedDB is unavailable.
 */
export type StoreName = 'meta' | 'exercises' | 'templates' | 'workouts' | 'prs';
const STORES: StoreName[] = ['meta', 'exercises', 'templates', 'workouts', 'prs'];
const DB_NAME = 'ironlog';
const DB_VERSION = 1;

export interface Repo {
  persistent: boolean;
  getAll<T>(store: StoreName): Promise<T[]>;
  get<T>(store: StoreName, id: string): Promise<T | undefined>;
  put<T extends { id: string }>(store: StoreName, value: T): Promise<void>;
  putMany<T extends { id: string }>(store: StoreName, values: T[]): Promise<void>;
  remove(store: StoreName, id: string): Promise<void>;
  clearAll(): Promise<void>;
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction) =>
  new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = factory.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('Database blocked'));
  });
}

class IdbRepo implements Repo {
  persistent = true;
  constructor(private db: IDBDatabase) {}
  async getAll<T>(store: StoreName) {
    return req(this.db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
  }
  async get<T>(store: StoreName, id: string) {
    return req(this.db.transaction(store).objectStore(store).get(id)) as Promise<T | undefined>;
  }
  async put<T extends { id: string }>(store: StoreName, value: T) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(clone(value));
    await done(tx);
  }
  async putMany<T extends { id: string }>(store: StoreName, values: T[]) {
    const tx = this.db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const v of values) os.put(clone(v));
    await done(tx);
  }
  async remove(store: StoreName, id: string) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    await done(tx);
  }
  async clearAll() {
    const tx = this.db.transaction(STORES, 'readwrite');
    for (const s of STORES) tx.objectStore(s).clear();
    await done(tx);
  }
}

export class MemoryRepo implements Repo {
  persistent = false;
  private data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));
  async getAll<T>(s: StoreName) { return [...this.data.get(s)!.values()].map(clone) as T[]; }
  async get<T>(s: StoreName, id: string) { const v = this.data.get(s)!.get(id); return v === undefined ? undefined : clone(v as T); }
  async put<T extends { id: string }>(s: StoreName, v: T) { this.data.get(s)!.set(v.id, clone(v)); }
  async putMany<T extends { id: string }>(s: StoreName, vs: T[]) { for (const v of vs) await this.put(s, v); }
  async remove(s: StoreName, id: string) { this.data.get(s)!.delete(id); }
  async clearAll() { for (const m of this.data.values()) m.clear(); }
}

function clone<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

export async function openRepo(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<Repo> {
  try {
    if (!factory) throw new Error('IndexedDB unavailable');
    const db = await openDb(factory);
    try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
    return new IdbRepo(db);
  } catch (e) {
    console.warn('Falling back to in-memory storage', e);
    return new MemoryRepo();
  }
}
