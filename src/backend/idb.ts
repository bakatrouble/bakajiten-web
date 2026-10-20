// Tiny artifact cache: IndexedDB when available, an in-memory map
// otherwise (private mode, SSR, unit tests — same interface, just
// not persistent). One store: key -> Uint8Array, plus __manifest.
export interface Cache {
    get(key: string): Promise<Uint8Array | null>;
    set(key: string, bytes: Uint8Array): Promise<void>;
    remove(key: string): Promise<void>;
    clear(): Promise<void>;
    usage(): Promise<number>;
}

const DB = 'bakajiten-data';
const STORE = 'blobs';

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function tx<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        // Belt and suspenders: a bare abort (quota, oversized value)
        // must reject, never hang the caller.
        t.onabort = () => reject(t.error ?? new Error('transaction aborted'));
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Chromium caps one IDB value around ~127 MB; jmnedict exceeds it
// unpacked. Chunk large values (count + pieces); small ones stay
// single records.
export const CHUNK = 8 * 1048576;
export const countKey = (key: string) => `${key}#n`;
export const chunkKey = (key: string, i: number) => `${key}#${i}`;

export function split(bytes: Uint8Array): Uint8Array[] {
    if (bytes.length <= CHUNK) {
        return [bytes];
    }
    const out: Uint8Array[] = [];
    for (let i = 0; i * CHUNK < bytes.length; i++) {
        out.push(bytes.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    return out;
}

export function join(parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((t, p) => t + p.length, 0));
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
}

class IdbCache implements Cache {
    private db: Promise<IDBDatabase> | null = null;

    private ready(): Promise<IDBDatabase> {
        if (this.db == null) {
            this.db = openDb();
        }
        return this.db;
    }

    async get(key: string): Promise<Uint8Array | null> {
        const db = await this.ready();
        const n = await tx(db, 'readonly', (s) => s.get(countKey(key)));
        if (typeof n === 'number') {
            const parts: Uint8Array[] = [];
            for (let i = 0; i < n; i++) {
                const c = await tx(db, 'readonly', (s) => s.get(chunkKey(key, i)));
                if (!(c instanceof Uint8Array)) {
                    return null;
                }
                parts.push(c);
            }
            return join(parts);
        }
        const v = await tx(db, 'readonly', (s) => s.get(key));
        return v instanceof Uint8Array ? v : null;
    }

    async set(key: string, bytes: Uint8Array): Promise<void> {
        const db = await this.ready();
        await this.remove(key);
        const parts = split(bytes);
        if (parts.length === 1) {
            await tx(db, 'readwrite', (s) => s.put(parts[0], key));
            return;
        }
        for (let i = 0; i < parts.length; i++) {
            await tx(db, 'readwrite', (s) => s.put(parts[i], chunkKey(key, i)));
        }
        await tx(db, 'readwrite', (s) => s.put(parts.length, countKey(key)));
    }

    async remove(key: string): Promise<void> {
        const db = await this.ready();
        const n = await tx(db, 'readonly', (s) => s.get(countKey(key)));
        await tx(db, 'readwrite', (s) => s.delete(key));
        if (typeof n === 'number') {
            for (let i = 0; i < n; i++) {
                await tx(db, 'readwrite', (s) => s.delete(chunkKey(key, i)));
            }
            await tx(db, 'readwrite', (s) => s.delete(countKey(key)));
        }
    }

    async clear(): Promise<void> {
        const db = await this.ready();
        await tx(db, 'readwrite', (s) => s.clear());
    }

    async usage(): Promise<number> {
        const db = await this.ready();
        let total = 0;
        await new Promise<void>((resolve, reject) => {
            const t = db.transaction(STORE, 'readonly');
            const cursor = t.objectStore(STORE).openCursor();
            cursor.onsuccess = () => {
                const c = cursor.result;
                if (c == null) {
                    resolve();
                    return;
                }
                if (c.value instanceof Uint8Array) {
                    total += c.value.byteLength;
                }
                c.continue();
            };
            cursor.onerror = () => reject(cursor.error);
        });
        return total;
    }
}

class MemoryCache implements Cache {
    private map = new Map<string, Uint8Array>();

    async get(key: string): Promise<Uint8Array | null> {
        return this.map.get(key) ?? null;
    }

    async set(key: string, bytes: Uint8Array): Promise<void> {
        this.map.set(key, bytes);
    }

    async remove(key: string): Promise<void> {
        this.map.delete(key);
    }

    async clear(): Promise<void> {
        this.map.clear();
    }

    async usage(): Promise<number> {
        let total = 0;
        for (const v of this.map.values()) {
            total += v.byteLength;
        }
        return total;
    }
}

let cache: Cache | null = null;

/// Shared cache (IDB in browsers, memory elsewhere).
export function dataCache(): Cache {
    if (cache == null) {
        cache = typeof indexedDB === 'undefined' ? new MemoryCache() : new IdbCache();
    }
    return cache;
}

/** Test hook: replace the shared cache. */
export function setDataCache(c: Cache): void {
    cache = c;
}

export { MemoryCache };
