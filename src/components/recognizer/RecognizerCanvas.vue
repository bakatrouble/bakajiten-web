<script setup lang="ts">
// Ink capture surface: pen-space strokes with the amber live
// stroke, grid + paper from the canvas theme. Pushes finished
// strokes to the recognizer store (which re-matches); repaints
// on strokes, grid, or theme changes.
import { storeToRefs } from 'pinia';
import { onMounted, ref, watch } from 'vue';
import { MOVE_MIN, type Point, useRecognizer } from '../../state/recognizer.ts';
import { useCanvasTheme } from '../../ui/palette.ts';

const props = defineProps<{ grid: boolean }>();

const recognizerStore = useRecognizer();
const { strokes } = storeToRefs(recognizerStore);
const { pushStroke, clear, ensureModel } = recognizerStore;
const theme = useCanvasTheme();

const canvas = ref<HTMLCanvasElement | null>(null);
const drawing = ref(false);
let current: Point[] | null = null;

function pos(e: PointerEvent): Point {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}

function lastPen(): Point | null {
    const s = current;
    if (s == null || s.length === 0) {
        return null;
    }
    const last = s[s.length - 1];
    return last ?? null;
}

function paint(): void {
    const c = canvas.value;
    if (c == null) {
        return;
    }
    const ctx = c.getContext('2d');
    if (ctx == null) {
        return;
    }
    const W = c.width;
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = theme.value.paper;
    ctx.fillRect(0, 0, W, W);
    if (props.grid) {
        ctx.strokeStyle = theme.value.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const f of [0.1, 0.5, 0.9]) {
            ctx.moveTo(W * f, 0);
            ctx.lineTo(W * f, W);
            ctx.moveTo(0, W * f);
            ctx.lineTo(W, W * f);
        }
        ctx.stroke();
        ctx.strokeRect(0.5, 0.5, W - 1, W - 1);
    }
    const draw = (s: Point[], active: boolean) => {
        ctx.strokeStyle = active ? theme.value.active : theme.value.ink;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        s.forEach((p, i) => {
            const X = p.x * W;
            const Y = p.y * W;
            if (i === 0) {
                ctx.moveTo(X, Y);
            } else {
                ctx.lineTo(X, Y);
            }
        });
        ctx.stroke();
    };
    for (const s of strokes.value) {
        draw(s, false);
    }
    if (current != null) {
        draw(current, true);
    }
}

function down(e: PointerEvent): void {
    if (e.button === 2) {
        return;
    }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    current = [pos(e)];
    drawing.value = true;
    paint();
}

function move(e: PointerEvent): void {
    if (current == null) {
        return;
    }
    const p = pos(e);
    const last = lastPen();
    if (last != null && (Math.abs(p.x - last.x) + Math.abs(p.y - last.y)) * 255 < MOVE_MIN) {
        return;
    }
    current.push(p);
    paint();
}

function up(): void {
    if (current != null) {
        pushStroke(current);
        current = null;
    }
    drawing.value = false;
    paint();
}

function cancel(): void {
    current = null;
    drawing.value = false;
    paint();
}

function onClear(): void {
    clear();
}

watch([strokes, () => props.grid, theme], paint, { deep: true });
onMounted(() => {
    void ensureModel().then(paint);
});
</script>

<template>
    <canvas
        ref="canvas"
        width="360"
        height="360"
        class="recognizer-canvas w-full aspect-square rounded border border-border touch-none"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="cancel"
        @contextmenu.prevent="onClear"
    />
</template>
