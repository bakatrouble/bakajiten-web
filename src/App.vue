<script setup lang="ts">
// Main window: dictionary central view (results + article) with a
// floating handwriting panel, kanji dialog, and hover cards.

import { mdiCog } from '@mdi/js';
import { storeToRefs } from 'pinia';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { queryFor } from './backend/labels.ts';
import MdiIcon from './components/common/MdiIcon.vue';
import KanjiDialog from './components/kanji/KanjiDialog.vue';
import KanjiTip from './components/kanji/KanjiTip.vue';
import RecognizerPanel from './components/recognizer/RecognizerPanel.vue';
import ArticleView from './components/results/ArticleView.vue';
import PaneDivider from './components/results/PaneDivider.vue';
import ResultsList from './components/results/ResultsList.vue';
import SearchBar from './components/search/SearchBar.vue';
import ConsentScreen from './components/settings/ConsentScreen.vue';
import SettingsDialog from './components/settings/SettingsDialog.vue';
import Button from './components/ui/button/Button.vue';
import { HOVER_HIDE_MS, HOVER_SHOW_MS } from './state/kanjiHover.ts';
import { useRecognizer } from './state/recognizer.ts';
import { useSearch } from './state/search.ts';
import { useSettings } from './state/settings.ts';

const ready = ref(false);
const tipCh = ref<string | null>(null);
const tipX = ref(0);
const tipY = ref(0);
const dialogCh = ref<string | null>(null);
const showSettings = ref(false);
const searchbar = ref<{
    setQuery: (t: string) => void;
    insertChar: (ch: string) => void;
    buttonRect: () => DOMRect | null;
    focus: () => void;
} | null>(null);
const panel = ref<{
    place: (x: number, y: number) => void;
    placeAbove: (x: number, bottom: number) => void;
} | null>(null);
const mainPane = ref<HTMLElement | null>(null);
const divider = ref<{ pct: number } | null>(null);
const consent = ref<{ recheck: () => void } | null>(null);
const appSettings = storeToRefs(useSettings()).settings;
const barBottom = computed(() => appSettings.value.searchBar === 'bottom');
const recognizerStore = useRecognizer();
const { open: panelOpen } = storeToRefs(recognizerStore);

const searchStore = useSearch();
const { suggestions, status, selectedEntry } = storeToRefs(searchStore);
const { searchNow } = searchStore;
const activeEntry = computed(() => selectedEntry.value);

function onConsentLoaded(): void {
    ready.value = true;
    searchStore.markLoaded();
    void searchStore.refreshScopes();
}

let tipTimer: number | undefined;
let hideTimer: number | undefined;
function showTip(ch: string, x: number, y: number): void {
    window.clearTimeout(hideTimer);
    window.clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => {
        tipCh.value = ch;
        tipX.value = x;
        tipY.value = y;
    }, HOVER_SHOW_MS);
}
function hideTip(): void {
    window.clearTimeout(tipTimer);
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
        tipCh.value = null;
    }, HOVER_HIDE_MS);
}

function openKanji(ch: string): void {
    tipCh.value = null;
    dialogCh.value = ch;
}

function searchWord(q: string): void {
    // Modeless kanji dialog stays open across searches (desktop).
    const query = queryFor(q);
    searchbar.value?.setQuery(query);
    searchNow(query);
    searchbar.value?.focus();
}

function insertChar(ch: string): void {
    searchbar.value?.insertChar(ch);
}

// Panel anchors under the handwriting button (top bar), or
// above it when the search bar docks at the bottom (clamped in
// place()); clicking anywhere else dismisses it, like the
// desktop click-away policy.
function anchorPanel(): void {
    const r = searchbar.value?.buttonRect();
    if (r == null) {
        return;
    }
    if (barBottom.value) {
        panel.value?.placeAbove(r.left, r.top - 6);
    } else {
        panel.value?.place(r.left, r.bottom + 6);
    }
}

watch(panelOpen, (open) => {
    if (open) {
        void nextTick(anchorPanel);
    }
});

