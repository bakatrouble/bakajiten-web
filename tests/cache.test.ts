// Cache unit tests: memory fallback round-trip and gzip decode.
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { checkCache, loadPlan } from '../src/backend/Backend.ts';
import { decodeWire } from '../src/backend/gzip.ts';
import { CHUNK, join, MemoryCache, setDataCache, split } from '../src/backend/idb.ts';
import { DATA_URL } from './setup.ts';

describe('memory cache', () => {
    it('round-trips bytes and reports usage', async () => {
        const c = new MemoryCache();
        expect(await c.get('x')).toBeNull();
        await c.set('x', new Uint8Array([1, 2, 3]));
        expect(await c.get('x')).toEqual(new Uint8Array([1, 2, 3]));
        expect(await c.usage()).toBe(3);
        await c.remove('x');
        expect(await c.get('x')).toBeNull();
        await c.set('y', new Uint8Array(10));
        await c.clear();
        expect(await c.usage()).toBe(0);
    });
});

describe('chunking', () => {
    it('round-trips across the chunk boundary', () => {
        const big = new Uint8Array(CHUNK + 123);
        for (let i = 0; i < big.length; i++) {
            big[i] = i % 251;
        }
        const parts = split(big);
        expect(parts.length).toBe(2);
        expect(parts[0]!.length).toBe(CHUNK);
        expect(join(parts)).toEqual(big);
        expect(split(new Uint8Array(10)).length).toBe(1);
    });
});

describe('decodeWire', () => {
    it('decodes gzip to the exact bytes', async () => {
        const raw = new TextEncoder().encode('日本語テスト'.repeat(100));
        const gz = Uint8Array.from(gzipSync(raw));
        const seen: number[] = [];
        const out = await decodeWire(gz, raw.length, (n) => seen.push(n));
        expect(out).toEqual(raw);
        expect(seen.at(-1)).toBe(raw.length);
    });

    it('passes through already-decoded bodies', async () => {
        const raw = new TextEncoder().encode('plain-body'.repeat(100));
        const out = await decodeWire(raw, raw.length, () => {});
        expect(out).toEqual(raw);
    });
});

describe('plan flow', () => {
    it('downloads missing files, then reuses the cache', async () => {
        setDataCache(new MemoryCache());
        const first = await checkCache(DATA_URL);
        expect(first.manifest).not.toBeNull();
        expect(first.needsDownload).toBe(true);
        expect(first.totalGz).toBeGreaterThan(0);
        const seen: string[] = [];
        await loadPlan(first, (p) => {
            seen.push(p.file);
        });
        expect(new Set(seen)).toEqual(new Set(['jmdict.bin', 'kanji.bin', 'templates.bin']));
        const second = await checkCache(DATA_URL);
        expect(second.needsDownload).toBe(false);
        expect(second.totalGz).toBe(0);
        // Cached load constructs a working backend without fetching.
        const b = await loadPlan(second, () => {
            throw new Error('should not download');
        });
        expect(b.dict.search('たべる', 'Exact', 5)[0]?.heading).toBe('食べる');
    });
});
