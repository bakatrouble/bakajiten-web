// Persisted appearance + conversion preferences (localStorage).

import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { watch } from 'vue';

export type Theme = 'auto' | 'light' | 'dark';
export type RomajiStyle = 'Kana' | 'Hepburn' | 'Kunrei';
export type SearchBarPosition = 'top' | 'bottom';

export interface Settings {
    theme: Theme;
    scale: number;
    romaji: RomajiStyle;
    kanaCandidates: boolean;
    /** Search bar dock: top (default) or bottom. */
    searchBar: SearchBarPosition;
    /** Results pane width in percent (null = default 46). */
    resultsPct: number | null;
    /** Recognizer panel width in px (null = default 368). */
    panelWidthPx: number | null;
    /** Kanji dialog strips (all hidden by default, like Qt). */
    kanjiStrips: { similar: boolean; parts: boolean; partOf: boolean };
    /** Kanji dialog geometry (null = default right-side card). */
    kanjiDialog: { x: number; y: number; w: number; h: number } | null;
}

const KEY = 'bakajiten-web-settings';

const SCALE_MIN = 50;
const SCALE_MAX = 300;

function clampScale(n: unknown): number {
    return typeof n === 'number' && Number.isFinite(n)
        ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, n))
        : 100;
}

function clampPct(n: unknown): number | null {
    return typeof n === 'number' && Number.isFinite(n) && n >= 15 && n <= 85 ? n : null;
}

function clampPanel(n: unknown): number | null {
    return typeof n === 'number' && Number.isFinite(n) && n >= 280 && n <= 640 ? n : null;
}

function clampDialog(g: unknown): { x: number; y: number; w: number; h: number } | null {
    if (typeof g !== 'object' || g == null) {
        return null;
    }
    const { x, y, w, h } = g as Record<string, unknown>;
    if (![x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v))) {
        return null;
    }
    return {
        x: Math.max(0, Math.min(2000, x as number)),
        y: Math.max(0, Math.min(2000, y as number)),
        w: Math.min(900, Math.max(480, w as number)),
        h: Math.min(900, Math.max(320, h as number)),
    };
}

function defaults(): Settings {
    return {
        theme: 'auto',
        scale: 100,
        romaji: 'Hepburn',
        kanaCandidates: true,
        searchBar: 'top',
        resultsPct: null,
        panelWidthPx: null,
        kanjiStrips: { similar: false, parts: false, partOf: false },
        kanjiDialog: null,
    };
}

/// Validate a stored blob (shape drift resets to defaults field by
/// field); corrupt storage falls back wholesale.
function sanitize(raw: unknown): Settings {
    const fallback = defaults();
    try {
        const p = typeof raw === 'object' && raw != null ? (raw as Partial<Settings>) : fallback;
        return {
            theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'auto',
            scale: clampScale(p.scale),
            romaji: p.romaji === 'Kana' || p.romaji === 'Kunrei' ? p.romaji : 'Hepburn',
            kanaCandidates: p.kanaCandidates ?? true,
            searchBar: p.searchBar === 'bottom' ? 'bottom' : 'top',
            resultsPct: clampPct(p.resultsPct),
            panelWidthPx: clampPanel(p.panelWidthPx),
            kanjiStrips: {
                similar: p.kanjiStrips?.similar === true,
                parts: p.kanjiStrips?.parts === true,
                partOf: p.kanjiStrips?.partOf === true,
            },
            kanjiDialog: clampDialog(p.kanjiDialog),
        };
    } catch {
        return fallback;
    }
}

function isDark(s: Settings): boolean {
    return (
        s.theme === 'dark' ||
        (s.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
    );
}

function apply(s: Settings): void {
    // Nuxt UI keys its dark variants off the `.dark` class.
    document.documentElement.classList.toggle('dark', isDark(s));
    document.documentElement.style.colorScheme = isDark(s) ? 'dark' : 'light';
    document.documentElement.style.fontSize = `${(16 * s.scale) / 100}px`;
}

export const useSettings = defineStore('settings', () => {
    // useStorage persists (JSON) and reads the stored blob; sanitize
    // validates it back into shape on every launch.
    const settings = useStorage<Settings>(KEY, defaults());
    settings.value = sanitize(settings.value);
    apply(settings.value);

    // The store only applies; persistence is the storage ref's job.
    watch(
        settings,
        (s) => {
            apply(s);
        },
        { deep: true },
    );

    if (matchMedia('(prefers-color-scheme: dark)').addEventListener != null) {
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () =>
            apply(settings.value),
        );
    }

    return { settings };
});
