// IME-style kana field, Qt parity (KanaInput): the buffer holds
// display-domain text (converted kana plus the raw pending run at the
// cursor). Conversion happens per keystroke on the maximal trailing
// [a-zA-Z'-] run ending at the cursor — never on the whole buffer —
// and rendering shows the buffer verbatim (re-deriving it would commit
// a mid-line pending mora, since batch conversion always settles
// mid-string romaji). Backspace deletes one display character whole
// (UTF-16 unit, like the desktop) and never un-converts. While the run
// at the cursor is pending, only conversion keystrokes and backspace
// land; everything else falls through native. Clicks are left native
// (the desktop also blocks cursor moves while pending; the web field
// does not track them).
import { computed, ref } from 'vue';
import { Dict } from '../vendor/libdict/dict.ts';

function isConversionKey(key: string): boolean {
    // Qt parity (KanaInput::eventFilter): ASCII letters plus `-` and
    // `/`. `'` extends runs but is not itself convertible — typing it
    // while settled inserts it native; while pending it swallows.
    return key.length === 1 && /[a-zA-Z\-/]/.test(key);
}

function isRunChar(ch: string): boolean {
    // ASCII-only like the desktop (`c.unicode() < 128`): kana breaks
    // the run so a mid-line `n` stays raw instead of committing.
    return /^[A-Za-z'\-]$/.test(ch);
}

/// Trailing romaji-run start at or before `cursor` (UTF-16 units,
/// matching DOM selection offsets and the desktop cursor).
function runStart(text: string, cursor: number): number {
    let s = Math.max(0, Math.min(cursor, text.length));
    while (s > 0 && isRunChar(text[s - 1] ?? '')) {
        s -= 1;
    }
    return s;
}

export function useKanaField(onCommit: (text: string) => void) {
    // Display-domain buffer: converted text with the live romaji run
    // (if any) sitting raw at the composition point.
    const raw = ref('');
    const enabled = ref(true);

    // Verbatim render: conversion already happened per keystroke, so
    // re-deriving would wrongly commit a mid-line pending run.
    const display = computed(() => raw.value);
    const searchText = computed(() => (enabled.value ? Dict.romajiToKana(raw.value) : raw.value));

    // Pending run at the given cursor (UTF-16 units, clamped).
    function pendingAt(cursor: number): boolean {
        if (!enabled.value) {
            return false;
        }
        const text = raw.value;
        const c = Math.max(0, Math.min(cursor, text.length));
        const s = runStart(text, c);
        return s < c && Dict.romajiHasPending(text.slice(s, c));
    }

    function setEnabled(on: boolean): void {
        enabled.value = on;
    }

    // Convert one keystroke at the cursor. Returns the new cursor, or
    // null when the key isn't handled here (native default applies).
    function typeKey(key: string, cursor: number): number | null {
        if (!enabled.value) {
            return null;
        }
        const text = raw.value;
        const c = Math.max(0, Math.min(cursor, text.length));
        if (isConversionKey(key)) {
            const s = runStart(text, c);
            const run = text.slice(s, c) + key.toLowerCase();
            const conv = Dict.romajiDisplay(run);
            raw.value = text.slice(0, s) + conv + text.slice(c);
            return s + conv.length;
        }
        if (key === 'Backspace') {
            if (c <= 0) {
                return c;
            }
            raw.value = text.slice(0, c - 1) + text.slice(c);
            return c - 1;
        }
        // Modal gate: arrows, space, return and friends wait for the
        // mora to settle (or backspace); settled, they go native.
        return pendingAt(c) ? c : null;
    }

    // Selection replace (desktop parity): drop the range, then treat
    // the key as typed at the drop point. Backspace just drops.
    // Null when pending or unhandled (native takes over). The gate
    // checks both ends: with the range selected the desktop cursor
    // sits at one end of it, and a live run there stays modal.
    function replaceSelection(start: number, end: number, key: string): number | null {
        if (!enabled.value || pendingAt(start) || pendingAt(end)) {
            return null;
        }
        const cur = raw.value;
        if (key === 'Backspace') {
            raw.value = cur.slice(0, start) + cur.slice(end);
            return start;
        }
        if (isConversionKey(key)) {
            const dropped = cur.slice(0, start) + cur.slice(end);
            const s = runStart(dropped, start);
            const run = dropped.slice(s, start) + key.toLowerCase();
            const conv = Dict.romajiDisplay(run);
            raw.value = dropped.slice(0, s) + conv + dropped.slice(start);
            return s + conv.length;
        }
        return null;
    }

    // Paste / IME / mobile sets: stored literally (desktop parity —
    // conversion happens on the next keystroke or at search).
    // Swallowed while pending unless forced, as before.
    function setText(text: string, force = false, cursor = text.length): void {
        if (!force && pendingAt(cursor)) {
            return;
        }
        raw.value = text;
    }

    function clear(): void {
        raw.value = '';
    }

    function commit(): void {
        onCommit(searchText.value);
    }

    return {
        raw,
        display,
        searchText,
        pendingAt,
        setEnabled,
        typeKey,
        setText,
        replaceSelection,
        clear,
        commit,
    };
}
