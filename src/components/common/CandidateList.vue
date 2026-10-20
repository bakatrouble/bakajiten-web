<script setup lang="ts">
// Horizontal candidate strip: kata/hira tints, edge fades,
// vertical-wheel panning, single-click accept. A double-click
// opens kanji info instead (the accept is held past the
// double-click interval). Shared by the recognizer panel and
// the kanji dialog strips.
import { nextTick, onMounted, ref, watch } from 'vue';
import { useKanjiHover } from '../../state/kanjiHover.ts';
import { useCanvasTheme } from '../../ui/palette.ts';
import Button from '../ui/button/Button.vue';

export interface StripItem {
    character: string;
    distance?: number | bigint;
    isKana?: boolean;
}

const props = defineProps<{ items: StripItem[] }>();
const emit = defineEmits<{
    insert: [ch: string];
    openKanji: [ch: string];
    tip: [ch: string, x: number, y: number];
    tipHide: [];
}>();

const kanjiHover = useKanjiHover();
const onHover = (e: MouseEvent): void => kanjiHover.onMove(e, emit);
const onLeave = (): void => kanjiHover.onLeave(emit);
const theme = useCanvasTheme();

const strip = ref<HTMLElement | null>(null);
const showLeftFade = ref(false);
const showRightFade = ref(false);

function isKatakana(ch: string): boolean {
    const c = ch.codePointAt(0) ?? 0;
    return c >= 0x30a0 && c <= 0x30ff;
}

function candidateClass(c: StripItem): string {
    if (c.isKana !== true) {
        return '';
    }
    return isKatakana(c.character)
        ? 'text-sky-600 dark:text-sky-400 bg-sky-500/15'
        : 'text-emerald-600 dark:text-emerald-500 bg-emerald-500/15';
}

let clickTimer: number | undefined;
function onInsert(ch: string): void {
    // A double-click fires click twice: hold the accept past the
    // double-click interval so it only lands on a single click.
    window.clearTimeout(clickTimer);
    clickTimer = window.setTimeout(() => emit('insert', ch), 280);
}

function onOpenKanji(ch: string): void {
    window.clearTimeout(clickTimer);
    emit('openKanji', ch);
}

function updateFades(): void {
    const el = strip.value;
    if (el == null) {
        return;
    }
    showLeftFade.value = el.scrollLeft > 0;
    showRightFade.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
}

function onWheel(e: WheelEvent): void {
    // A vertical wheel over the horizontal strip pans candidates.
    const el = strip.value;
    if (el == null || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) {
        return;
    }
    e.preventDefault();
    el.scrollTo({ left: el.scrollLeft + e.deltaY, behavior: 'smooth' });
}

watch(
    () => props.items,
    () => {
        void nextTick(updateFades);
    },
);
onMounted(() => {
    void nextTick(updateFades);
});
</script>

<template>
    <div
        data-candidate-box
        class="relative mt-2 border border-border rounded-lg overflow-hidden bg-canvas-paper"
    >
        <div
            v-show="showLeftFade"
            class="pointer-events-none absolute left-0 top-0 bottom-0 w-7 z-10"
            :style="{ background: `linear-gradient(to right, ${theme.paper}, transparent)` }"
        />
        <div
            v-show="showRightFade"
            class="pointer-events-none absolute right-0 top-0 bottom-0 w-7 z-10"
            :style="{ background: `linear-gradient(to left, ${theme.paper}, transparent)` }"
        />
        <div
            ref="strip"
            class="candidate-strip flex overflow-x-auto overflow-y-hidden min-h-10 items-stretch"
            @scroll.passive="updateFades"
            @wheel="onWheel"
        >
            <Button
                v-for="c in items"
                :key="c.character"
                variant="ghost"
                size="lg"
                class="text-lg rounded-none hover:bg-foreground! hover:text-background h-auto"
                :title="c.distance == null ? c.character : String(c.distance)"
                :class="candidateClass(c)"
                @click="onInsert(c.character)"
                @dblclick="onOpenKanji(c.character)"
                @mousemove="onHover"
                @mouseleave="onLeave"
                >{{
                    c.character
                }}</Button
            >
        </div>
    </div>
</template>
