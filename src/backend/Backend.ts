// WASM backend: artifact bytes come from the IndexedDB cache,
// filled by gzip downloads the user explicitly confirms (see
// checkCache/loadPlan). backend() awaits the shared load for
// components; tests drive the flow directly.
import { type DictEntry, Dictionary, KanjiDictionary } from '../vendor/libdict/dict.ts';
import { Recognizer } from '../vendor/librecognizer/recognizer.ts';
import { decodeWire } from './gzip.ts';
import { dataCache } from './idb.ts';

export interface LoadProgress {
    file: string;
    loaded: number;
    total: number;
}

export interface Backend {
    dict: Dictionary;
    kanji: KanjiDictionary;
    recognizer: Recognizer;
}

export const REQUIRED_FILES = ['jmdict.bin', 'kanji.bin', 'templates.bin'];
export const OPTIONAL_FILES = ['jmnedict.bin', 'kokugo.bin'];
const MANIFEST_KEY = '__manifest';

export type ScopeName = 'english' | 'names' | 'kokugo';
export const SCOPE_FILE: Record<ScopeName, string> = {
    english: 'jmdict.bin',
    names: 'jmnedict.bin',
    kokugo: 'kokugo.bin',
};

interface ManifestFile {
    size: number;
    gz: number;
    version?: string;
    sha256?: string;
    sources?: string[];
    last_changed_manifest?: string;
}

interface Manifest {
    version: number;
    build_date?: string;
    files: Record<string, ManifestFile>;
}

export type FileStatus = 'missing' | 'outdated' | 'current';

/** Data-repo release: versioned `.bin.gz` + size/sha256 manifest. */
export const RELEASE_BASE =
    'https://github.com/bakatrouble/bakajiten-data/releases/latest/download';

/** CORS proxy (cors-proxy) for artifact downloads: release hosts
 *  answer without CORS headers, so browsers cannot fetch them
 *  directly. The proxy follows the release redirect chain
 *  server-side and serves the final bytes with ACAO headers.
 *  The target goes in the `X-Target-URL` header; the proxy path
 *  is appended to it (path-append mode). */
export const CORS_PROXY = 'https://cors.bakatrouble.me';

export interface DataRequest {
    url: string;
    headers: Record<string, string>;
}

/** Artifact request for a file under a data base. Cross-origin
 *  http(s) targets route through the CORS proxy above; loopback
 *  and same-origin targets fetch direct — a remote proxy can reach
 *  neither the local fixture server nor gain anything from
 *  re-fetching our own origin (and localhost dev must work
 *  without it). */
export function dataRequest(dataBase: string, file: string): DataRequest {
    const target = `${dataBase}/${file}`;
    let u: URL;
    try {
        u = new URL(target, typeof location !== 'undefined' ? location.href : 'http://localhost/');
    } catch {
        return { url: target, headers: {} };
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { url: target, headers: {} };
    }
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1') {
        return { url: target, headers: {} };
    }
    if (typeof location !== 'undefined' && u.origin === location.origin) {
        return { url: target, headers: {} };
    }
    return {
        url: `${CORS_PROXY}/${file}`,
        headers: { 'X-Target-URL': dataBase.replace(/\/+$/, '') },
    };
}

/// Where dictionaries come from: explicit argument, `?data=` URL
/// override (e2e, debugging), `VITE_DATA_BASE` build setting, else
/// the data-repo release. Nothing is vendored.
export function defaultDataBase(): string {
    try {
        const q = new URLSearchParams(location.search).get('data');
        if (q != null && q !== '') {
            return q;
        }
    } catch {
        // Non-browser (unit tests): fall through below.
    }
    const env = import.meta.env?.VITE_DATA_BASE;
    return typeof env === 'string' && env !== '' ? env : RELEASE_BASE;
}

export interface FilePlan {
    name: string;
    /** Unpacked bytes (0 when unknown, raw fallback). */
    size: number;
    /** Wire bytes for this file (0 when unknown). */
    gz: number;
    /** Manifest version string, if published. */
    version: string;
    cached: boolean;
    status: FileStatus;
}

