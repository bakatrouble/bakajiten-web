// Label shaping (desktop displaySenses semantics) + live search,
// deinflection chips, and kanji lookups through the real backend.

import { storeToRefs } from 'pinia';
import { describe, expect, it } from 'vitest';
import {
    badgeClass,
    displaySenses,
    isCommonWord,
    isKanaEntry,
    numberedContentSenses,
    preferKeb,
    preferReb,
    previewGloss,
    queryFor,
    senseGlossHtml,
} from '../src/backend/labels.ts';
import { Dict } from '../src/vendor/libdict/dict.ts';
import { loadBackend } from './fixtures.ts';

describe('display shaping', () => {
    it('drops numeric ・ tails from cross-references', () => {
        expect(queryFor('食べる・2')).toBe('食べる');
        expect(queryFor('食べる')).toBe('食べる');
    });

    it('flags common words by news/ichi priorities', async () => {
        const b = await loadBackend();
        const hits = b.dict.search('たべる', 'Exact', 5);
        expect(hits.length).toBeGreaterThan(0);
        expect(isCommonWord(hits[0]!)).toBe(true);
    });

    it('detects kana-only entries by the uk tag', async () => {
        const b = await loadBackend();
        const hits = b.dict.search('たべる', 'Exact', 5);
        expect(hits.length).toBeGreaterThan(0);
        expect(isKanaEntry(hits[0]!)).toBe(false);
        // Some entry in a broad scan must be kana-only; its badge
        // reads "kana" while the description stays intact.
        const broad = b.dict.search('あ', 'Prefix', 500);
        const kana = broad.find((e) => isKanaEntry(e));
        expect(kana).toBeDefined();
        const badges = displaySenses(kana!)[0]!.misc.map((t) => t.label);
        expect(badges).toContain('kana');
    });

    it('marks kana-only entries with a red kana marker', async () => {
        const { badgeClass, displaySenses } = await import('../src/backend/labels.ts');
        const b = await loadBackend();
        const broad = b.dict.search('あ', 'Prefix', 500);
        const kana = broad.find((e) => isKanaEntry(e));
        expect(kana).toBeDefined();
        const shown = displaySenses(kana!);
        const idx = shown.findIndex((s) => s.misc.some((t) => t.label === 'kana'));
        expect(idx).toBeGreaterThanOrEqual(0);
        // uk-derived kana renders warning-red with its description as tip.
        expect(badgeClass('kana', 'misc')).toBe('text-destructive');
        expect(shown[idx]!.misc.find((t) => t.label === 'kana')!.tip).toContain('kana alone');
    });

    it('dims misc tags and tips them like the desktop', async () => {
        const { badgeClass, displaySenses } = await import('../src/backend/labels.ts');
        const b = await loadBackend();
        const hits = b.dict.search('あの人', 'Exact', 5);
        expect(hits.length).toBeGreaterThan(0);
        const shown = displaySenses(hits[0]!);
        const idx = shown.findIndex((s) => s.misc.some((t) => t.label === 'arch'));
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(badgeClass('arch', 'misc')).toBe('text-muted-foreground');
        expect(shown[idx]!.misc.find((t) => t.label === 'arch')!.tip).toContain('archaic');
    });
});

