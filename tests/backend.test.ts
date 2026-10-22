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
    it('prefers the kanji/reading containing the query', async () => {
        const b = await loadBackend();
        const found = b.dict.search('あかり', 'Exact', 10);
        const multi = found.find((e) => e.kanji.length > 1);
        expect(multi).toBeDefined();
        const kebs = multi!.kanji.map((k) => k.keb);
        expect(kebs.length).toBeGreaterThan(1);
        expect(preferKeb(multi!, kebs[1]!)).toBe(kebs[1]);
        expect(preferKeb(multi!, 'zzz-no-match')).toBe(multi!.heading);
        const withReb = found.find((e) => e.readings.length > 1) ?? multi!;
        const rebs = withReb.readings.map((r) => r.reb);
        expect(preferReb(withReb, rebs[rebs.length - 1]!)).toBe(rebs[rebs.length - 1]);
        expect(preferReb(withReb, 'zzz-no-match')).toBe(withReb.reading);
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

describe('recognizer', () => {
    it('matches a diagonal stroke', async () => {
        const b = await loadBackend();
        expect(b.recognizer.templateCount()).toBeGreaterThan(10000n);
        const cand = b.recognizer.recognize(
            [
                [
                    { x: 0.1, y: 0.1 },
                    { x: 0.9, y: 0.9 },
                ],
            ],
            3,
            false,
        );
        expect(cand.length).toBe(3);
    });
});
