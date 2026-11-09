// ZIP member extraction via @zip.js/zip.js (maintained,
// streaming, CRC-checked). Workers off: inflate runs through
// CompressionStream on the calling thread, keeping the Vite
// bundle self-contained (no worker chunk to ship or precache).
import {
    configure,
    Uint8ArrayReader,
    Uint8ArrayWriter,
    ZipReader,
    type FileEntry,
} from '@zip.js/zip.js';

configure({ useWebWorkers: false });

function isFile(e: { directory: boolean; filename: string }): e is FileEntry {
    return !e.directory;
}

/** Extract the single entry whose name ends with `suffix`.
 *  Errors on none or more than one match; CRC and structure
 *  failures surface as the library's own errors. */
export async function unzipMember(zip: Uint8Array, suffix: string): Promise<Uint8Array> {
    const reader = new ZipReader(new Uint8ArrayReader(zip), { checkCrc32: true });
    try {
        const matches = (await reader.getEntries()).filter(
            (e): e is FileEntry => isFile(e) && e.filename.endsWith(suffix),
        );
        const [only] = matches;
        if (only == null) {
            throw new Error(`zip: no member ending with ${suffix}`);
        }
        if (matches.length > 1) {
            throw new Error(`zip: ambiguous suffix ${suffix} (${matches.length} members)`);
        }
        return only.getData(new Uint8ArrayWriter());
    } finally {
        await reader.close();
    }
}
