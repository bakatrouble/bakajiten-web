<script setup lang="ts">
// Ink capture surface: canvas-pixel strokes with the amber live
// stroke, grid + paper from the canvas theme. Pushes finished
// strokes to the recognizer store (which maps to pen space at
// query time); repaints on strokes, grid, or theme changes.
import { storeToRefs } from 'pinia';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { MOVE_MIN, type Point, useRecognizer } from '../../state/recognizer.ts';
import { useCanvasTheme } from '../../ui/palette.ts';

const props = defineProps<{ grid: boolean }>();

const recognizerStore = useRecognizer();
const { strokes } = storeToRefs(recognizerStore);
const { pushStroke, clear, ensureModel, setInkSize } = recognizerStore;
const theme = useCanvasTheme();

const canvas = ref<HTMLCanvasElement | null>(null);
const drawing = ref(false);
// CSS-px view size (device pixels live on the bitmap): refreshed
// by the resize observer so paint always covers the element.
let viewW = 0;
let viewH = 0;
let current: Point[] | null = null;

function pos(e: PointerEvent): Point {
    // Canvas pixels (Qt parity: resizing never rescales drawn ink;
    // pen mapping happens at query time against the live size).
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
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
    if (c == null || viewW <= 0 || viewH <= 0) {
        return;
    }
    const ctx = c.getContext('2d');
    if (ctx == null) {
        return;
    }
    // Points are canvas pixels: paint 1:1, never rescaled (Qt
    // parity — pen mapping happens at query time instead).
    const W = viewW;
    const H = viewH;
    const dpr = c.width / W || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = theme.value.paper;
    ctx.fillRect(0, 0, W, H);
    if (props.grid) {
        // Qt gridFor parity: as many >=40px square cells as fit
        // (at least one each way), grown uniformly to fill, block
        // centered — border included in the lattice.
        const MIN_CELL = 40;
        const cols = Math.max(1, Math.floor(W / MIN_CELL));
        const rows = Math.max(1, Math.floor(H / MIN_CELL));
        const cell = Math.max(1, Math.min(Math.floor(W / cols), Math.floor(H / rows)));
        const ox = (W - cols * cell) / 2;
        const oy = (H - rows * cell) / 2;
        ctx.strokeStyle = theme.value.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= cols; i++) {
            const x = ox + i * cell;
            ctx.moveTo(x, oy);
            ctx.lineTo(x, oy + rows * cell);
        }
        for (let j = 0; j <= rows; j++) {
            const y = oy + j * cell;
            ctx.moveTo(ox, y);
            ctx.lineTo(ox + cols * cell, y);
        }
        ctx.stroke();
    }
    const draw = (s: Point[], active: boolean) => {
        ctx.strokeStyle = active ? theme.value.active : theme.value.ink;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        // Pixel ink: points paint 1:1, never rescaled to the view.
        s.forEach((p, i) => {
            if (i === 0) {
                ctx.moveTo(p.x, p.y);
            } else {
                ctx.lineTo(p.x, p.y);
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
    // Pen-space move threshold (Qt compares in pen units too):
    // normalize the pixel delta by the live view size.
    if (last != null && viewW > 0 && viewH > 0) {
        const pen =
            (Math.abs(p.x - last.x) / viewW + Math.abs(p.y - last.y) / viewH) * 255;
        if (pen < MOVE_MIN) {
            return;
        }
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

// Right-click clears on the desktop; a touch long-press must
// never wipe ink (the toolbar Clear button is the universal
// path). Unknown event flavors keep the desktop behavior.
function onContextMenu(e: MouseEvent): void {
    if ('pointerType' in e && (e as PointerEvent).pointerType !== 'mouse') {
        return;
    }
    clear();
}

watch([strokes, () => props.grid, theme], paint, { deep: true });

let ro: ResizeObserver | null = null;

onMounted(() => {
    void ensureModel().then(paint);
    const c = canvas.value;
    if (c == null || typeof ResizeObserver === 'undefined') {
        return;
    }
    // Backing store follows the element (DPR-aware): fractions
    // stay resolution-independent, strokes never rescale.
    ro = new ResizeObserver(() => {
        const el = canvas.value;
        if (el == null) {
            return;
        }
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) {
            return;
        }
        const scale = globalThis.devicePixelRatio || 1;
        viewW = r.width;
        viewH = r.height;
        setInkSize(r.width, r.height);
        el.width = Math.max(1, Math.round(r.width * scale));
        el.height = Math.max(1, Math.round(r.height * scale));
        paint();
    });
    ro.observe(c);
});

onUnmounted(() => {
    ro?.disconnect();
    ro = null;
});
</script>

<template>
    <canvas
        ref="canvas"
        width="360"
        height="360"
        class="recognizer-canvas block w-full h-full rounded border border-border touch-none"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="cancel"
        @contextmenu.prevent="onContextMenu"
    />
</template>