describe('search', () => {
    it('finds exact entries with readings and glosses', async () => {
        const b = await loadBackend();
        const hits = b.dict.search('たべる', 'Exact', 5);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0]?.heading).toBe('食べる');
        expect(hits[0]?.reading).toBe('たべる');
        expect(previewGloss(hits[0]!)).toBe('to eat');
    });

    it('badges pos tags with description tips', async () => {
        const b = await loadBackend();
        const hits = b.dict.search('たべる', 'Exact', 5);
        const senses = displaySenses(hits[0]!);
        expect(senses[0]?.pos.map((t) => t.label)).toContain('vt');
        expect(senses[0]?.pos.map((t) => t.tip)).toContain('transitive verb');
    });

    it('highlights the query match inside sense glosses', async () => {
        const b = await loadBackend();
        const hits = b.dict.search('たべる', 'Exact', 5);
        expect(hits.length).toBeGreaterThan(0);
        const html = senseGlossHtml(displaySenses(hits[0]!)[0]!, 'eat');
        expect(html).toContain('eat</mark>');
        expect(html).toContain('<mark');
        expect(senseGlossHtml(displaySenses(hits[0]!)[0]!, 'zzz-no-match')).not.toContain('<mark');
    });

    it('numbers content senses without closing gaps', async () => {
        const b = await loadBackend();
        const hits = b.dict.search('あの人', 'Exact', 5);
        expect(hits.length).toBeGreaterThan(0);
        const numbered = numberedContentSenses(hits[0]!);
        // Empty senses are dropped but the survivors keep
        // their original numbers.
        expect(numbered.length).toBeGreaterThan(0);
        expect(numbered.every((r) => r.sense.glosses.length > 0 || r.sense.info.length > 0)).toBe(
            true,
        );
        expect(numbered.map((r) => r.n)).toEqual(
            [...numbered.map((r) => r.n)].sort((a, b) => a - b),
        );
    });

    it('paints tag kinds like the desktop MeaningBuilder', () => {
        expect(badgeClass('kana', 'misc')).toBe('text-destructive');
        expect(badgeClass('arch', 'misc')).toBe('text-muted-foreground');
        expect(badgeClass('vt', 'pos')).toBe('text-emerald-600 dark:text-emerald-500');
        expect(badgeClass('n', 'field')).toBe('text-sky-600 dark:text-sky-400');
    });

    it('deinflects past tense with a reason chain', async () => {
        const b = await loadBackend();
        const ds = b.dict.deinflect('たべた');
        expect(ds[0]?.surface).toBe('たべる');
        expect(ds[0]?.chain).toContain('past');
    });

    it('searches English glosses in meaning mode', async () => {
        const b = await loadBackend();
        const hits = b.dict.searchMeaningIndices('to eat', 20);
        expect(hits.length).toBeGreaterThan(0);
        const headings = hits
            .map((h) => b.dict.entryAt(h.idx)?.heading)
            .filter((h): h is string => h != null);
        expect(headings).toContain('食べる');
    });

    it('loads the names scope on demand', async () => {
        const { loadScopeFile } = await import('../src/backend/Backend.ts');
        const { checkCache } = await import('../src/backend/Backend.ts');
        const { DATA_URL } = await import('./setup.ts');
        const plan = await checkCache(DATA_URL);
        const bytes = await loadScopeFile(plan, 'jmnedict.bin');
        expect(bytes).not.toBeNull();
        const { Dictionary } = await import('../src/vendor/libdict/dict.ts');
        const names = Dictionary.create(bytes!);
        expect(names.searchIndices('たろう', 'Exact', 5).length).toBeGreaterThan(0);
    });

    it('loads the kokugo scope on demand', async () => {
        const { loadScopeFile } = await import('../src/backend/Backend.ts');
        const { checkCache } = await import('../src/backend/Backend.ts');
        const { DATA_URL } = await import('./setup.ts');
        const plan = await checkCache(DATA_URL);
        const bytes = await loadScopeFile(plan, 'kokugo.bin');
        expect(bytes).not.toBeNull();
        const { Dictionary } = await import('../src/vendor/libdict/dict.ts');
        const kokugo = Dictionary.create(bytes!);
        expect(kokugo.searchIndices('たべる', 'Exact', 5).length).toBeGreaterThan(0);
    });

    it('switches scope with parked query', async () => {
        const { useSearch } = await import('../src/state/search.ts');
        const { DATA_URL } = await import('./setup.ts');
        const search = useSearch();
        const { scope } = storeToRefs(search);
        expect(await search.setScope('names', DATA_URL)).toBe(true);
        expect(scope.value).toBe('names');
        expect(await search.setScope('english')).toBe(true);
        expect(scope.value).toBe('english');
    });

    it('reverts the scope switch when the manifest lacks the file', async () => {
        const { vi } = await import('vitest');
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                status: 200,
                json: async () => ({ version: 1, files: {} }),
            })),
        );
        try {
            // Fresh store: no cached scope dictionaries from other tests.
            const { setActivePinia, createPinia, storeToRefs } = await import('pinia');
            setActivePinia(createPinia());
            const { useSearch } = await import('../src/state/search.ts');
            const search = useSearch();
            const { scope } = storeToRefs(search);
            expect(await search.setScope('names', 'http://example.invalid/')).toBe(false);
            expect(scope.value).toBe('english');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('segments furigana', () => {
        expect(Dict.furiganaSegment('食べる', 'たべる')).toEqual([
            { text: '食', ruby: 'た' },
            { text: 'べる', ruby: '' },
        ]);
    });
});

