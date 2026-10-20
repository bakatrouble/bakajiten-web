<script setup lang="ts">
// Virtual scrolling over the full hit list: only the visible
// window (+ overscan) materializes rows via entryAtHit, so any
// result count scrolls with a bounded DOM. Rows stay uniform
// single-line; height is measured live (follows UI scale). The
// list is a real table (header and rows share column geometry);
// headword/reading widths resize by drag and persist.

import { storeToRefs } from 'pinia';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
    highlightMatch,
    isKanaEntry,
    type NumberedSense,
    numberedContentSenses,
    preferKeb,
    preferReb,
    type SenseDisplay,
    senseGlossHtml,
} from '../../backend/labels.ts';
import { useKanjiHover } from '../../state/kanjiHover.ts';
import { useSearch } from '../../state/search.ts';
import { useSettings } from '../../state/settings.ts';
import { useColumnWidths } from '../../ui/tableColumns.ts';
import type { DictEntry } from '../../vendor/libdict/dict.ts';
import { Dict } from '../../vendor/libdict/dict.ts';
import TagBadges from './TagBadges.vue';

/** One table row: the entry (null while loading), its matched
 *  surface, and its deinflection chain. The main search fills
 *  these from the store; the kanji dialog passes its own. */
export interface ResultRow {
    entry: DictEntry | null;
    matched: string;
    chain: string[];
}

const props = defineProps<{
    rows?: ResultRow[] | null;
    selected?: number | null;
    queryText?: string;
    onSelect?: ((index: number) => void) | null;
}>();

const emit = defineEmits<{
    select: [index: number];
    tip: [ch: string, x: number, y: number];
    tipHide: [];
    openKanji: [ch: string];
}>();

const OVERSCAN = 6;

const searchStore = useSearch();
const { hits, selected: storeSelected, query } = storeToRefs(searchStore);
const { hitAt, entryAtHit } = searchStore;
const { settings } = storeToRefs(useSettings());

// Controlled mode (kanji dialog words tab) replaces the store as
// the row/selection source; everything else is shared.
const controlled = computed(() => props.onSelect != null);
const count = computed(() => props.rows?.length ?? hits.value.length);
const selIndex = computed(() => (controlled.value ? (props.selected ?? -1) : storeSelected.value));
const q = computed(() => props.queryText ?? query.value);

function rowAt(i: number): ResultRow {
    if (props.rows != null) {
        return (
            props.rows[i] ?? {
                entry: null,
                matched: '',
                chain: [],
            }
        );
    }
    const h = hitAt(i);
    return { entry: entryAtHit(i), matched: h?.matched ?? '', chain: h?.chain ?? [] };
}
const hover = ref(-1);
const scroller = ref<HTMLElement | null>(null);
const rowH = ref(32);
const scrollTop = ref(0);
const viewH = ref(600);
let raf = 0;

const visible = computed(() => {
    const start = Math.max(0, Math.floor(scrollTop.value / rowH.value) - OVERSCAN);
    const end = Math.min(
        count.value,
        Math.ceil((scrollTop.value + viewH.value) / rowH.value) + OVERSCAN,
    );
    const out: number[] = [];
    for (let i = start; i < end; i++) {
        out.push(i);
    }
    return out;
});

// Spacer heights above/below the rendered window.
const padTop = computed(() => (visible.value[0] ?? 0) * rowH.value);
const padBottom = computed(
    () => (count.value - ((visible.value[visible.value.length - 1] ?? -1) + 1)) * rowH.value,
);

// Headword/reading column widths (px), persisted across sessions.
// Live drag values commit on pointer-up.
const { w0, w1, startColResize } = useColumnWidths('bakajiten-web-columns', 128, 112);

function onScroll(): void {
    cancelAnimationFrame(raf);
    emit('tipHide');
    raf = requestAnimationFrame(() => {
        if (scroller.value != null) {
            scrollTop.value = scroller.value.scrollTop;
        }
    });
}

function measure(): void {
    const row = scroller.value?.querySelector('[role="option"]');
    if (row instanceof HTMLElement && row.offsetHeight > 0) {
        rowH.value = row.offsetHeight;
    }
}

function readingOf(e: DictEntry): string {
    const { romaji } = settings.value;
    const reb = preferReb(e, q.value);
    return romaji === 'Hepburn' || romaji === 'Kunrei' ? Dict.kanaToRomaji(reb, romaji) : reb;
}

function highlight(text: string, row: number): string {
    return highlightMatch(text, rowAt(row).matched);
}

function headingHtml(i: number): string {
    const e = rowAt(i).entry;
    return e == null ? '' : highlight(preferKeb(e, q.value), i);
}

function readingHtml(i: number): string {
    const e = rowAt(i).entry;
    return e == null ? '' : highlight(readingOf(e), i);
}

function meaningSenses(i: number): NumberedSense[] {
    const e = rowAt(i).entry;
    return e == null ? [] : numberedContentSenses(e, 3);
}

function glossHtml(s: SenseDisplay, i: number): string {
    return senseGlossHtml(s, rowAt(i).matched);
}

function isKana(i: number): boolean {
    const e = rowAt(i).entry;
    return e != null && isKanaEntry(e);
}

