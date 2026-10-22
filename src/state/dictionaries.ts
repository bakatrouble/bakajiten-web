// Dictionary file management: catalog plan, per-file transfers,
// and row view-models for the manager list (settings + consent
// share one shape). Host effects stay out: reload-vs-handoff and
// cache-usage refreshes arrive as injected callbacks.
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
    type CachePlan,
    checkCache,
    defaultDataBase,
    type FilePlan,
    type LoadProgress,
    loadScopeFile,
    OPTIONAL_FILES,
    REQUIRED_FILES,
    startLoad,
} from '../backend/Backend.ts';
import { dataCache } from '../backend/idb.ts';
import { useSearch } from './search.ts';

export interface FileRow {
    name: string;
    required: boolean;
    statusWord: string;
    savedLine: string | null;
    latestLine: string | null;
    /** Main action label (Download/Update/Up to date/Loading). */
    actionLabel: string;
    actionEnabled: boolean;
    /** Spinner on the action button (checking or transferring). */
    loading: boolean;
    busy: boolean;
    progress: { loaded: number; total: number } | null;
    /** Cached opt-in: deletable behind an armed confirm. */
    deletable: boolean;
    confirmArmed: boolean;
}

function formatMB(n: number): string {
    return n > 0 ? `≈${(n / 1048576).toFixed(0)} MB` : 'unknown size';
}