describe('index path (virtual rows)', () => {
    it('entryAt resolves the same record as search', async () => {
        const b = await loadBackend();
        const hits = b.dict.searchIndices('たべる', 'Exact', 10);
        expect(hits.length).toBeGreaterThan(0);
        const e = b.dict.entryAt(hits[0]!.idx);
        expect(e?.heading).toBe('食べる');
    });

    it('a broad query returns the full set, not the old 200 cap', async () => {
        const b = await loadBackend();
        const hits = b.dict.searchIndices('あ', 'Prefix', 0xffffffff);
        expect(hits.length).toBeGreaterThan(200);
    });
});

describe('kanji', () => {
    it('looks up readings and meanings', async () => {
        const b = await loadBackend();
        const e = b.kanji.lookup('食');
        expect(e?.meanings.slice(0, 2)).toEqual(['eat', 'food']);
        expect(e?.on).toContain('ショク');
    });

    it('returns stroke trajectories', async () => {
        const b = await loadBackend();
        const strokes = b.kanji.strokes('食');
        expect(strokes.length).toBe(9);
        expect(strokes[0]?.points.length).toBeGreaterThan(1);
    });

    it('lists words containing the character', async () => {
        const b = await loadBackend();
        const heads = b.dict.searchMiddle('食', 5).map((h) => h.heading);
        expect(heads).toContain('食べる');
    });
});

describe('preferred forms', () => {
    it('prefers the kanji/reading for the matched edge', async () => {
        const b = await loadBackend();
        const found = b.dict.search('あかり', 'Exact', 10);
        const multi = found.find((e) => e.kanji.length > 1);
        expect(multi).toBeDefined();
        const kebs = multi!.kanji.map((k) => k.keb);
        expect(kebs.length).toBeGreaterThan(1);
        expect(preferKeb(multi!, kebs[1]!, 'Exact')).toBe(kebs[1]);
        expect(preferKeb(multi!, 'zzz-no-match', 'Exact')).toBe(multi!.heading);
        const withReb = found.find((e) => e.readings.length > 1) ?? multi!;
        const rebs = withReb.readings.map((r) => r.reb);
        expect(preferReb(withReb, rebs[rebs.length - 1]!, 'Exact')).toBe(rebs[rebs.length - 1]);
        expect(preferReb(withReb, 'zzz-no-match', 'Exact')).toBe(withReb.reading);
    });

    it('resolves edge-anchored forms per search mode', async () => {
        const b = await loadBackend();
        const found = b.dict.search('あかり', 'Exact', 10);
        const multi = found.find((e) => e.kanji.length > 1);
        expect(multi).toBeDefined();
        const kebs = multi!.kanji.map((k) => k.keb);
        // A strict head slice: not an exact form, so Exact falls
        // back to the heading while Prefix resolves the anchored form.
        const head = kebs[1]!.slice(0, Math.max(1, kebs[1]!.length - 1));
        if (!kebs.includes(head)) {
            expect(preferKeb(multi!, head, 'Exact')).toBe(multi!.heading);
        }
        expect(preferKeb(multi!, head, 'Prefix').startsWith(head)).toBe(true);
        // A strict tail slice: same split between Exact and Suffix.
        const tail = kebs[1]!.slice(1);
        if (tail.length > 0 && !kebs.includes(tail)) {
            expect(preferKeb(multi!, tail, 'Exact')).toBe(multi!.heading);
        }
        if (tail.length > 0) {
            expect(preferKeb(multi!, tail, 'Suffix').endsWith(tail)).toBe(true);
        }
    });

    it('maps the affix toggles to the search mode', async () => {
        const { setActivePinia, createPinia } = await import('pinia');
        setActivePinia(createPinia());
        const { useSearch } = await import('../src/state/search.ts');
        const search = useSearch();
        try {
            search.prefix = false;
            search.suffix = false;
            expect(search.mode).toBe('Exact');
            search.prefix = true;
            expect(search.mode).toBe('Prefix');
            search.suffix = true;
            expect(search.mode).toBe('Middle');
            search.prefix = false;
            expect(search.mode).toBe('Suffix');
        } finally {
            // Restore the shipped defaults (prefix on) so later
            // tests see the same prefs as a fresh launch.
            search.prefix = true;
            search.suffix = false;
        }
    });

    it('splits kanji and reading restrictions', async () => {
        const b = await loadBackend();
        let seenKanji = false;
        let seenReading = false;
        outer: for (const q of ['あ', 'か', 'さ', 'た', 'な', 'は']) {
            for (const h of b.dict.searchIndices(q, 'Prefix', 20000)) {
                const e = b.dict.entryAt(h.idx);
                if (e == null) {
                    continue;
                }
                const shown = numberedContentSenses(e);
                for (const row of shown) {
                    const raw = e.senses[row.n - 1]!;
                    const s = row.sense;
                    expect(s.restrictedKanji).toEqual(raw.stagk);
                    expect(s.restrictedReading).toEqual(raw.stagr);
                    if (raw.stagk.length > 0) {
                        seenKanji = true;
                    }
                    if (raw.stagr.length > 0) {
                        seenReading = true;
                    }
                }
                if (seenKanji && seenReading) {
                    break outer;
                }
            }
        }
        expect(seenKanji).toBe(true);
        expect(seenReading).toBe(true);
    });
});

