// Dictionary search state: index hits for the full result set,
// entries materialized per visible row (virtual scrolling).
// Both toggles = Middle (substring), neither = Exact — same rule
// as the desktop.

import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
    backend,
    checkCache,
    defaultDataBase,
    loadScopeFile,
    SCOPE_FILE,
    type ScopeName,
} from '../backend/Backend.ts';
import {
    type Deinflection,
    type DictEntry,
    Dictionary,
    type SearchHit,
    type SearchMode,
} from '../vendor/libdict/dict.ts';

// Full result set: u32::MAX asks every tier for everything.
const ALL = 0xffffffff;

/// Scope labels for the status line (desktop scope combo text).
const SCOPE_LABEL: Record<ScopeName, string> = {
    english: 'English',
    names: 'Names',
    kokugo: 'Kokugo',
};

const SEARCH_KEY = 'bakajiten-web-search';

interface SearchPrefs {
    prefix: boolean;
    suffix: boolean;
    meaning: boolean;
}

/// Search type (affix toggles) + direction (JA/meaning) persist
/// across sessions; prefix matching is on by default.
function defaultPrefs(): SearchPrefs {
    return { prefix: true, suffix: false, meaning: false };
}

function sanitizePrefs(raw: unknown): SearchPrefs {
    const p = typeof raw === 'object' && raw != null ? (raw as Partial<SearchPrefs>) : {};
    return {
        prefix: typeof p.prefix === 'boolean' ? p.prefix : true,
        suffix: typeof p.suffix === 'boolean' ? p.suffix : false,
        meaning: typeof p.meaning === 'boolean' ? p.meaning : false,
    };
}

export interface Suggestion {
    surface: string;
    chain: string[];
    hits: number;
}

