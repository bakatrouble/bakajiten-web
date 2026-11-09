// Live handwriting-pack flow through the proxy request shape:
// stubbed fetch serves the repo data tree's Google zips keyed by
// the `X-Target-URL` header (no live network) → size + sha1
// verify → unzip → convert → cache → decode → recognize. Needs
// the `.zips` in the repo data tree (same deal as the e2e shell);
// skips where they are absent.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const DATA = join(import.meta.dirname, '..', '..', '..', 'data');
const TFLITE_ZIP = join(DATA, 'mlkit-ink', '.zips', 'lstm_japanese_tflite_5x144_tflite_20190523_zip.zip');
const RECOSPEC_ZIP = join(DATA, 'mlkit-ink', '.zips', 'qrnn_ja_reco_20191217_fst_20190322_recospec_zip.zip');
const PRESENT = existsSync(TFLITE_ZIP) && existsSync(RECOSPEC_ZIP);

describe.skipIf(!PRESENT)('recognizer pack (live)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('downloads via proxy, verifies, converts, caches, and recognizes', async () => {
        const tfliteZip = new Uint8Array(await readFile(TFLITE_ZIP));
        const recospecZip = new Uint8Array(await readFile(RECOSPEC_ZIP));
        const seenTargets: string[] = [];
        vi.stubGlobal('fetch', async (url: unknown, init?: unknown) => {
            // The app posts the Google URL as a header to the proxy
            // base — never fetches dl.google.com directly.
            expect(String(url)).toBe('https://cors.bakatrouble.me/');
            const headers = (init as { headers?: Record<string, string> } | undefined)?.headers;
            const target = headers?.['X-Target-URL'] ?? '';
            seenTargets.push(target);
            if (target.endsWith('tflite.20190523.zip')) {
                return new Response(new Blob([tfliteZip]), { status: 200 });
            }
            if (target.endsWith('recospec.zip')) {
                return new Response(new Blob([recospecZip]), { status: 200 });
            }
            throw new Error(`unexpected target ${target}`);
        });
        const {
            downloadRecognizerPack,
            openCachedRecognizer,
            recognizerPackStatus,
            RECOGNIZER_PACKS,
        } = await import('../src/backend/Backend.ts');
        const { setDataCache, MemoryCache } = await import('../src/backend/idb.ts');
        setDataCache(new MemoryCache());
        const seen: string[] = [];
        const r = await downloadRecognizerPack((p) => {
            seen.push(p.file);
        });
        expect(seenTargets).toEqual(RECOGNIZER_PACKS.map((p) => p.url));
        expect(new Set(seen)).toEqual(new Set(['ja.tflite', 'ja.recospec']));
        const cands = r.recognize(
            [
                [
                    { x: 30, y: 30 },
                    { x: 120, y: 120 },
                ],
            ],
            5,
        );
        expect(cands.length).toBeGreaterThan(0);
        expect(cands[0]!.text.length).toBeGreaterThan(0);
        // The cached bundle decodes with no further download.
        const status = await recognizerPackStatus();
        expect(status.published).toBe(true);
        expect(status.ready).toBe(true);
        expect(status.latestLine).toContain('Latest');
        expect(await openCachedRecognizer()).not.toBeNull();
    }, 120000);
});