describe('deinflection battery', () => {
    it('resolves common conjugations to dictionary forms', async () => {
        const b = await loadBackend();
        const surfaces = [
            '食べた',
            '食べない',
            '飲んだ',
            '行った',
            '高かった',
            'します',
            '食べさせる',
            '読まれる',
        ];
        for (const s of surfaces) {
            const ds = b.dict.deinflect(s);
            // The engine over-generates (dead-end chains like 食ぶ);
            // the chips keep only surfaces that verify. Pin that shape:
            // non-empty, depth-capped, at least one exact hit each.
            expect(ds.length).toBeGreaterThan(0);
            for (const d of ds) {
                expect(d.chain.length).toBeLessThanOrEqual(5);
            }
            const verified = ds.filter(
                (d) => b.dict.searchIndices(d.surface, 'Exact', 1).length > 0,
            );
            expect(verified.length).toBeGreaterThan(0);
        }
    });
});

describe('dataRequest', () => {
    it('fetches artifacts direct under a relative base', async () => {
        const { DATA_DIR, dataRequest } = await import('../src/backend/Backend.ts');
        expect(DATA_DIR).toBe('data');
        expect(dataRequest(DATA_DIR, 'manifest.json')).toEqual({
            url: 'data/manifest.json',
            headers: {},
        });
    });

    it('fetches loopback fixtures direct', async () => {
        const { dataRequest } = await import('../src/backend/Backend.ts');
        expect(dataRequest('http://localhost:8939', 'manifest.json')).toEqual({
            url: 'http://localhost:8939/manifest.json',
            headers: {},
        });
        expect(dataRequest('http://127.0.0.1:8939', 'jmdict.bin.gz')).toEqual({
            url: 'http://127.0.0.1:8939/jmdict.bin.gz',
            headers: {},
        });
    });

    it('fetches relative bases direct in node', async () => {
        const { dataRequest } = await import('../src/backend/Backend.ts');
        expect(dataRequest('/data', 'manifest.json')).toEqual({
            url: '/data/manifest.json',
            headers: {},
        });
    });
});

describe('sha256Fallback', () => {
    it('matches the NIST vectors', async () => {
        const { sha256Fallback } = await import('../src/backend/Backend.ts');
        const enc = new TextEncoder();
        expect(sha256Fallback(enc.encode(''))).toBe(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        );
        expect(sha256Fallback(enc.encode('abc'))).toBe(
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        );
    });

    it('agrees with WebCrypto across padding boundaries', async () => {
        const { sha256Fallback } = await import('../src/backend/Backend.ts');
        for (const len of [0, 55, 56, 57, 64, 119, 1000]) {
            const bytes = new Uint8Array(len).map((_, i) => (i * 31 + 7) & 0xff);
            const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
            const expected = [...new Uint8Array(digest)]
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');
            expect(sha256Fallback(bytes)).toBe(expected);
        }
    });
});

