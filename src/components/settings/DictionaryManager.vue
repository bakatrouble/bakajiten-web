<script setup lang="ts">
// Dictionary management: a proper table whose rows render
// immediately; versions and statuses fill in asynchronously once
// the catalog check resolves. Required files download through
// the full plan flow and reload the app; optional files download
// or delete in place and refresh scope availability. The action
// button is always present: loading while checking or working,
// Download when missing, Update when stale, Up to date when
// current.
import { computed, ref, watch } from 'vue';
import {
    type CachePlan,
    checkCache,
    defaultDataBase,
    type FilePlan,
    loadScopeFile,
    OPTIONAL_FILES,
    REQUIRED_FILES,
    startLoad,
} from '../../backend/Backend.ts';
import { dataCache } from '../../backend/idb.ts';
import { HOVER_SHOW_MS } from '../../state/kanjiHover.ts';
import { useSearch } from '../../state/search.ts';
import Button from '../ui/button/Button.vue';
import { TooltipProvider } from '../ui/tooltip/index.ts';
import DictionaryManagerRow from './DictionaryManagerRow.vue';

const props = defineProps<{ open: boolean }>();

const searchStore = useSearch();
const plan = ref<CachePlan | null>(null);
const error = ref('');
const busy = ref<string | null>(null);

/// Required rows first, then optional — one loop for both.
const allFiles = computed(() => [
    ...REQUIRED_FILES.map((name) => ({ name, required: true })),
    ...OPTIONAL_FILES.map((name) => ({ name, required: false })),
]);

function info(name: string): FilePlan | null {
    return plan.value?.files.find((f) => f.name === name) ?? null;
}

function formatMB(n: number): string {
    return n > 0 ? `≈${(n / 1048576).toFixed(0)} MB` : 'unknown size';
}

function versionText(name: string): string | null {
    // Null while the catalog entry is still loading (the cell
    // shows a spinner); '—' when the catalog knows no version.
    const f = info(name);
    if (f == null) {
        return null;
    }
    return f.version !== '' ? `v${f.version}` : f.cached ? 'cached' : '—';
}

interface RowAction {
    label: string;
    enabled: boolean;
    busyKey: string;
}
function requiredAction(name: string): RowAction {
    const f = info(name);
    if (f == null) {
        return { label: 'Loading', enabled: false, busyKey: 'checking' };
    }
    if (!f.cached) {
        return {
            label: `Download ${formatMB(f.gz || f.size)}`,
            enabled: true,
            busyKey: 'required',
        };
    }
    if (f.status === 'outdated') {
        return {
            label: `Update ${formatMB(f.gz || f.size)}`,
            enabled: true,
            busyKey: 'required',
        };
    }
    return { label: `Up to date ${formatMB(f.size || f.gz)}`, enabled: false, busyKey: '' };
}

function downloadLabel(name: string): string {
    const f = info(name);
    if (f == null) {
        return 'Download';
    }
    return `Download ${formatMB(f.gz || f.size)}`;
}

/// Rich status detail for the badge tooltip (the badge itself
/// stays a cached/not-cached pair).
function statusTip(name: string): string {
    const f = info(name);
    if (f == null) {
        return '';
    }
    if (f.cached) {
        return f.status === 'outdated'
            ? `Update available (${formatMB(f.gz || f.size)})`
            : 'Cached on this device';
    }
    if (plan.value?.manifest == null) {
        return 'Catalog unreachable';
    }
    return `Not downloaded (${formatMB(f.gz || f.size)})`;
}

async function refresh(): Promise<void> {
    error.value = '';
    try {
        plan.value = await checkCache(defaultDataBase());
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
    }
}

watch(
    () => props.open,
    (open) => {
        if (open) {
            void refresh();
        }
    },
    { immediate: true },
);

async function downloadRequired(): Promise<void> {
    busy.value = 'required';
    try {
        await startLoad(await checkCache(defaultDataBase()));
        location.reload();
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
    } finally {
        busy.value = null;
    }
}

async function downloadOptional(name: string): Promise<void> {
    busy.value = name;
    try {
        const bytes = await loadScopeFile(await checkCache(defaultDataBase()), name);
        if (bytes == null) {
            throw new Error(`${name}: not in catalog`);
        }
        await searchStore.refreshScopes();
        await refresh();
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
    } finally {
        busy.value = null;
    }
}

async function removeFile(name: string): Promise<void> {
    busy.value = name;
    try {
        await dataCache().remove(name);
        searchStore.evictScopeFile(name);
        await searchStore.refreshScopes();
        await refresh();
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
    } finally {
        busy.value = null;
    }
}
</script>

<template>
    <div class="flex flex-col gap-1">
        <TooltipProvider :delay-duration="HOVER_SHOW_MS">
            <div
                class="text-sm border border-border rounded-lg overflow-hidden grid grid-cols-[auto_auto_minmax(0,1fr)_auto]"
            >
                <div
                    class="font-normal px-2 py-1 bg-muted border-b border-border text-muted-foreground"
                >
                    Dictionary
                </div>
                <div
                    class="font-normal px-2 py-1 bg-muted border-b border-border text-muted-foreground"
                >
                    Version
                </div>
                <div
                    class="font-normal px-2 py-1 bg-muted border-b border-border text-muted-foreground"
                >
                    Status
                </div>
                <div class="bg-muted border-b border-border">
                    <span class="sr-only">Actions</span>
                </div>
                <dictionary-manager-row
                    v-for="file in allFiles"
                    :key="file.name"
                    :name="file.name"
                    :version="versionText(file.name)"
                    :status-known="plan != null"
                    :cached="info(file.name)?.cached ?? false"
                    :tip="statusTip(file.name)"
                >
                    <template #action>
                        <Button
                            v-if="file.required"
                            variant="outline"
                            size="xs"
                            :disabled="!requiredAction(file.name).enabled || busy != null"
                            :loading="busy === 'required' || plan == null"
                            @click="downloadRequired"
                            >{{
                                requiredAction(file.name).label
                            }}</Button
                        >
                        <Button
                            v-else-if="!(info(file.name)?.cached ?? false)"
                            variant="outline"
                            size="xs"
                            :disabled="plan == null || busy != null"
                            :loading="busy === file.name || plan == null"
                            @click="downloadOptional(file.name)"
                            >{{
                                downloadLabel(file.name)
                            }}</Button
                        >
                        <Button
                            v-else
                            variant="outline"
                            size="xs"
                            :loading="busy === file.name"
                            @click="removeFile(file.name)"
                            >Delete</Button
                        >
                    </template>
                </dictionary-manager-row>
            </div>
        </TooltipProvider>
        <p v-if="error" class="text-sm text-destructive mt-1">{{ error }}</p>
    </div>
</template>
