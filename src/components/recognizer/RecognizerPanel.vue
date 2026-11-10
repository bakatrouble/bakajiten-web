<script setup lang="ts">
// Floating handwriting panel: pen-space capture (amber live
// stroke), undo/redo, live candidate strip with kana tints,
// edge fades, grid; anchored under the search button by the app.
// Free aspect like the desktop: the corner grip resizes width and
// height independently and the grid adapts to any canvas shape.

import { useElementSize } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { computed, nextTick, ref } from 'vue';
import { useRecognizer } from '../../state/recognizer.ts';
import { useSettings } from '../../state/settings.ts';
import AppIcon from '../common/AppIcon.vue';
import MaterialSpinner from '../common/MaterialSpinner.vue';
import Button from '../ui/button/Button.vue';
import Card from '../ui/card/Card.vue';
import CardContent from '../ui/card/CardContent.vue';
import CandidateStrip from './CandidateStrip.vue';
import RecognizerCanvas from './RecognizerCanvas.vue';

const emit = defineEmits<{
    insert: [ch: string];
    openKanji: [ch: string];
    tip: [ch: string, x: number, y: number];
    tipHide: [];
}>();

const recognizerStore = useRecognizer();
const { strokes, undone, matchMs, modelState, modelNote, packProgress, open } =
    storeToRefs(recognizerStore);
const { undo, redo, clear, downloadModel } = recognizerStore;
const { settings } = storeToRefs(useSettings());

const statusText = computed(() => {
    if (modelState.value === 'ready') {
        const base = `${strokes.value.length} stroke${strokes.value.length === 1 ? '' : 's'}`;
        return matchMs.value > 0 ? `${base} · ${matchMs.value.toFixed(0)} ms` : base;
    }
    if (modelState.value === 'downloading' && packProgress.value != null) {
        const { loaded, total } = packProgress.value;
        const pct = total > 0 ? Math.round((100 * loaded) / total) : 0;
        return `Downloading handwriting model … ${pct}%`;
    }
    if (modelState.value === 'downloading') {
        return 'Downloading handwriting model …';
    }
    if (modelState.value === 'checking') {
        return 'Loading model';
    }
    if (modelState.value === 'error') {
        return modelNote.value !== '' ? modelNote.value : 'Download failed';
    }
    return '';
});
const showSpinner = computed(
    () => modelState.value === 'checking' || modelState.value === 'downloading',
);
const grid = ref(true);
const root = ref<{ $el?: unknown } | null>(null);
const left = ref(0);
const top = ref(0);

function place(x: number, y: number): void {
    left.value = Math.max(8, Math.min(x, window.innerWidth - panelWidthLive.value - 8));
    top.value = Math.max(8, y);
}

/** Anchor above a docked-bottom search bar: the panel is
 *  v-if-mounted, so its height is only measurable after render —
 *  measure, then pin its bottom edge above the given line. */
function placeAbove(x: number, bottom: number): void {
    left.value = Math.max(8, Math.min(x, window.innerWidth - panelWidthLive.value - 8));
    void nextTick(() => {
        const el = root.value?.$el;
        const h = el instanceof HTMLElement ? el.offsetHeight : 0;
        top.value = Math.max(8, bottom - h);
    });
}

// Persisted panel width (null = default 368px); widthPx carries
// the live drag value until pointer-up commits it.
const widthPx = ref<number | null>(null);
const panelWidthLive = computed(() => widthPx.value ?? settings.value.panelWidthPx ?? 368);
// Canvas height is independent (Qt parity: the corner grip resizes
// both axes and the grid adapts to any aspect). heightPx carries
// the live drag value until pointer-up commits it.
const heightPx = ref<number | null>(null);
const canvasHeightLive = computed(() => heightPx.value ?? settings.value.panelHeightPx ?? 320);

// Canvas floor: the drag clamps width only, so this is just the
// panel's horizontal minimum (buttons flank the canvas). The
// spacer between the groups stretches instead, so the groups
// themselves (not the whole column) are measured.
const topGroupRef = ref<HTMLElement | null>(null);
const bottomGroupRef = ref<HTMLElement | null>(null);
const { height: topGroupHeight } = useElementSize(topGroupRef);
const { height: bottomGroupHeight } = useElementSize(bottomGroupRef);
const canvasMin = computed(() =>
    Math.max(0, Math.round(topGroupHeight.value + bottomGroupHeight.value)),
);
// Chrome beside the canvas in rem (scale-aware): p-3 padding both
// sides (1.5) + row gap (0.5) + toolbar width (2.5).
const CHROME_REM = 4.5;
const panelMin = computed(() => {
    if (canvasMin.value <= 0) {
        return 280;
    }
    const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return Math.round(canvasMin.value + CHROME_REM * rootPx);
});

