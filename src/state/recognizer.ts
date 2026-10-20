// Handwriting panel state: stroke capture (unit space, quantized
// to pen 0–255 on send like the desktop), undo/redo, debounced
// recognition over the WASM bank.

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { backend } from '../backend/Backend.ts';
import type { Candidate } from '../vendor/librecognizer/recognizer.ts';
import { useSettings } from './settings.ts';

export interface Point {
    x: number;
    y: number;
}

// Desktop move threshold, compared in pen units.
export const MOVE_MIN = 1.2;

export const useRecognizer = defineStore('recognizer', () => {
    const strokes = ref<Point[][]>([]);
    const undone = ref<Point[][]>([]);
    const candidates = ref<Candidate[]>([]);
    const matchMs = ref(0);
    const templateCount = ref<bigint>(0n);
    const modelReady = ref(false);
    const open = ref(false);

    let timer: ReturnType<typeof setTimeout> | undefined;

    async function recognize(): Promise<void> {
        // Bare canvas: keep the strip empty instead of scoring the
        // empty input (kana toggle / undo-to-empty surface kana
        // hits for nothing drawn).
        if (strokes.value.length === 0) {
            candidates.value = [];
            matchMs.value = 0;
            return;
        }
        const b = await backend();
        const t0 = performance.now();
        const settings = useSettings();
        const kanaCandidates = settings.settings.kanaCandidates;
        // Pen space 0–255 integers, like the desktop recognizer input.
        const pen = strokes.value.map((s) =>
            s.map((p) => ({ x: Math.round(p.x * 255), y: Math.round(p.y * 255) })),
        );
        candidates.value = b.recognizer.recognize(pen, 20, kanaCandidates);
        matchMs.value = performance.now() - t0;
        templateCount.value = b.recognizer.templateCount();
    }

    function toggle(): void {
        open.value = !open.value;
    }

    function pushStroke(s: Point[]): void {
        if (s.length === 0) {
            return;
        }
        strokes.value.push(s);
        undone.value = [];
        schedule();
    }

    function undo(): void {
        const s = strokes.value.pop();
        if (s != null) {
            undone.value.push(s);
            schedule();
        }
    }

    function redo(): void {
        const s = undone.value.pop();
        if (s != null) {
            strokes.value.push(s);
            schedule();
        }
    }

    function clear(): void {
        strokes.value = [];
        undone.value = [];
        candidates.value = [];
    }

    function schedule(): void {
        globalThis.clearTimeout(timer);
        timer = globalThis.setTimeout(() => void recognize(), 60);
    }

    async function ensureModel(): Promise<void> {
        const b = await backend();
        modelReady.value = b.recognizer.templateCount() > 0n;
    }

    return {
        strokes,
        undone,
        candidates,
        matchMs,
        templateCount,
        modelReady,
        open,
        toggle,
        pushStroke,
        undo,
        redo,
        clear,
        schedule,
        ensureModel,
    };
});