export const useDictionaries = defineStore('dictionaries', () => {
    const plan = ref<CachePlan | null>(null);
    const error = ref('');
    // In-flight transfers by file: rows download independently, so
    // one transfer never blocks starting another.
    const busy = ref(new Set<string>());
    // Per-file transfer progress (loaded/total wire+decode bytes);
    // delete confirmation arms per row (only Remove deletes).
    const progress = ref<Record<string, LoadProgress>>({});
    const confirmName = ref<string | null>(null);
    // Host effects: Settings reloads into required updates (the
    // running backend holds old bytes) and re-reads cache usage;
    // first-run hands off instead.
    const onComplete = ref<(() => void) | null>(null);
    const onChanged = ref<(() => void) | null>(null);

    function info(name: string): FilePlan | null {
        return plan.value?.files.find((f) => f.name === name) ?? null;
    }

    function statusWord(name: string): string {
        const f = info(name);
        if (f == null) {
            return 'Checking…';
        }
        if (f.cached) {
            return f.status === 'outdated' ? 'Update available' : 'Up to date';
        }
        if (plan.value?.manifest == null) {
            return 'Catalog unreachable';
        }
        return 'Not downloaded';
    }

    function savedLine(name: string): string | null {
        const f = info(name);
        if (f == null || !f.cached) {
            return null;
        }
        // The catalog version is the saved one while the entry
        // verifies — the cache only keeps matching bytes; the size
        // is the unpacked one, like everywhere else.
        const size = f.size > 0 ? ` · ${formatMB(f.size)}` : '';
        return f.version !== '' ? `Saved v${f.version}${size}` : `Saved on this device${size}`;
    }

    function latestLine(name: string): string | null {
        const f = info(name);
        if (f == null) {
            return null;
        }
        if (f.cached && f.status !== 'outdated') {
            return null;
        }
        const size = formatMB(f.size || f.gz);
        return f.version !== '' ? `Latest v${f.version} · ${size}` : `Latest ${size}`;
    }

    function rowProgress(name: string): { loaded: number; total: number } | null {
        if (!busy.value.has(name)) {
            return null;
        }
        const p = progress.value[name];
        return p == null || p.total <= 0 ? { loaded: 0, total: 1 } : p;
    }

    function fileAction(name: string): { label: string; enabled: boolean } {
        const f = info(name);
        if (f == null) {
            return { label: 'Loading', enabled: false };
        }
        if (f.cached) {
            return { label: 'Up to date', enabled: false };
        }
        const verb = f.status === 'outdated' ? 'Update' : 'Download';
        return { label: `${verb} ${formatMB(f.gz || f.size)}`, enabled: true };
    }

    function row(name: string, required: boolean): FileRow {
        const f = info(name);
        const action = fileAction(name);
        const isBusy = busy.value.has(name);
        return {
            name,
            required,
            statusWord: statusWord(name),
            savedLine: savedLine(name),
            latestLine: latestLine(name),
            actionLabel: action.label,
            actionEnabled: action.enabled,
            loading: f == null || isBusy,
            busy: isBusy,
            progress: rowProgress(name),
            deletable: (f?.cached ?? false) && !required,
            confirmArmed: confirmName.value === name,
        };
    }

    const requiredRows = computed(() => REQUIRED_FILES.map((name) => row(name, true)));
    const optionalRows = computed(() => OPTIONAL_FILES.map((name) => row(name, false)));
    const sections = computed(() => [
        { title: 'Required', rows: requiredRows.value },
        { title: 'Optional', rows: optionalRows.value },
    ]);
    /// Files that are present but stale (missing opt-ins are never
    /// auto-fetched — same rule as the other frontends).
    const outdatedNames = computed(() =>
        (plan.value?.files ?? []).filter((f) => f.status === 'outdated').map((f) => f.name),
    );
    /// Wire bytes of the stale set, for the Update-all label.
    const outdatedTotal = computed(() =>
        (plan.value?.files ?? [])
            .filter((f) => f.status === 'outdated')
            .reduce((t, f) => t + (f.gz || f.size), 0),
    );
    const updateAllLabel = computed(
        () => `Update all (${outdatedNames.value.length} · ${formatMB(outdatedTotal.value)})`,
    );

    async function refresh(): Promise<void> {
        error.value = '';
        try {
            plan.value = await checkCache(defaultDataBase());
            // Cached-bytes view may have moved: hosts re-read on this.
            onChanged.value?.();
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
        }
    }

    async function finishRequired(): Promise<void> {
        const searchStore = useSearch();
        await searchStore.refreshScopes();
        await refresh();
        const missing = REQUIRED_FILES.some((n) => !(info(n)?.cached ?? false));
        if (!missing) {
            onComplete.value?.();
        }
    }

    async function downloadOne(name: string, reloadOnRequired: boolean): Promise<void> {
        if (busy.value.has(name)) {
            return;
        }
        busy.value.add(name);
        confirmName.value = null;
        try {
            const onProgress = (p: LoadProgress) => {
                progress.value = { ...progress.value, [name]: p };
            };
            const bytes = await loadScopeFile(
                await checkCache(defaultDataBase()),
                name,
                onProgress,
            );
            if (bytes == null) {
                throw new Error(`${name}: not in catalog`);
            }
            if (REQUIRED_FILES.includes(name)) {
                if (reloadOnRequired) {
                    location.reload();
                    return;
                }
                await finishRequired();
            } else {
                const searchStore = useSearch();
                await searchStore.refreshScopes();
                await refresh();
            }
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
        } finally {
            busy.value.delete(name);
        }
    }

    /// Bulk required download with inline per-row progress (the
    /// consent screen calls this so the prompt UI never swaps out).
    async function downloadRequired(reloadOnRequired: boolean): Promise<void> {
        confirmName.value = null;
        for (const name of REQUIRED_FILES) {
            busy.value.add(name);
        }
        try {
            const p = await checkCache(defaultDataBase());
            const onProgress = (pr: LoadProgress) => {
                progress.value = { ...progress.value, [pr.file]: pr };
            };
            await startLoad(p, onProgress);
            if (reloadOnRequired) {
                location.reload();
                return;
            }
            await finishRequired();
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
        } finally {
            for (const name of REQUIRED_FILES) {
                busy.value.delete(name);
            }
        }
    }

    /// Every stale file in one tap, fetched in parallel; required
    /// updates go through the set check, optionals refresh in place.
    async function updateAll(reloadOnRequired: boolean): Promise<void> {
        const names = outdatedNames.value;
        if (names.length === 0) {
            return;
        }
        for (const name of names) {
            busy.value.add(name);
        }
        confirmName.value = null;
        try {
            const p = await checkCache(defaultDataBase());
            const onProgress = (pr: LoadProgress) => {
                progress.value = { ...progress.value, [pr.file]: pr };
            };
            const blobs = await Promise.all(
                names.map(async (name) => {
                    const bytes = await loadScopeFile(p, name, onProgress);
                    if (bytes == null) {
                        throw new Error(`${name}: not in catalog`);
                    }
                    return name;
                }),
            );
            if (blobs.some((n) => REQUIRED_FILES.includes(n))) {
                if (reloadOnRequired) {
                    location.reload();
                    return;
                }
                await finishRequired();
            } else {
                const searchStore = useSearch();
                await searchStore.refreshScopes();
                await refresh();
            }
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
        } finally {
            for (const name of names) {
                busy.value.delete(name);
            }
        }
    }

    async function removeFile(name: string): Promise<void> {
        if (busy.value.has(name)) {
            return;
        }
        busy.value.add(name);
        confirmName.value = null;
        try {
            await dataCache().remove(name);
            const searchStore = useSearch();
            searchStore.evictScopeFile(name);
            await searchStore.refreshScopes();
            await refresh();
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
        } finally {
            busy.value.delete(name);
        }
    }

    function isBusy(name: string): boolean {
        return busy.value.has(name);
    }

    return {
        plan,
        error,
        busy,
        sections,
        outdatedNames,
        updateAllLabel,
        confirmName,
        onComplete,
        onChanged,
        refresh,
        downloadOne,
        downloadRequired,
        updateAll,
        removeFile,
        isBusy,
    };
});