describe('recognizer model pack', () => {
    it('rejects non-model bytes without touching the network', async () => {
        const { Recognizer, RecognizerError } = await import(
            '../src/vendor/librecognizer/recognizer.ts'
        );
        expect(() =>
            Recognizer.convertModel(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])),
        ).toThrow(RecognizerError);
    });

    it('loads no engine with the dictionaries (model installs on demand)', async () => {
        const b = await loadBackend();
        expect(b.recognizer).toBeNull();
    });

    it('builds proxy requests with the target in the header', async () => {
        const { proxyRequest, RECOGNIZER_PROXY, RECOGNIZER_PACKS } = await import(
            '../src/backend/Backend.ts'
        );
        expect(RECOGNIZER_PROXY).toBe('https://cors.bakatrouble.me/');
        for (const p of RECOGNIZER_PACKS) {
            const req = proxyRequest(p.url);
            expect(req.url).toBe('https://cors.bakatrouble.me/');
            expect(req.headers).toEqual({ 'X-Target-URL': p.url });
            expect(p.url.startsWith('https://dl.google.com/handwriting/models/')).toBe(true);
        }
        expect(RECOGNIZER_PACKS.map((p) => p.member)).toEqual(['ja.tflite', 'ja.recospec']);
    });

    it('pins the AAR pack sha1s and sizes', async () => {
        const { RECOGNIZER_PACKS } = await import('../src/backend/Backend.ts');
        expect(RECOGNIZER_PACKS).toEqual([
            expect.objectContaining({
                sha1: 'fc5c5f0a999635dfabb9bebb7a4834cc1b7f075d',
                zipSize: 3132494,
                memberSuffix: '.tflite',
                artifactSize: 4186912,
            }),
            expect.objectContaining({
                sha1: '0cc70076bfeaee959e558ca55f0ae079f2fe5f25',
                zipSize: 46002,
                memberSuffix: '.recospec.local',
                artifactSize: 94195,
            }),
        ]);
    });

    it('hashes sha1 like the NIST vectors', async () => {
        const { sha1Hex } = await import('../src/backend/Backend.ts');
        const enc = new TextEncoder();
        expect(sha1Hex(enc.encode('abc'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
        expect(sha1Hex(enc.encode(''))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    });

    it('reports the pack table with a cold cache', async () => {
        const { setDataCache, MemoryCache } = await import('../src/backend/idb.ts');
        const { recognizerPackStatus } = await import('../src/backend/Backend.ts');
        setDataCache(new MemoryCache());
        const st = await recognizerPackStatus();
        expect(st.published).toBe(true);
        expect(st.ready).toBe(false);
        expect(st.latestLine).toContain('Latest');
        expect(st.savedLine).toBeNull();
    });

    it('rejects truncated zips before unzipping', async () => {
        const { vi } = await import('vitest');
        const { downloadRecognizerPack } = await import('../src/backend/Backend.ts');
        vi.stubGlobal(
            'fetch',
            async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
        );
        try {
            await expect(downloadRecognizerPack(() => {})).rejects.toThrow('pack says');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('rejects zips that fail the sha1 check', async () => {
        const { vi } = await import('vitest');
        const { downloadRecognizerPack } = await import('../src/backend/Backend.ts');
        vi.stubGlobal('fetch', async (url: unknown, init?: unknown) => {
            const headers = (init as { headers?: Record<string, string> } | undefined)?.headers;
            const target = headers?.['X-Target-URL'] ?? String(url);
            // Right length, wrong bytes: the size check passes, the
            // sha1 check must still refuse the download.
            const size = target.includes('tflite') ? 3132494 : 46002;
            return new Response(new Uint8Array(size), { status: 200 });
        });
        try {
            // Right length, wrong bytes: the size check passes, the
            // sha1 check must still refuse the download.
            await expect(downloadRecognizerPack(() => {})).rejects.toThrow('sha1 mismatch');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('evicts a corrupt cached bundle instead of attaching it', async () => {
        const { setDataCache, dataCache, MemoryCache } = await import('../src/backend/idb.ts');
        const {
            RECOGNIZER_BUNDLE_KEY,
            RECOGNIZER_PACKS,
            RECOGNIZER_VERSION_KEY,
            openCachedRecognizer,
        } = await import('../src/backend/Backend.ts');
        setDataCache(new MemoryCache());
        // Stamped (current table) but undecodable: decode fails,
        // evicts, and reports null — no network involved.
        const stamp = RECOGNIZER_PACKS.map((p) => `${p.member}@${p.sha1}`).join(',');
        await dataCache().set(RECOGNIZER_BUNDLE_KEY, new Uint8Array([9, 9, 9]));
        await dataCache().set(RECOGNIZER_VERSION_KEY, new TextEncoder().encode(stamp));
        expect(await openCachedRecognizer()).toBeNull();
        expect(await dataCache().get(RECOGNIZER_BUNDLE_KEY)).toBeNull();
    });

    it('filters similar kanji to single non-kana hypotheses', async () => {
        const { similarChars } = await import('../src/state/recognizer.ts');
        const stub = {
            recognize: () => [
                { text: 'あ', score: 0 },
                { text: '食', score: 1 },
                { text: '飯', score: 2 },
                { text: '食べる', score: 3 },
                { text: '食', score: 4 },
            ],
        };
        expect(similarChars(stub as never, [[{ x: 1, y: 1 }]], '食')).toEqual(['飯']);
        expect(similarChars(stub as never, [], '食')).toEqual([]);
        expect(similarChars(stub as never, [[]], '食')).toEqual([]);
    });
});