export interface CachePlan {
    dataBase: string;
    manifest: Manifest | null;
    files: FilePlan[];
    totalGz: number;
    totalSize: number;
    needsDownload: boolean;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/// What would load cost? Fetches the manifest (tiny), compares it
/// with the cached one, and reports per-file cache state. Never
/// downloads blobs. Falls back to raw .bin with unknown sizes when
/// no manifest is served.
export async function checkCache(dataBase = defaultDataBase()): Promise<CachePlan> {
    const cache = dataCache();
    let manifest: Manifest | null = null;
    try {
        const req = dataRequest(dataBase, 'manifest.json');
        const resp = await fetch(req.url, { cache: 'no-store', headers: req.headers });
        if (resp.ok) {
            manifest = (await resp.json()) as Manifest;
        }
    } catch {
        manifest = null;
    }
    const storedRaw = await cache.get(MANIFEST_KEY);
    let stored: Manifest | null = null;
    if (storedRaw != null) {
        try {
            stored = JSON.parse(new TextDecoder().decode(storedRaw));
        } catch {
            stored = null;
        }
    }
    const files: FilePlan[] = [];
    for (const name of [...REQUIRED_FILES, ...OPTIONAL_FILES]) {
        const info = manifest?.files[name];
        // Offline (no manifest) trusts the cache: bytes present means
        // current — nothing else can verify them. A manifest fetch
        // failure must not evict a warm cache.
        const entryChanged =
            manifest != null &&
            (stored == null ||
                JSON.stringify(stored.files[name] ?? null) !== JSON.stringify(info ?? null));
        const bytes = entryChanged ? null : await cache.get(name);
        let status: FileStatus = 'missing';
        if (bytes != null) {
            status = 'current';
            // Size first (cheap), then the manifest hash — a changed
            // entry already counts as outdated via entryChanged.
            if (entryChanged || (info != null && info.size > 0 && bytes.length !== info.size)) {
                status = 'outdated';
            } else if (info?.sha256 != null && info.sha256 !== '') {
                status = (await sha256Hex(bytes)) === info.sha256 ? 'current' : 'outdated';
            }
        }
        files.push({
            name,
            size: info?.size ?? 0,
            gz: info?.gz ?? 0,
            version: info?.version ?? '',
            cached: bytes != null && status === 'current',
            status,
        });
    }
    const required = files.filter((f) => REQUIRED_FILES.includes(f.name));
    return {
        dataBase,
        manifest,
        files,
        totalGz: required.reduce((t, f) => t + (f.cached ? 0 : f.gz), 0),
        totalSize: required.reduce((t, f) => t + (f.cached ? 0 : f.size), 0),
        needsDownload: required.some((f) => !f.cached),
    };
}

async function fetchBytes(
    req: DataRequest,
    onProgress: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
    const resp = await fetch(req.url, { cache: 'no-store', headers: req.headers });
    if (!resp.ok || resp.body == null) {
        throw new Error(`fetch ${req.url}: ${resp.status}`);
    }
    const total = Number(resp.headers.get('content-length') ?? 0);
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    const reader = resp.body.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        chunks.push(value);
        loaded += value.length;
        onProgress(loaded, total);
    }
    const out = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.length;
    }
    return out;
}

/// Verify freshly downloaded bytes against the plan manifest
/// (size, then sha256 when published). Mismatch evicts just this
/// file and throws, so a retry re-downloads it clean.
async function verifyFresh(plan: CachePlan, name: string, bytes: Uint8Array): Promise<void> {
    const info = plan.manifest?.files[name];
    const size = info?.size ?? 0;
    if (size > 0 && bytes.length !== size) {
        await dataCache().remove(name);
        throw new Error(`${name}: got ${bytes.length} bytes, manifest says ${size}`);
    }
    if (info?.sha256 != null && info.sha256 !== '') {
        if ((await sha256Hex(bytes)) !== info.sha256) {
            await dataCache().remove(name);
            throw new Error(`${name}: sha256 mismatch`);
        }
    }
}

