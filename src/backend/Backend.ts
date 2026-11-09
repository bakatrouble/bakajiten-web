// WASM backend: artifact bytes come from the IndexedDB cache,
// filled by gzip downloads the user explicitly confirms (see
// checkCache/loadPlan). backend() awaits the shared load for
// components; tests drive the flow directly.
import { type DictEntry, Dictionary, KanjiDictionary } from '../vendor/libdict/dict.ts';
import { Recognizer } from '../vendor/librecognizer/recognizer.ts';
import { decodeWire } from './gzip.ts';
import { dataCache } from './idb.ts';
import { bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { unzipMember } from './zip.ts';

export interface LoadProgress {
    file: string;
    loaded: number;
    total: number;
}

export interface Backend {
    dict: Dictionary;
    kanji: KanjiDictionary;
    /** Handwriting engine when its model pack is installed (panel
     *  download or a warm cache); null otherwise. Dictionaries
     *  load without it — recognition degrades to the install
     *  prompt, never to a fetch. */
    recognizer: Recognizer | null;
}

export const REQUIRED_FILES = ['jmdict.bin', 'kanji.bin'];
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

/** Artifacts live next to the app: the Pages deploy bundles the
 *  data release into its own `data/` dir, local dev serves
 *  `public/data/` at `/data` after `pnpm fetch-data`. Relative so
 *  the app works under any subpath (project page, custom
 *  domain). */
export const DATA_DIR = 'data';

export interface DataRequest {
    url: string;
    headers: Record<string, string>;
}

/** Artifact request for a file under a data base. Always direct:
 *  the app serves its own artifacts same-origin (Pages deploy or
 *  local `public/data/`), the `?data=` override points at a fixture
 *  or a CORS-open host. */
export function dataRequest(dataBase: string, file: string): DataRequest {
    return { url: `${dataBase}/${file}`, headers: {} };
}

/// Where dictionaries come from: explicit argument, `?data=` URL
/// override (e2e, debugging), `VITE_DATA_BASE` build setting
/// (relative, so any subpath works), else the local `data/` dir.
/// Nothing is vendored into git.
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
    return typeof env === 'string' && env !== '' ? env : DATA_DIR;
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
    if (typeof crypto !== 'undefined' && crypto.subtle != null) {
        const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Insecure contexts (plain-HTTP LAN dev): crypto.subtle only
    // exists under HTTPS/localhost. Audited dependency instead of
    // hand-rolled crypto.
    return sha256Fallback(bytes);
}

/** Sync SHA-256 for insecure contexts (see above). Exported for
 *  tests; production reaches it only through sha256Hex. */
export function sha256Fallback(input: Uint8Array): string {
    return bytesToHex(sha256(input));
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
    if (words == null || kanjiBytes == null) {
        throw new Error('dictionary files missing from plan');
    }
    let constructed: Backend;
    try {
        constructed = {
            dict: Dictionary.create(words),
            kanji: KanjiDictionary.create(kanjiBytes),
            // The handwriting model loads on demand through
            // openCachedRecognizer/downloadRecognizerPack below —
            // never as part of the dictionary set.
            recognizer: null,
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

/** Handwriting model pack source: Google's `ja` digital-ink
 *  set (table mirrored from the Qt `ModelPacks`: pack names,
 *  dl.google.com URLs, AAR sha1s and sizes). dl.google.com sends
 *  no CORS headers, so the browser fetches through the CORS proxy
 *  below (`X-Target-URL` header); the proxy streams bytes
 *  unmodified and sha1 + sizes verify them. Dictionary artifacts
 *  stay same-origin — only these two zips use the proxy. */
export const RECOGNIZER_PROXY = 'https://cors.bakatrouble.me/';

export interface RecognizerPack {
    /** Converted member key (order feeds `convertModel`). */
    member: string;
    /** Zip download URL (sent as the proxy's `X-Target-URL`). */
    url: string;
    /** Lowercase sha1 of the zip wire bytes. */
    sha1: string;
    /** Zip wire bytes (download total + size check). */
    zipSize: number;
    /** Wanted member: entry name ends with this. */
    memberSuffix: string;
    /** Extracted member bytes (artifact size check). */
    artifactSize: number;
}

export const RECOGNIZER_PACKS: RecognizerPack[] = [
    {
        member: 'ja.tflite',
        url: 'https://dl.google.com/handwriting/models/lstm.japanese.tflite_5x144.tflite.20190523.zip',
        sha1: 'fc5c5f0a999635dfabb9bebb7a4834cc1b7f075d',
        zipSize: 3132494,
        memberSuffix: '.tflite',
        artifactSize: 4186912,
    },
    {
        member: 'ja.recospec',
        url: 'https://dl.google.com/handwriting/models/qrnn.ja.reco_20191217.fst_20190322.recospec.zip',
        sha1: '0cc70076bfeaee959e558ca55f0ae079f2fe5f25',
        zipSize: 46002,
        memberSuffix: '.recospec.local',
        artifactSize: 94195,
    },
];

/** Member keys in `convertModel` order (progress labels and the
 *  convert call both follow the table above). */
export const RECOGNIZER_PACK_FILES = RECOGNIZER_PACKS.map((p) => p.member);
/** IndexedDB key for the converted runtime bundle: one
 *  conversion per pack update, every later load decodes straight
 *  from it (offline included). */
export const RECOGNIZER_BUNDLE_KEY = 'ja.safetensors';
/** IndexedDB key for the pack versions the bundle converts. */
export const RECOGNIZER_VERSION_KEY = 'ja.safetensors.version';

/** Proxy request for a pack zip: the path is ignored, the full
 *  target rides the header (cors-proxy usage). A same-origin
 *  fetch would fail: dl.google.com sends no CORS headers. */
export function proxyRequest(target: string, proxyBase = RECOGNIZER_PROXY): DataRequest {
    return { url: proxyBase, headers: { 'X-Target-URL': target } };
}

/** Lowercase hex sha1 (zip verification; WebCrypto is async-only
 *  and absent on plain-HTTP LAN, so audited sync code like the
 *  sha256 fallback). */
export function sha1Hex(input: Uint8Array): string {
    return bytesToHex(sha1(input));
}

/// Pack-table identity the cached bundle converts (changes only
/// when the table above changes).
function packStamp(): string {
    return RECOGNIZER_PACKS.map((p) => `${p.member}@${p.sha1}`).join(',');
}

/// Fetch one pack zip through the proxy with the table total as
/// the progress denominator (the proxy streams chunked, so the
/// wire rarely carries a length), then verify size + sha1.
async function fetchPackZip(
    pack: RecognizerPack,
    onProgress: (p: LoadProgress) => void,
): Promise<Uint8Array> {
    const req = proxyRequest(pack.url);
    const resp = await fetch(req.url, { headers: req.headers });
    if (!resp.ok || resp.body == null) {
        throw new Error(`fetch ${pack.member}: ${resp.status}`);
    }
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
        onProgress({ file: pack.member, loaded, total: pack.zipSize });
    }
    const out = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.length;
    }
    if (out.length !== pack.zipSize) {
        throw new Error(
            `${pack.member}: got ${out.length} bytes, pack says ${pack.zipSize}`,
        );
    }
    if (sha1Hex(out) !== pack.sha1) {
        throw new Error(`${pack.member}: sha1 mismatch`);
    }
    return out;
}

export interface RecognizerPackStatus {
    /** Pack table compiled in with its proxy source. */
    published: boolean;
    /** Converted bundle cached and stamped from this table. */
    ready: boolean;
    /** Saved-bundle line for the panel (null when none cached). */
    savedLine: string | null;
    /** Catalog line for the panel. */
    latestLine: string | null;
}

function packVersionLine(): string {
    const total = RECOGNIZER_PACKS.reduce((t, p) => t + p.zipSize, 0);
    return `Latest · ≈${(total / 1048576).toFixed(0)} MB`;
}

/** Handwriting model state for the panel: table presence plus
 *  cache warmth. No network: the pack source is compiled in, the
 *  bundle check is a cache read. */
export async function recognizerPackStatus(): Promise<RecognizerPackStatus> {
    const bundle = await dataCache().get(RECOGNIZER_BUNDLE_KEY);
    const stamp = await dataCache().get(RECOGNIZER_VERSION_KEY);
    const stampText = stamp == null ? null : new TextDecoder().decode(stamp);
    const ready = bundle != null && stampText === packStamp();
    return {
        published: true,
        ready,
        savedLine:
            bundle != null
                ? `Saved on this device · ≈${(bundle.length / 1048576).toFixed(0)} MB`
                : null,
        latestLine: packVersionLine(),
    };
}

/// Download the handwriting pack (explicit tap only — the app
/// never fetches blobs uninvited): zips via the proxy, sha1 +
/// size verified, wanted members unzipped and size-checked,
/// converted once, bundle cached stamped with the table.
/// Returns a ready recognizer.
export async function downloadRecognizerPack(
    onProgress: (p: LoadProgress) => void = () => {},
): Promise<Recognizer> {
    const members = await Promise.all(
        RECOGNIZER_PACKS.map(async (pack) => {
            const zip = await fetchPackZip(pack, onProgress);
            const raw = await unzipMember(zip, pack.memberSuffix);
            if (raw.length !== pack.artifactSize) {
                throw new Error(
                    `${pack.member}: got ${raw.length} bytes, pack says ${pack.artifactSize}`,
                );
            }
            return raw;
        }),
    );
    const [tflite, recospec] = members;
    if (tflite == null || recospec == null) {
        throw new Error('handwriting pack download failed');
    }
    const bundle = Recognizer.convertModel(tflite, recospec);
    await dataCache().set(RECOGNIZER_BUNDLE_KEY, bundle.safetensors);
    await dataCache().set(RECOGNIZER_VERSION_KEY, new TextEncoder().encode(packStamp()));
    return Recognizer.create(bundle.safetensors);
}

/// Decode the cached bundle with no network (panel open, kanji
/// dialog, offline included). Null when nothing is cached, the
/// table moved on (stale: the panel offers the update), or the
/// bytes fail to decode (evicted, so retry re-downloads clean).
export async function openCachedRecognizer(): Promise<Recognizer | null> {
    const bytes = await dataCache().get(RECOGNIZER_BUNDLE_KEY);
    if (bytes == null) {
        return null;
    }
    const stamp = await dataCache().get(RECOGNIZER_VERSION_KEY);
    const stampText = stamp == null ? null : new TextDecoder().decode(stamp);
    if (stampText !== packStamp()) {
        return null;
    }
    try {
        return Recognizer.create(bytes);
    } catch {
        await dataCache().remove(RECOGNIZER_BUNDLE_KEY);
        await dataCache().remove(RECOGNIZER_VERSION_KEY);
        return null;
    }
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