function rowClass(i: number): string {
    if (i === selIndex.value) {
        return 'bg-primary/15';
    }
    if (rowAt(i).chain.length > 0) {
        return 'bg-emerald-500/10';
    }
    return i === hover.value ? 'bg-muted' : '';
}

function rowTitle(i: number): string {
    const chain = rowAt(i).chain;
    return chain.length > 0 ? chain.join(' → ') : '';
}

function select(i: number): void {
    if (controlled.value && props.onSelect != null) {
        props.onSelect(i);
        return;
    }
    storeSelected.value = i;
    emit('select', i);
}

const kanjiHover = useKanjiHover();
const onMove = (e: MouseEvent): void => kanjiHover.onMove(e, emit);
const onLeave = (): void => kanjiHover.onLeave(emit);
const onDoubleClick = (e: MouseEvent): void => kanjiHover.onDoubleClick(e, emit);

function onRowMove(e: MouseEvent, i: number): void {
    hover.value = i;
    onMove(e);
}

watch(
    () => count.value,
    () => {
        if (scroller.value != null) {
            scroller.value.scrollTop = 0;
        }
        scrollTop.value = 0;
        hover.value = -1;
        void nextTick(measure);
    },
);
// UI scale changes row height: re-measure after fonts settle.
watch(
    () => settings.value.scale,
    () => void nextTick(measure),
);

onMounted(() => {
    void nextTick(measure);
    // Container size is not reactive: re-measure on tab switches,
    // pane resizes, and dialog resizes so spacers never drift.
    const ro = new ResizeObserver(() => {
        if (scroller.value != null) {
            viewH.value = scroller.value.clientHeight;
        }
        void nextTick(measure);
    });
    if (scroller.value != null) {
        viewH.value = scroller.value.clientHeight;
        ro.observe(scroller.value);
    }
    onUnmounted(() => ro.disconnect());
});
</script>

<template>
    <div class="h-full flex flex-col min-h-0">
        <div
            ref="scroller"
            class="overflow-y-auto relative flex-1 min-h-0"
            role="listbox"
            @scroll.passive="onScroll"
            @mouseleave="hover = -1"
        >
            <table class="w-full table-fixed border-collapse border-border">
                <colgroup>
                    <col :style="{ width: `${w0}px` }">
                    <col :style="{ width: `${w1}px` }">
                    <col>
                </colgroup>
                <thead class="sticky top-0 z-10">
                    <tr class="bg-background text-xs text-muted-foreground">
                        <th
                            scope="col"
                            class="relative text-left font-normal px-2 py-1 shadow-[inset_-1px_-1px_0_0_var(--border)]"
                        >
                            Headword
                            <span
                                class="group/col absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize"
                                title="Resize column"
                                @pointerdown="startColResize($event, 0)"
                                ><span
                                    class="absolute right-[.4rem] top-1 bottom-1 w-1 rounded bg-border group-hover/col:bg-primary"
                                /></span
                            >
                        </th>
                        <th
                            scope="col"
                            class="relative text-left font-normal px-2 py-1 shadow-[inset_-1px_-1px_0_0_var(--border)]"
                        >
                            Reading
                            <span
                                class="group/col absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize"
                                title="Resize column"
                                @pointerdown="startColResize($event, 1)"
                                ><span
                                    class="absolute right-[.4rem] top-1 bottom-1 w-1 rounded bg-border group-hover/col:bg-primary"
                                /></span
                            >
                        </th>
                        <th
                            scope="col"
                            class="text-left font-normal px-2 py-1 shadow-[inset_0_-1px_0_0_var(--border)]"
                        >
                            Meaning
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="padTop > 0" aria-hidden="true">
                        <td colspan="3" :style="{ height: `${padTop}px`, padding: 0, border: 0 }" />
                    </tr>
                    <tr
                        v-for="i in visible"
                        :key="i"
                        role="option"
                        :aria-selected="i === selIndex"
                        class="cursor-pointer border-b border-border"
                        :class="rowClass(i)"
                        :title="rowTitle(i)"
                        @click="select(i)"
                        @mousemove="onRowMove($event, i)"
                        @mouseleave="onLeave"
                        @dblclick="onDoubleClick"
                    >
                        <template v-if="rowAt(i).entry != null">
                            <td class="px-2 border-r border-border">
                                <div
                                    class="text-lg overflow-hidden whitespace-nowrap"
                                    :class="{ 'opacity-40': isKana(i) }"
                                    v-html="headingHtml(i)"
                                ></div>
                            </td>
                            <td class="px-2 border-r border-border">
                                <div
                                    class="overflow-hidden whitespace-nowrap"
                                    v-html="readingHtml(i)"
                                ></div>
                            </td>
                            <td class="px-2">
                                <div class="overflow-hidden whitespace-nowrap">
                                    <template v-for="row in meaningSenses(i)" :key="row.n">
                                        <span>{{ row.n }}. </span>
                                        <tag-badges :sense="row.sense" />
                                        <span v-html="glossHtml(row.sense, i)" class="mr-2"></span>
                                    </template>
                                </div>
                            </td>
                        </template>
                    </tr>
                    <tr v-if="padBottom > 0" aria-hidden="true">
                        <td
                            colspan="3"
                            :style="{ height: `${padBottom}px`, padding: 0, border: 0 }"
                        />
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
