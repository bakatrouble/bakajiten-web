<script setup lang="ts">
import { XIcon } from '@lucide/vue';
// Kanji information dialog (modeless, Qt layout): two tabs —
// Info (stroke player + detail runs) and Words (the shared
// results table) — plus togglable Similar / Parts / Part-of
// candidate strips below. Draggable by the header, resizable
// from the corner; geometry and strip state persist.
import { storeToRefs } from 'pinia';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { backend } from '../../backend/Backend.ts';
import { useSearch } from '../../state/search.ts';
import { useSettings } from '../../state/settings.ts';
import { useDialogGeometry } from '../../ui/dialogGeometry.ts';
import type { DictEntry, KanjiEntry, KanjiStroke } from '../../vendor/libdict/dict.ts';
import { Dict } from '../../vendor/libdict/dict.ts';
import type { StripItem } from '../common/CandidateList.vue';
import ResultsList, { type ResultRow } from '../results/ResultsList.vue';
import Button from '../ui/button/Button.vue';
import Card from '../ui/card/Card.vue';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs/index.ts';
import KanjiInfo from './KanjiInfo.vue';
import KanjiStrip from './KanjiStrip.vue';
import StrokePlayer from './StrokePlayer.vue';

const props = defineProps<{ ch: string | null }>();
const emit = defineEmits<{
    close: [];
    search: [query: string];
    openKanji: [ch: string];
    tip: [ch: string, x: number, y: number];
    tipHide: [];
}>();

const isOpen = computed(() => props.ch != null);
const { settings } = storeToRefs(useSettings());

const tabItems = [
    { label: 'Info', value: 'info' },
    { label: 'Words', value: 'words' },
];
const tab = ref('info');
const transportBar = ref<HTMLElement | null>(null);
const info = ref<KanjiEntry | null>(null);
const words = ref<DictEntry[]>([]);
const similar = ref<string[]>([]);
const partOf = ref<string[]>([]);
const strokeList = ref<KanjiStroke[]>([]);
const wordSelected = ref(0);
// Guards the async open: a retarget mid-flight must not let stale
// lookups clobber the new kanji.
let requestId = 0;

watch(
    () => props.ch,
    async (ch) => {
        const id = ++requestId;
        // Content resets per kanji (strip visibility persists), and
        // the dialog reopens on the Info tab.
        tab.value = 'info';
        info.value = null;
        words.value = [];
        similar.value = [];
        partOf.value = [];
        strokeList.value = [];
        wordSelected.value = 0;
        if (ch == null) {
            return;
        }
        const b = await backend();
        if (id !== requestId) {
            return;
        }
        // The words tab searches the active scope dictionary, falling
        // back to English when it isn't materialized.
        const search = useSearch();
        const dict = search.scopeDictionary() ?? b.dict;
        info.value = b.kanji.lookup(ch);
        words.value = dict.searchMiddle(ch, 30);
        strokeList.value = b.kanji.strokes(ch);
        partOf.value = b.kanji.containing(ch);
        const strokes = strokeList.value.map((s) => s.points.map((p) => ({ x: p.x, y: p.y })));
        similar.value = b.recognizer.similar(strokes, ch, 12).map((c) => c.character);
    },
    { immediate: true },
);

const radicalText = computed(() => {
    const r = info.value?.radical;
    // Qt window-title order: number then glyph, `-` when none.
    return r == null ? '-' : `${r} ${Dict.radicalGlyph(r)}`;
});
// Qt window title: `Kanji information - Stroke count: N Radical: R`.
const titleText = computed(() =>
    info.value == null
        ? 'Kanji info'
        : `Stroke count: ${info.value.strokes} · Radical: ${radicalText.value}`,
);

const wordRows = computed<ResultRow[]>(() =>
    words.value.map((entry) => ({ entry, matched: props.ch ?? '', chain: [] as string[] })),
);

function selectWord(i: number): void {
    const w = words.value[i];
    if (w != null) {
        emit('search', w.heading);
    }
}

function toItems(chars: string[]): StripItem[] {
    return chars.map((character) => ({ character, distance: 0, isKana: false }));
}

const { box, startDrag, startResize, adjustHeight } = useDialogGeometry({ w: 640, h: 560, y: 76 });

// Strip toggles resize the dialog by the list height (headers are
// already in the base height): closing measures pre-flush while the
// list is still mounted, opening measures after it mounts.
const similarStrip = ref<{ $el: unknown } | null>(null);
const partsStrip = ref<{ $el: unknown } | null>(null);
const partOfStrip = ref<{ $el: unknown } | null>(null);

