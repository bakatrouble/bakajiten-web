// Exact kanji-under-cursor hit-testing via caret position (not
// element text scans): mousemove shows, leave/dblclick drive the
// tooltip and dialog. Surrogate-aware. One shared hover point:
// only one cursor exists, so the last hit is global.

import { defineStore } from 'pinia';
import { ref } from 'vue';

const KANJI = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u{20000}-\u{2ffff}]/u;

// Shared hover timing (desktop delay): cards show after this long,
// and linger this long after the cursor leaves.
export const HOVER_SHOW_MS = 200;
export const HOVER_HIDE_MS = 400;

export function kanjiAtPoint(x: number, y: number): string | null {
    let node: Node | null = null;
    let offset = 0;
    if (typeof document.caretRangeFromPoint === 'function') {
        const r = document.caretRangeFromPoint(x, y);
        if (r == null) {
            return null;
        }
        node = r.startContainer;
        offset = r.startOffset;
    } else {
        const pos = (
            document as unknown as {
                caretPositionFromPoint(
                    x: number,
                    y: number,
                ): { offsetNode: Node; offset: number } | null;
            }
        ).caretPositionFromPoint(x, y);
        if (pos == null) {
            return null;
        }
        node = pos.offsetNode;
        offset = pos.offset;
    }
    if (node == null || node.nodeType !== Node.TEXT_NODE) {
        return null;
    }
    const text = node.textContent ?? '';
    if (offset > text.length) {
        return null;
    }
    // Char starting at i, combining a surrogate pair when the caret
    // sits on (or between) its halves.
    const charAt = (i: number): string => {
        const c = text[i] ?? '';
        if (c >= '\ud800' && c <= '\udbff') {
            return c + (text[i + 1] ?? '');
        }
        return c;
    };
    let ch = charAt(offset);
    if (ch === '' && offset > 0) {
        // Caret snapped past a trailing (often single-char) node:
        // test the char before it, unwrapping a split surrogate pair.
        const prev = charAt(offset - 1);
        ch = prev >= '\udc00' && prev <= '\udfff' && offset >= 2 ? charAt(offset - 2) : prev;
    }
    return KANJI.test(ch) ? ch : null;
}

type TipEmit = {
    (e: 'tip', ch: string, x: number, y: number): void;
    (e: 'tipHide'): void;
};

export const useKanjiHover = defineStore('kanjiHover', () => {
    const last = ref<string | null>(null);

    function onMove(e: MouseEvent, emit: TipEmit): void {
        // Dragging selects text: no cards while buttons are down.
        if (e.buttons !== 0) {
            if (last.value != null) {
                last.value = null;
                emit('tipHide');
            }
            return;
        }
        const ch = kanjiAtPoint(e.clientX, e.clientY);
        if (ch !== last.value) {
            last.value = ch;
            if (ch == null) {
                emit('tipHide');
            } else {
                emit('tip', ch, e.clientX, e.clientY);
            }
        } else if (ch != null) {
            emit('tip', ch, e.clientX, e.clientY);
        }
    }

    function onLeave(emit: (e: 'tipHide') => void): void {
        last.value = null;
        emit('tipHide');
    }

    function onDoubleClick(e: MouseEvent, emit: (e: 'openKanji', ch: string) => void): void {
        const ch = kanjiAtPoint(e.clientX, e.clientY);
        if (ch != null) {
            emit('openKanji', ch);
        }
    }

    return { last, onMove, onLeave, onDoubleClick };
});
