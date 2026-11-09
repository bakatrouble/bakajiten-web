// Handwriting panel state: stroke capture (unit space, quantized
// to pen 0–255 on send like the desktop recognizer input),
// undo/redo, debounced recognition over the installed model pack.
// The model is optional: dictionaries load without it, the panel
// offers an explicit download, and a warm converted bundle
// decodes with no network.

import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
    backend,
    downloadRecognizerPack,
    openCachedRecognizer,
    recognizerPackStatus,
    type LoadProgress,
} from '../backend/Backend.ts';
import type {
    Candidate,
    Recognizer,
    StrokePoint,
} from '../vendor/librecognizer/recognizer.ts';

export interface Point {
    x: number;
    y: number;
}

// Desktop move threshold, compared in pen units.
export const MOVE_MIN = 1.2;

export type ModelState = 'checking' | 'ready' | 'missing' | 'downloading' | 'error';

/** Shape-similar kanji for the kanji dialog's Similar strip:
 *  single-character, non-kana hypotheses excluding the character
 *  itself (the retired template bank matched kanji-only). Empty
 *  without strokes or when recognition fails. */
export function similarChars(
    recognizer: Recognizer,
    strokes: StrokePoint[][],
    exclude: string,
    cap = 12,
): string[] {
    if (strokes.length === 0 || strokes.every((s) => s.length === 0)) {
        return [];
    }
    let cands: Candidate[];
    try {
        cands = recognizer.recognize(strokes, cap * 2 + 4);
    } catch {
        return [];
    }
    const out: string[] = [];
    const seen = new Set<string>([exclude]);
    for (const c of cands) {
        if ([...c.text].length !== 1 || seen.has(c.text)) {
            continue;
        }
        // Kana hypotheses never fill a kanji-similar strip.
        const cp = c.text.codePointAt(0) ?? 0;
        if (cp >= 0x3040 && cp <= 0x30ff) {
            continue;
        }
        seen.add(c.text);
        out.push(c.text);
        if (out.length >= cap) {
            break;
        }
    }
    return out;
}

export const useRecognizer = defineStore('recognizer', () => {
    const strokes = ref<Point[][]>([]);
    const undone = ref<Point[][]>([]);
    const candidates = ref<Candidate[]>([]);
    const matchMs = ref(0);
    const model = ref<Recognizer | null>(null);
    const modelState = ref<ModelState>('checking');
    const modelNote = ref('');
    const packProgress = ref<LoadProgress | null>(null);
    const open = ref(false);

    let timer: ReturnType<typeof setTimeout> | undefined;

    async function recognize(): Promise<void> {
        // Bare canvas: keep the strip empty instead of scoring the
        // empty input. Without a model there is nothing to score —
        // the panel shows the install prompt instead.
        if (strokes.value.length === 0) {
            candidates.value = [];
            matchMs.value = 0;
            return;
        }
        const r = model.value;
        if (r == null) {
            candidates.value = [];
            matchMs.value = 0;
            return;
        }
        const t0 = performance.now();
        // Pen space 0–255 integers, like the desktop recognizer input.
        const pen = strokes.value.map((s) =>
            s.map((p) => ({ x: Math.round(p.x * 255), y: Math.round(p.y * 255) })),
        );
        try {
            candidates.value = r.recognize(pen, 20);
        } catch {
            // Failed decode keeps the ink and clears the strip.
            candidates.value = [];
        }
        matchMs.value = performance.now() - t0;
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

    /// Attach the warm converted bundle (no network); otherwise
    /// report the pack as missing so the panel offers the explicit
    /// install tap. Never downloads: installs start at
    /// downloadModel's explicit tap.
    async function ensureModel(): Promise<void> {
        if (model.value != null) {
            return;
        }
        modelState.value = 'checking';
        modelNote.value = '';
        const b = await backend();
        const found = await openCachedRecognizer();
        if (found != null) {
            model.value = found;
            b.recognizer = found;
            modelState.value = 'ready';
            return;
        }
        const status = await recognizerPackStatus();
        modelState.value = 'missing';
        modelNote.value = status.latestLine ?? '';
    }

    /// Explicit install tap: fetch the pack, verify, convert once,
    /// cache the bundle, and attach. Failures land on the panel as
    /// text; a failed update keeps any previous bundle untouched.
    async function downloadModel(): Promise<void> {
        if (modelState.value === 'downloading') {
            return;
        }
        modelState.value = 'downloading';
        modelNote.value = '';
        packProgress.value = null;
        try {
            const b = await backend();
            const r = await downloadRecognizerPack((p) => {
                packProgress.value = p;
            });
            model.value = r;
            b.recognizer = r;
            packProgress.value = null;
            modelState.value = 'ready';
            schedule();
        } catch (e) {
            packProgress.value = null;
            modelState.value = model.value != null ? 'ready' : 'error';
            if (model.value == null) {
                modelNote.value = e instanceof Error ? e.message : String(e);
            }
        }
    }

    return {
        strokes,
        undone,
        candidates,
        matchMs,
        model,
        modelState,
        modelNote,
        packProgress,
        open,
        toggle,
        pushStroke,
        undo,
        redo,
        clear,
        schedule,
        ensureModel,
        downloadModel,
    };
});