function onPointerDown(e: PointerEvent): void {
    // Dev-server ergonomics: the panel stays put while iterating
    // (production keeps the desktop click-away policy).
    if (!panelOpen.value || import.meta.env.DEV) {
        return;
    }
    const t = e.target;
    if (!(t instanceof Element)) {
        return;
    }
    if (t.closest('[data-panel]') != null || t.closest('[data-recognizer-toggle]') != null) {
        return;
    }
    if (t.closest('[role="dialog"]') != null) {
        return;
    }
    panelOpen.value = false;
}

function onCacheCleared(): void {
    showSettings.value = false;
    searchNow('');
    ready.value = false;
    consent.value?.recheck();
}

onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown);
    // Like the desktop focus-loss policy: the panel closes when the
    // window loses focus.
    window.addEventListener('blur', () => {
        if (!import.meta.env.DEV) {
            panelOpen.value = false;
        }
    });
    window.addEventListener('resize', anchorPanel);
});
</script>

<template>
    <div class="h-screen supports-[height:100dvh]:h-dvh bg-background text-foreground">
        <consent-screen v-if="!ready" ref="consent" @loaded="onConsentLoaded" />
        <div v-else class="h-screen supports-[height:100dvh]:h-dvh flex flex-col">
            <header
                :class="barBottom ? 'order-3 border-t' : 'order-1 border-b'"
                class="flex items-center gap-2 px-3 py-2 border-border"
            >
                <search-bar
                    ref="searchbar"
                    class="flex-1"
                    @open-settings="showSettings = true"
                />
                <Button
                    variant="ghost"
                    title="Settings"
                    class="w-10 h-10 hidden sm:inline-flex"
                    @click="showSettings = true"
                    ><mdi-icon :path="mdiCog" /></Button
                >
            </header>
            <div
                v-if="suggestions.length > 0"
                :class="barBottom ? 'order-2 border-t' : 'order-2 border-b'"
                class="flex items-center gap-2 px-3 py-1.5 border-border text-sm text-muted-foreground"
            >
                <span>Did you mean:</span>
                <Button
                    v-for="s in suggestions"
                    :key="s.surface"
                    variant="outline"
                    size="xs"
                    :title="s.chain.join(' → ')"
                    @click="searchWord(s.surface)"
                >
                    {{ s.surface }}
                </Button>
            </div>
            <main ref="mainPane" :class="barBottom ? 'order-1' : 'order-3'" class="flex-1 flex min-h-0">
                <results-list
                    :style="
                        activeEntry != null
                            ? { width: `${divider?.pct ?? appSettings.resultsPct ?? 46}%` }
                            : { width: '100%' }
                    "
                    :class="activeEntry != null ? 'border-r border-border' : ''"
                    class="shrink-0 min-w-0"
                    @tip="showTip"
                    @tip-hide="hideTip"
                    @open-kanji="openKanji"
                />
                <pane-divider v-if="activeEntry != null" ref="divider" :container="mainPane" />
                <article-view
                    v-if="activeEntry != null"
                    :entry="activeEntry"
                    @close="searchStore.deselect()"
                    :status="status"
                    class="flex-1 min-w-0"
                    @search="searchWord"
                    @tip="showTip"
                    @tip-hide="hideTip"
                    @open-kanji="openKanji"
                />
            </main>
            <footer class="order-4 px-3 py-1 border-t border-border text-xs text-muted-foreground">
                {{ status || '&nbsp;' }}
            </footer>
            <kanji-tip :ch="tipCh" :x="tipX" :y="tipY" />
            <kanji-dialog
                :ch="dialogCh"
                @close="dialogCh = null"
                @search="searchWord"
                @open-kanji="openKanji"
                @tip="showTip"
                @tip-hide="hideTip"
            />
            <recognizer-panel
                ref="panel"
                @insert="insertChar"
                @open-kanji="openKanji"
                @tip="showTip"
                @tip-hide="hideTip"
            />
            <settings-dialog
                :show="showSettings"
                @close="showSettings = false"
                @cleared="onCacheCleared"
            />
        </div>
    </div>
</template>
