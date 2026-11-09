// zip.js wrapper tests: fixtures built with the library's own
// ZipWriter (stored + deflated), decoded through
// src/backend/zip.ts. No network, no model packs.
import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import { unzipMember } from '../src/backend/zip.ts';

async function makeZip(files: { name: string; data: Uint8Array; level?: number }[]): Promise<Uint8Array> {
    const writer = new ZipWriter(new BlobWriter());
    for (const f of files) {
        await writer.add(f.name, new BlobReader(new Blob([f.data])), { level: f.level ?? 6 });
    }
    const blob = await writer.close();
    return new Uint8Array(await blob.arrayBuffer());
}

const STORED = new TextEncoder().encode('hello stored');
const DEFLATED = new TextEncoder().encode('deflated content '.repeat(20));

describe('unzipMember', () => {
    it('extracts a stored entry by suffix', async () => {
        const zip = await makeZip([{ name: 'models/plain.txt', data: STORED, level: 0 }]);
        expect(await unzipMember(zip, '.txt')).toEqual(STORED);
    });

    it('inflates a deflated entry with more content', async () => {
        const zip = await makeZip([{ name: 'models/net.tflite', data: DEFLATED }]);
        expect(await unzipMember(zip, '.tflite')).toEqual(DEFLATED);
    });

    it('picks the wanted member among several entries', async () => {
        const zip = await makeZip([
            { name: 'models/notes.txt', data: STORED, level: 0 },
            { name: 'pack/blob.recospec.local', data: DEFLATED },
        ]);
        expect(await unzipMember(zip, '.recospec.local')).toEqual(DEFLATED);
    });

    it('rejects an ambiguous suffix', async () => {
        const zip = await makeZip([
            { name: 'a/dup.txt', data: STORED, level: 0 },
            { name: 'b/dup.txt', data: STORED, level: 0 },
        ]);
        await expect(unzipMember(zip, 'dup.txt')).rejects.toThrow('ambiguous suffix');
    });

    it('rejects a missing member', async () => {
        const zip = await makeZip([{ name: 'models/plain.txt', data: STORED, level: 0 }]);
        await expect(unzipMember(zip, '.tflite')).rejects.toThrow('no member');
    });

    it('rejects non-zip bytes', async () => {
        await expect(unzipMember(new Uint8Array([1, 2, 3, 4]), '.txt')).rejects.toThrow();
    });

    it('rejects a byte-flipped stored member (CRC enforced)', async () => {
        const probe = new TextEncoder().encode('INTEGRITY-PROBE-0123456789');
        const zip = await makeZip([{ name: 'models/plain.txt', data: probe, level: 0 }]);
        // Stored data sits verbatim in the file: find and flip one
        // content byte (headers untouched).
        let at = -1;
        outer: for (let i = 0; i + probe.length <= zip.length; i++) {
            for (let j = 0; j < probe.length; j++) {
                if (zip[i + j] !== probe[j]) {
                    continue outer;
                }
            }
            at = i;
            break;
        }
        expect(at).toBeGreaterThanOrEqual(0);
        const corrupt = zip.slice();
        corrupt[at]! ^= 0xff;
        await expect(unzipMember(corrupt, '.txt')).rejects.toThrow();
    });
});
