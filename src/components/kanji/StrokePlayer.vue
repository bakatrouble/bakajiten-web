<script setup lang="ts">
import { mdiPause, mdiPlay, mdiRestart, mdiStepBackward, mdiStepForward, mdiStop } from '@mdi/js';
import { useElementSize } from '@vueuse/core';
// Kanji stroke-order player, canvas-rendered: fitted square with a
// 4x4 grid, completed strokes dim, the live stroke bright with
// numbered start badges. Frames advance per point off the screen
// rate; speed 1–10 sets the per-stroke budget like the desktop.
// Resets whenever a new stroke list arrives.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { KanjiStroke } from '../../vendor/libdict/dict.ts';
import MdiIcon from '../common/MdiIcon.vue';
import Button from '../ui/button/Button.vue';

const props = defineProps<{ strokes: KanjiStroke[]; controlsEl?: HTMLElement | null }>();

const FALLBACK_SIZE = 360;
const canvas = ref<HTMLCanvasElement | null>(null);
const canvasWrapper = ref<HTMLDivElement | null>(null);
// Backing store follows the wrapper box (dialog resizes re-render
// crisp); drawing stays in CSS pixels via the dpr transform.
const { width: wrapW, height: wrapH } = useElementSize(canvasWrapper);
const size = computed(() => {
    const s = Math.floor(Math.min(wrapW.value, wrapH.value));
    return s > 0 ? s : FALLBACK_SIZE;
});
const backing = computed(() => {
    const dpr = typeof window === 'undefined' ? 1 : Math.min(3, window.devicePixelRatio || 1);
    return Math.round(size.value * dpr);
});
const playing = ref(false);
const playUpTo = ref(0);
const speed = ref(5);
// Generation guard: a retarget or stop invalidates in-flight frames.
let session = 0;
let raf = 0;

function cssVar(name: string, fallback: string): string {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v === '' ? fallback : v;
}

// Badge diameter follows the desktop cell fraction; the margin
// reserves room for the offset badges (see badgeRects).
function badgePx(): number {
    return Math.max(12, size.value * 0.075);
}

// Fit all strokes into the square with room for the offset badges.
function frame(): { lo: number; span: number; margin: number; cell: number } {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of props.strokes) {
        for (const p of s.points) {
            lo = Math.min(lo, p.x, p.y);
            hi = Math.max(hi, p.x, p.y);
        }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
        return { lo: 0, span: 200, margin: 0, cell: size.value };
    }
    const span = Math.max(1, hi - lo);
    const margin = badgePx() * 1.1;
    return { lo, span, margin, cell: size.value - 2 * margin };
}