export const useSearch = defineStore('search', () => {
    const query = ref('');
    // Search type + direction persist through the storage ref (JSON);
    // sanitize validates the stored blob on every launch.
    const storedPrefs = useStorage<SearchPrefs>(SEARCH_KEY, defaultPrefs());
    storedPrefs.value = sanitizePrefs(storedPrefs.value);
    const prefix = computed({
        get: () => storedPrefs.value.prefix,
        set: (v: boolean) => {
            storedPrefs.value = { ...storedPrefs.value, prefix: v };
        },
    });
    const suffix = computed({
        get: () => storedPrefs.value.suffix,
        set: (v: boolean) => {
            storedPrefs.value = { ...storedPrefs.value, suffix: v };
        },
    });
    const scope = ref<ScopeName>('english');
    const meaning = computed({
        get: () => storedPrefs.value.meaning,
        set: (v: boolean) => {
            storedPrefs.value = { ...storedPrefs.value, meaning: v };
        },
    });
    const hits = ref<SearchHit[]>([]);
    const suggestions = ref<Suggestion[]>([]);
    const status = ref('Loading dictionaries…');
    const selected = ref(-1);

    // One dictionary per scope; English reuses the shared backend
    // dict. Switching parks the query and replays it after load;
    // a missing manifest file reverts the switch.
    const scopeDicts = new Map<ScopeName, Dictionary>();
    // Optional scopes stay disabled until their file is downloaded
    // (Settings → Dictionaries). English is always available.
    const scopeReady = ref<Record<ScopeName, boolean>>({
        english: true,
        names: false,
        kokugo: false,
    });
    let parkedQuery = '';

    // Lifted entries by record index; cleared per search so rows
    // never show stale records. Only visible rows + the article materialize.
    const entryCache = new Map<string, DictEntry>();
    let liveDict: Dictionary | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let runId = 0;

    function entryAtHit(i: number): DictEntry | null {
        const h = hits.value[i];
        if (h == null || liveDict == null) {
            return null;
        }
        const key = `${h.idx}`;
        const cached = entryCache.get(key);
        if (cached != null) {
            return cached;
        }
        const found = liveDict.entryAt(h.idx);
        if (found != null) {
            entryCache.set(key, found);
        }
        return found;
    }

    function hitAt(i: number): SearchHit | null {
        return hits.value[i] ?? null;
    }

    const selectedEntry = computed(() => entryAtHit(selected.value));

    const mode = computed<SearchMode>(() => {
        if (prefix.value && suffix.value) {
            return 'Middle';
        }
        if (prefix.value) {
            return 'Prefix';
        }
        if (suffix.value) {
            return 'Suffix';
        }
        return 'Exact';
    });

    async function runSearch(text: string, id: number): Promise<void> {
        if (text === '') {
            hits.value = [];
            entryCache.clear();
            suggestions.value = [];
            const b = await backend();
            if (id !== runId) {
                return;
            }
            // Idle line, like the desktop: entry count plus scope.
            const dict = scopeDictionary() ?? b.dict;
            liveDict = dict;
            status.value = `${dict.count().toString()} entries · ${SCOPE_LABEL[scope.value]}`;
            return;
        }
        const b = await backend();
        if (id !== runId) {
            return;
        }
        // English reuses the shared dict; other scopes resolve to their
        // loaded dictionary (setScope replays the parked query on arrival,
        // so a null here just drops the stale run).
        const dict = scope.value === 'english' ? b.dict : scopeDicts.get(scope.value);
        if (dict == null) {
            return;
        }
        liveDict = dict;
        const t0 = performance.now();
        const found = meaning.value
            ? dict.searchMeaningIndices(text, ALL)
            : dict.searchIndices(text, mode.value, ALL);
        const ms = performance.now() - t0;
        if (id !== runId) {
            return;
        }
        entryCache.clear();
        hits.value = found;
        // No auto-select: the article opens on explicit row clicks.
        selected.value = -1;
        status.value = `${found.length} hits · ${ms.toFixed(1)} ms`;
        // Verified "did you mean" chips: deinflected surfaces (other than
        // the query) that actually hit, cheapest first.
        const seen = new Set<string>([text]);
        const chips: Suggestion[] = [];
        for (const d of dict.deinflect(text).slice(0, 8)) {
            if (seen.has(d.surface)) {
                continue;
            }
            seen.add(d.surface);
            const n = dict.searchIndices(d.surface, 'Exact', 1).length;
            if (n > 0) {
                chips.push({ surface: d.surface, chain: d.chain, hits: n });
            }
            if (chips.length >= 4) {
                break;
            }
        }
        suggestions.value = chips;
    }

    function searchNow(text: string): void {
        query.value = text;
        globalThis.clearTimeout(timer);
        runId += 1;
        void runSearch(text, runId);
    }

    function searchDebounced(text: string): void {
        query.value = text;
        globalThis.clearTimeout(timer);
        runId += 1;
        const id = runId;
        timer = globalThis.setTimeout(() => void runSearch(text, id), 200);
    }

    function retoggle(): void {
        searchNow(query.value);
    }

    /// Hide the article without clearing the results (it reopens
    /// on the next explicit row click).
    function deselect(): void {
        selected.value = -1;
    }

    /// Dictionaries finished loading with no query yet: replay the
    /// (usually empty) query so the status lands on the entries
    /// line instead of waiting for first input.
    /// Dictionaries finished loading: replay the (usually empty)
    /// query so the status always lands (entries line when idle).
    function markLoaded(): void {
        searchNow(query.value);
    }

    /// Switch scope (English/Names/Kokugo). Optional dictionaries
    /// fetch on demand; a missing manifest file reverts (false).
    /// The query parks across the switch and replays after load.
    async function setScope(next: ScopeName, dataBase = defaultDataBase()): Promise<boolean> {
        if (next === scope.value) {
            return true;
        }
        parkedQuery = query.value;
        if (next === 'english') {
            scope.value = next;
            searchNow(parkedQuery);
            return true;
        }
        const have = scopeDicts.get(next);
        if (have != null) {
            scope.value = next;
            searchNow(parkedQuery);
            return true;
        }
        status.value = `Loading ${next} dictionary…`;
        const plan = await checkCache(dataBase);
        const bytes = await loadScopeFile(plan, SCOPE_FILE[next]);
        if (bytes == null) {
            // Missing from the catalog: revert and restore the status.
            searchNow(query.value);
            return false;
        }
        try {
            scopeDicts.set(next, Dictionary.create(bytes));
        } catch {
            searchNow(query.value);
            return false;
        }
        scope.value = next;
        searchNow(parkedQuery);
        return true;
    }

    function setMeaning(on: boolean): void {
        meaning.value = on;
        searchNow(query.value);
    }

    /// Dictionary for the active non-English scope, if materialized.
    /// The kanji dialog's words tab searches this instead of always
    /// falling back to English.
    function scopeDictionary(): Dictionary | null {
        return scope.value === 'english' ? null : (scopeDicts.get(scope.value) ?? null);
    }

    /// Re-read which optional scopes have cached files (called after
    /// load, downloads, and deletions). Offline falls back to raw
    /// cache presence checks.
    async function refreshScopes(dataBase = defaultDataBase()): Promise<void> {
        try {
            const plan = await checkCache(dataBase);
            for (const name of ['names', 'kokugo'] as ScopeName[]) {
                scopeReady.value[name] = plan.files.some(
                    (f) => f.name === SCOPE_FILE[name] && f.cached,
                );
            }
        } catch {
            const { dataCache } = await import('../backend/idb.ts');
            for (const name of ['names', 'kokugo'] as ScopeName[]) {
                scopeReady.value[name] = (await dataCache().get(SCOPE_FILE[name])) != null;
            }
        }
    }

    /// Drop a cached optional dictionary (bytes already evicted):
    /// reverts to English when it was the active scope.
    function evictScopeFile(name: string): void {
        const found = (Object.entries(SCOPE_FILE) as [ScopeName, string][]).find(
            ([, f]) => f === name,
        );
        if (found == null || found[0] === 'english') {
            return;
        }
        scopeDicts.delete(found[0]);
        scopeReady.value[found[0]] = false;
        if (scope.value === found[0]) {
            scope.value = 'english';
            searchNow(query.value);
        }
    }

    return {
        query,
        prefix,
        suffix,
        scope,
        meaning,
        mode,
        hits,
        hitAt,
        entryAtHit,
        selectedEntry,
        suggestions,
        status,
        selected,
        searchNow,
        searchDebounced,
        retoggle,
        deselect,
        markLoaded,
        setScope,
        setMeaning,
        scopeDictionary,
        scopeReady,
        refreshScopes,
        evictScopeFile,
    };
});

export type { Deinflection };