function stripDeltaHeight(el: { $el: unknown } | null): number {
    // Whole strip root growth past its (always mounted) header row:
    // borders, inner margins and list height in one live number.
    const root = el?.$el;
    if (!(root instanceof HTMLElement)) {
        return 0;
    }
    const header = root.firstElementChild;
    const headerH = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
    return root.getBoundingClientRect().height - headerH;
}

function watchStrip(get: () => boolean, el: () => { $el: unknown } | null): void {
    watch(get, (now) => {
        if (now) {
            void nextTick(() => adjustHeight(stripDeltaHeight(el())));
        } else {
            adjustHeight(-stripDeltaHeight(el()));
        }
    });
}

watchStrip(
    () => settings.value.kanjiStrips.similar,
    () => similarStrip.value,
);
watchStrip(
    () => settings.value.kanjiStrips.parts,
    () => partsStrip.value,
);
watchStrip(
    () => settings.value.kanjiStrips.partOf,
    () => partOfStrip.value,
);

function onKey(e: KeyboardEvent): void {
    // Modeless: Escape closes, but never steals the search field's
    // own Escape (clear) while typing there.
    if (e.key === 'Escape' && props.ch != null && !(e.target instanceof HTMLInputElement)) {
        emit('close');
    }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
    <Card
        v-if="isOpen"
        class="fixed z-50 flex flex-col p-4 gap-2 overflow-hidden"
        data-kanji-dialog
        role="dialog"
        :aria-label="`Kanji information ${props.ch ?? ''} - ${titleText}`"
        :style="{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` }"
    >
        <span
            class="flex items-center gap-2 select-none border-b -mx-4 -mt-4 px-4 py-2"
            @pointerdown="startDrag"
        >
            <span class="text-sm font-bold">Kanji information - {{ titleText }}</span>
            <span class="flex-1" />
            <Button
                variant="ghost"
                size="icon-sm"
                title="Close"
                @click="emit('close')"
                @pointerdown.stop
                ><XIcon /><span class="sr-only">Close</span></Button
            >
        </span>
        <Tabs v-model="tab" class="flex-1 min-h-0">
            <TabsList>
                <TabsTrigger v-for="t in tabItems" :key="t.value" :value="t.value">{{
                    t.label
                }}</TabsTrigger>
            </TabsList>
            <TabsContent value="info" class="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div class="flex gap-3 h-full min-h-0">
                    <stroke-player
                        :strokes="strokeList"
                        :controls-el="transportBar"
                        class="w-[50%] shrink-0"
                    />
                    <div class="flex-1 min-w-0 py-2 overflow-y-auto">
                        <kanji-info v-if="info != null" :info="info" />
                    </div>
                </div>
                <div ref="transportBar" class="shrink-0" />
            </TabsContent>
            <TabsContent value="words" class="flex-1 min-h-0 overflow-hidden">
                <results-list
                    class="h-full"
                    :rows="wordRows"
                    :selected="wordSelected"
                    :query-text="props.ch ?? ''"
                    :on-select="selectWord"
                    @tip="(ch, x, y) => emit('tip', ch, x, y)"
                    @tip-hide="emit('tipHide')"
                    @open-kanji="(ch) => emit('openKanji', ch)"
                />
            </TabsContent>
        </Tabs>
        <kanji-strip
            ref="similarStrip"
            v-model:open="settings.kanjiStrips.similar"
            title="Similar"
            :items="toItems(similar)"
            @navigate="(ch) => emit('openKanji', ch)"
            @tip="(ch, x, y) => emit('tip', ch, x, y)"
            @tip-hide="emit('tipHide')"
        />
        <kanji-strip
            ref="partsStrip"
            v-model:open="settings.kanjiStrips.parts"
            title="Parts"
            :items="info != null ? toItems(info.parts) : []"
            @navigate="(ch) => emit('openKanji', ch)"
            @tip="(ch, x, y) => emit('tip', ch, x, y)"
            @tip-hide="emit('tipHide')"
        />
        <kanji-strip
            ref="partOfStrip"
            v-model:open="settings.kanjiStrips.partOf"
            title="Part of"
            :items="toItems(partOf)"
            @navigate="(ch) => emit('openKanji', ch)"
            @tip="(ch, x, y) => emit('tip', ch, x, y)"
            @tip-hide="emit('tipHide')"
        />
        <div
            class="absolute bottom-0 right-0 z-10 cursor-nwse-resize text-muted-foreground text-xs select-none pt-3 pl-3"
            title="Resize dialog"
            @pointerdown="startResize"
        >
            ◢
        </div>
    </Card>
</template>