function draw(live: { x: number; y: number }[] | null): void {
    const c = canvas.value;
    if (c == null) {
        return;
    }
    const ctx = c.getContext('2d');
    if (ctx == null) {
        return;
    }
    const { lo, span, margin, cell } = frame();
    const map = (v: number): number => margin + ((v - lo) / span) * cell;
    const muted = cssVar('--muted-foreground', '#888');
    const primary = cssVar('--primary', '#f97316');
    const grid = cssVar('--canvas-grid', '#ccc');
    const badgeText = cssVar('--canvas-badge-text', '#fff');
    const side = size.value;
    ctx.clearRect(0, 0, side, side);
    // Grid over the fitted square only (desktop KanjiStrokeView):
    // rect plus thirds, centered with room for the offset badges.
    const ox = (side - cell) / 2;
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
        const t = ox + (cell * i) / 4;
        ctx.moveTo(t, ox);
        ctx.lineTo(t, ox + cell);
        ctx.moveTo(ox, t);
        ctx.lineTo(ox + cell, t);
    }
    ctx.stroke();
    ctx.strokeRect(ox + 0.5, ox + 0.5, cell - 1, cell - 1);
    const path = (pts: { x: number; y: number }[]): void => {
        ctx.beginPath();
        pts.forEach((p, i) => {
            if (i === 0) {
                ctx.moveTo(map(p.x), map(p.y));
            } else {
                ctx.lineTo(map(p.x), map(p.y));
            }
        });
        ctx.stroke();
    };
    ctx.lineWidth = Math.max(3, size.value * 0.035);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = muted;
    for (let i = 0; i < playUpTo.value && i < props.strokes.length; i++) {
        const done = props.strokes[i];
        if (done != null) {
            path(done.points);
        }
    }
    if (live != null && live.length > 0) {
        ctx.strokeStyle = primary;
        path(live);
    }
    // Numbered badges at completed stroke starts (desktop rules):
    // rounded rect with a pointer triangle into the start point,
    // fill ramping blue → green by number. Placement tries the
    // default slot first (left of vertical strokes, top-right of
    // horizontal ones), then walks a compass ring at 1.0 and 1.9
    // badge units for the first clash-free rect, clamped on-canvas.
    const done = Math.min(playUpTo.value, props.strokes.length);
    const badge = badgePx();
    const gap = badge * 0.1;
    const placed: { x: number; y: number }[] = [];
    const D = Math.SQRT1_2;
    const defaultDir = (dx: number, dy: number): [number, number] => {
        if (Math.abs(dx) + Math.abs(dy) < 1 || Math.abs(dx) >= Math.abs(dy)) {
            return [D, -D];
        }
        return [-1, 0];
    };
    const compass: [number, number][] = [
        [1, 0],
        [D, D],
        [0, 1],
        [-D, D],
        [-1, 0],
        [-D, -D],
        [0, -1],
        [D, -D],
    ];
    ctx.font = `bold ${Math.max(7, badge * 0.55)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < done; i++) {
        const pts = props.strokes[i]?.points;
        const first = pts?.[0];
        const last = pts?.[pts.length - 1];
        if (pts == null || pts.length === 0 || first == null || last == null) {
            continue;
        }
        const sx = map(first.x);
        const sy = map(first.y);
        const ex = map(last.x);
        const ey = map(last.y);
        const dirs: [number, number][] = [defaultDir(ex - sx, ey - sy), ...compass];
        let cx = 0;
        let cy = 0;
        let found = false;
        for (const dist of [1.0, 1.9]) {
            for (const [dx, dy] of dirs) {
                const px = Math.min(
                    size.value - badge / 2,
                    Math.max(badge / 2, sx + dx * dist * badge),
                );
                const py = Math.min(
                    size.value - badge / 2,
                    Math.max(badge / 2, sy + dy * dist * badge),
                );
                const clash = placed.some(
                    (q) => Math.abs(q.x - px) < badge + gap && Math.abs(q.y - py) < badge + gap,
                );
                if (!clash) {
                    cx = px;
                    cy = py;
                    found = true;
                    break;
                }
            }
            if (found) {
                break;
            }
        }
        if (!found) {
            continue;
        }
        placed.push({ x: cx, y: cy });
        // Fill ramps blue (223°) → green (119°) like the desktop.
        const t = props.strokes.length > 1 ? i / (props.strokes.length - 1) : 0;
        ctx.fillStyle = `hsl(${223 - t * 104} 70% 42%)`;
        ctx.beginPath();
        ctx.roundRect(cx - badge / 2, cy - badge / 2, badge, badge, badge / 3);
        ctx.fill();
        // Pointer triangle, apex at the stroke start.
        const vx = cx - sx;
        const vy = cy - sy;
        const dist = Math.max(1, Math.hypot(vx, vy));
        const ax = vx / dist;
        const ay = vy / dist;
        const bx = sx + ax * badge * 0.55;
        const by = sy + ay * badge * 0.55;
        const half = badge * 0.24;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(bx - ay * half, by + ax * half);
        ctx.lineTo(bx + ay * half, by - ax * half);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = badgeText;
        ctx.fillText(String(i + 1), cx, cy);
    }
}

function stopFrames(): void {
    session += 1;
    cancelAnimationFrame(raf);
}

function resetPlay(): void {
    stopFrames();
    playing.value = false;
    playUpTo.value = 0;
    draw(null);
}

// Fractional reveal by arc length (desktop subStroke): constant
// drawing speed regardless of point density, with an interpolated
// tip instead of whole-point pops.
function liveSlice(pts: { x: number; y: number }[], fraction: number): { x: number; y: number }[] {
    const first = pts[0];
    if (first == null || fraction <= 0) {
        return [];
    }
    let total = 0;
    const segs: number[] = [];
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1] ?? first;
        const b = pts[i] ?? first;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        segs.push(len);
        total += len;
    }
    if (total <= 0) {
        return [first];
    }
    let target = Math.min(1, fraction) * total;
    const out = [first];
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1] ?? first;
        const b = pts[i] ?? first;
        const seg = segs[i - 1] ?? 0;
        if (target > seg) {
            target -= seg;
            out.push(b);
        } else {
            const t = seg > 0 ? target / seg : 0;
            out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
            break;
        }
    }
    return out;
}

function animateStroke(
    id: number,
    pts: { x: number; y: number }[],
    budgetMs: number,
): Promise<void> {
    return new Promise((resolve) => {
        const t0 = performance.now();
        const tick = (t: number): void => {
            if (!playing.value || id !== session) {
                resolve();
                return;
            }
            const frac = Math.min(1, (t - t0) / budgetMs);
            draw(liveSlice(pts, frac));
            if (frac >= 1) {
                resolve();
            } else {
                raf = requestAnimationFrame(tick);
            }
        };
        raf = requestAnimationFrame(tick);
    });
}

async function advance(id: number): Promise<void> {
    if (!playing.value || id !== session || playUpTo.value >= props.strokes.length) {
        playing.value = false;
        return;
    }
    const s = props.strokes[playUpTo.value];
    if (s == null) {
        playing.value = false;
        return;
    }
    // Desktop pacing: 1100ms per stroke at level 1, 100ms less per
    // level, flowing continuously into the next stroke.
    const strokeMs = Math.max(120, 1100 - 100 * speed.value);
    await animateStroke(id, s.points, strokeMs);
    if (!playing.value || id !== session) {
        return;
    }
    playUpTo.value += 1;
    draw(null);
    void advance(id);
}

function play(): void {
    if (playing.value) {
        stopFrames();
        playing.value = false;
        return;
    }
    if (playUpTo.value >= props.strokes.length) {
        playUpTo.value = 0;
    }
    playing.value = true;
    const id = session;
    void advance(id);
}

function restart(): void {
    stopFrames();
    playUpTo.value = 0;
    playing.value = true;
    const id = session;
    void advance(id);
}

function stop(): void {
    stopFrames();
    playing.value = false;
    draw(null);
}

function stepBack(): void {
    stopFrames();
    playing.value = false;
    playUpTo.value = Math.max(0, playUpTo.value - 1);
    draw(null);
}

function stepForward(): void {
    stopFrames();
    playing.value = false;
    playUpTo.value = Math.min(props.strokes.length, playUpTo.value + 1);
    draw(null);
}

const counter = computed(
    () => `${Math.min(playUpTo.value, props.strokes.length)} / ${props.strokes.length}`,
);

watch(
    () => props.strokes,
    (strokes) => {
        resetPlay();
        playUpTo.value = strokes.length;
        paint();
    },
    { immediate: true },
);

// Wrapper resizes (dialog drag, layout changes) re-fit the canvas.
watch(backing, () => paint());

onMounted(() => paint());

// Setting the backing store resets the context, so re-apply the
// dpr transform before every repaint.
function paint(): void {
    const c = canvas.value;
    if (c == null) {
        return;
    }
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (c.width !== backing.value || c.height !== backing.value) {
        c.width = backing.value;
        c.height = backing.value;
    }
    c.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(null);
}

onUnmounted(stopFrames);
</script>

<template>
    <section ref="canvasWrapper" class="bg-canvas-paper flex items-center justify-center">
        <canvas
            ref="canvas"
            class="max-w-full max-h-full aspect-square"
            role="img"
            aria-label="Stroke order diagram"
        />
        <Teleport :to="props.controlsEl" :disabled="props.controlsEl == null">
            <div class="flex gap-2 items-center px-2 py-1">
                <Button variant="outline" title="Restart" size="icon-sm" @click="restart"
                    ><mdi-icon :path="mdiRestart" /></Button
                >
                <Button
                    :variant="playing ? 'default' : 'outline'"
                    :title="playing ? 'Pause' : 'Play'"
                    size="icon-sm"
                    @click="play"
                    ><mdi-icon :path="playing ? mdiPause : mdiPlay" /></Button
                >
                <Button variant="outline" title="Stop" size="icon-sm" @click="stop"
                    ><mdi-icon :path="mdiStop" /></Button
                >
                <Button variant="outline" title="Previous stroke" size="icon-sm" @click="stepBack"
                    ><mdi-icon :path="mdiStepBackward" /></Button
                >
                <span class="text-xs text-muted-foreground tabular-nums">{{ counter }}</span>
                <Button variant="outline" title="Next stroke" size="icon-sm" @click="stepForward"
                    ><mdi-icon :path="mdiStepForward" /></Button
                >
                <label
                    class="text-xs text-muted-foreground grow flex items-center gap-1"
                    title="Playback speed"
                >
                    {{ speed }}×
                    <input
                        v-model.number="speed"
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        class="grow"
                    >
                </label>
            </div>
        </Teleport>
    </section>
</template>