function startResize(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = panelWidthLive.value;
    const startH = canvasHeightLive.value;
    const minW = panelMin.value;
    const move = (ev: PointerEvent): void => {
        // Only the minimum clamps (panel minimum for width, button
        // groups for height); there is no maximum, like the desktop
        // corner grip.
        widthPx.value = Math.max(minW, startW + (ev.clientX - startX));
        const minH = canvasMin.value > 0 ? canvasMin.value : 160;
        heightPx.value = Math.max(minH, startH + (ev.clientY - startY));
    };
    const up = (): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (widthPx.value != null) {
            settings.value.panelWidthPx = Math.round(widthPx.value);
            widthPx.value = null;
        }
        if (heightPx.value != null) {
            settings.value.panelHeightPx = Math.round(heightPx.value);
            heightPx.value = null;
        }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
}

defineExpose({ place, placeAbove });
</script>

<template>
    <Card
        v-if="open"
        ref="root"
        class="fixed z-40 py-0!"
        data-panel
        :style="{ left: `${left}px`, top: `${top}px`, width: `${panelWidthLive}px`, minWidth: `${panelMin}px` }"
    >
        <CardContent class="p-3 sm:p-3">
            <div class="flex gap-2 items-stretch">
                <div
                    class="flex-1 min-w-0"
                    :style="{
                        minWidth: canvasMin > 0 ? `${canvasMin}px` : undefined,
                        height: `${canvasHeightLive}px`,
                        minHeight: canvasMin > 0 ? `${canvasMin}px` : undefined,
                    }"
                >
                    <recognizer-canvas :grid="grid" />
                </div>
                <div class="flex flex-col self-stretch">
                    <div ref="topGroupRef" class="flex flex-col gap-1">
                        <Button
                            variant="ghost"
                            title="Close"
                            class="w-10 h-10"
                            @click="open = false"
                            ><app-icon name="close" /></Button
                        >
                        <Button
                            :variant="grid ? 'default' : 'ghost'"
                            title="Grid"
                            class="w-10 h-10"
                            @click="grid = !grid"
                            ><app-icon name="grid" /></Button
                        >
                    </div>
                    <div class="flex-1" />
                    <div ref="bottomGroupRef" class="flex flex-col gap-1">
                        <Button
                            variant="ghost"
                            title="Undo"
                            :disabled="strokes.length === 0"
                            class="w-10 h-10"
                            @click="undo"
                            ><app-icon name="undo" /></Button
                        >
                        <Button
                            variant="ghost"
                            title="Redo"
                            :disabled="undone.length === 0"
                            class="w-10 h-10"
                            @click="redo"
                            ><app-icon name="redo" /></Button
                        >
                        <Button variant="ghost" title="Clear" class="w-10 h-10" @click="clear"
                            ><app-icon name="erase" /></Button
                        >
                    </div>
                </div>
            </div>
                <candidate-strip
                    v-if="modelState === 'ready'"
                    @insert="emit('insert', $event)"
                    @open-kanji="emit('openKanji', $event)"
                    @tip="(ch, x, y) => emit('tip', ch, x, y)"
                    @tip-hide="emit('tipHide')"
                />
                <div v-else-if="modelState === 'missing'" class="mt-2 flex flex-col gap-1 text-sm">
                    <span class="text-muted-foreground">{{ modelNote }}</span>
                    <Button variant="outline" size="sm" class="self-start" @click="downloadModel"
                        >Download handwriting model</Button
                    >
                </div>
                <div class="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <material-spinner v-if="showSpinner" /><span>{{ statusText }}</span>
                </div>
            <div
                class="absolute bottom-0 right-0 z-10 cursor-nwse-resize text-muted-foreground text-xs select-none pt-3 pl-3"
                title="Resize panel"
                @pointerdown="startResize"
            >
                ◢
            </div>
        </CardContent>
    </Card>
</template>