async function fetchFile(
    plan: CachePlan,
    name: string,
    onProgress: (p: LoadProgress) => void,
): Promise<Uint8Array> {
    const cache = dataCache();
    const hit = plan.files.find((f) => f.name === name);
    if (hit?.cached === true) {
        const bytes = await cache.get(name);
        if (bytes != null) {
            return bytes;
        }
    }
    const size = hit?.size ?? 0;
    let bytes: Uint8Array;
    if (plan.manifest != null && size > 0) {
        // Wire progress tracks the transfer; decode progress tracks
        // the unpack against the manifest size. Clamp: transcoding
        // hosts deliver decoded bodies larger than Content-Length.
        const wire = await fetchBytes(dataRequest(plan.dataBase, `${name}.gz`), (loaded, total) =>
            onProgress({
                file: name,
                loaded: Math.min(loaded, total || size),
                total: total || size,
            }),
        );
        bytes = await decodeWire(wire, size, (loaded) =>
            onProgress({ file: name, loaded, total: size }),
        );
        await verifyFresh(plan, name, bytes);
    } else {
        bytes = await fetchBytes(dataRequest(plan.dataBase, name), (loaded, total) =>
            onProgress({ file: name, loaded, total }),
        );
    }
    await cache.set(name, bytes);
    return bytes;
}

/// Download what the plan misses (user-confirmed), cache it, and
/// construct the backend. Fresh bytes verify against the manifest
/// (size, then sha256); a bad file is evicted and the load throws,
/// so a retry re-downloads it clean. A constructor failure evicts
/// only the files materialized here, never the whole cache.
/// `names` selects which files to materialize (required trio by
/// default; scope switches fetch one optional dictionary through
/// `loadScopeFile` below).
export async function loadPlan(
    plan: CachePlan,
    onProgress: (p: LoadProgress) => void = () => {},
    names: string[] = REQUIRED_FILES,
): Promise<Backend> {
    const blobs = new Map(
        await Promise.all(
            names.map(async (n) => [n, await fetchFile(plan, n, onProgress)] as const),
        ),
    );
    const words = blobs.get('jmdict.bin');
    const kanjiBytes = blobs.get('kanji.bin');
    const templates = blobs.get('templates.bin');
    if (words == null || kanjiBytes == null || templates == null) {
        throw new Error('dictionary files missing from plan');
    }
    let constructed: Backend;
    try {
        constructed = {
            dict: Dictionary.create(words),
            kanji: KanjiDictionary.create(kanjiBytes),
            recognizer: Recognizer.create(templates),
        };
    } catch (e) {
        await Promise.all(names.map((n) => dataCache().remove(n)));
        throw e;
    }
    if (plan.manifest != null) {
        await dataCache().set(
            MANIFEST_KEY,
            new TextEncoder().encode(JSON.stringify(plan.manifest)),
        );
    }
    return constructed;
}

/// Fetch one optional dictionary file (names/kokugo scope),
/// honoring the plan's cache state. Null when the manifest
/// publishes no such file (the caller reverts the scope).
export async function loadScopeFile(
    plan: CachePlan,
    name: string,
    onProgress: (p: LoadProgress) => void = () => {},
): Promise<Uint8Array | null> {
    if (plan.manifest == null || plan.manifest.files[name] == null) {
        return null;
    }
    return fetchFile(plan, name, onProgress);
}

let ready: Promise<Backend> | null = null;

/// Shared backend for components. Prefer checkCache/loadPlan in UI
/// so the user confirms downloads; this auto-runs the whole flow
/// (used by tests and late mounters).
export function backend(
    dataBase = defaultDataBase(),
    onProgress: (p: LoadProgress) => void = () => {},
): Promise<Backend> {
    if (ready == null) {
        ready = (async () => {
            const plan = await checkCache(dataBase);
            return loadPlan(plan, onProgress);
        })();
    }
    return ready;
}

/** Seed the shared backend from an explicit UI flow. */
export function startLoad(
    plan: CachePlan,
    onProgress: (p: LoadProgress) => void = () => {},
): Promise<Backend> {
    ready = loadPlan(plan, onProgress);
    return ready;
}

export type { DictEntry };
