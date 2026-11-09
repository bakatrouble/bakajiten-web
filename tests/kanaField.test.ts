// Cursor-aware kana field traces (Qt KanaInput parity): conversion
// happens per keystroke on the run at the cursor, the buffer holds
// display-domain text and renders verbatim, and the run at the
// cursor (not the whole buffer) gates the modal.
import { describe, expect, it } from 'vitest';
import { useKanaField } from '../src/state/kanaField.ts';
import './fixtures.ts';

function endTyped(keys: string): { display: string; search: string; cursor: number } {
    const field = useKanaField(() => {});
    let cursor = 0;
    for (const k of [...keys]) {
        const at = field.typeKey(k, cursor);
        // Pure-romaji traces only use convertible keys: every
        // keystroke is handled.
        expect(at).not.toBeNull();
        cursor = at as number;
    }
    return { display: field.display.value, search: field.searchText.value, cursor };
}

describe('display traces', () => {
    const cases: [string, string][] = [
        ['s', 's'],
        ['sh', 'sh'],
        ['shi', 'し'],
        ['n', 'n'],
        ['na', 'な'],
        // A trailing n completing an nn pair commits instead of
        // staying raw. Incremental typing has no overlap lookahead:
        // the pair settles eagerly, so a following vowel starts a
        // fresh mora (nna → んあ keystroke-by-keystroke; batch
        // display("nna") still reads んな). Verified against both
        // incremental models via `fuzz-kana tprobe`.
        ['nn', 'ん'],
        ['nna', 'んあ'],
        ['tchi', 'っち'],
        ['shin', 'しn'],
        ['shina', 'しな'],
        ['katta', 'かった'],
        // Same eager-nn rule mid-word: typing konnichiwa settles ん
        // before the vowel lands (tprobe agrees on both sides).
        ['konnichiwa', 'こんいちわ'],
        ['xtsu', 'っ'],
        ['q', 'q'],
        ['qa', 'くぁ'],
        ['whi', 'うぃ'],
    ];
    for (const [keys, display] of cases) {
        it(`${keys} -> ${display}`, () => {
            expect(endTyped(keys).display).toBe(display);
        });
    }

    it("typing n' swallows the apostrophe while pending (Qt parity)", () => {
        // Batch still reads n' as ん at the query edge; the
        // keystroke never lands while the mora is live.
        const field = useKanaField(() => {});
        let cursor = field.typeKey('n', 0) as number;
        expect(field.display.value).toBe('n');
        const at = field.typeKey("'", cursor);
        expect(at).toBe(cursor);
        expect(field.display.value).toBe('n');
        cursor = at as number;
        void cursor;
    });

    it('mid-line n stays raw until a vowel settles it', () => {
        const field = useKanaField(() => {});
        let cursor = 0;
        for (const k of [...'aa']) {
            cursor = field.typeKey(k, cursor) as number;
        }
        expect(field.display.value).toBe('ああ');
        cursor = field.typeKey('n', 1) as number;
        expect(field.display.value).toBe('あnあ');
        expect(cursor).toBe(2);
        expect(field.pendingAt(cursor)).toBe(true);
        cursor = field.typeKey('a', cursor) as number;
        expect(field.display.value).toBe('あなあ');
        expect(cursor).toBe(2);
    });

    it('/ settles a pending run into ん・', () => {
        expect(endTyped('n/').display).toBe('ん・');
        expect(endTyped('a/a').display).toBe('あ・あ');
    });
});

describe('backspace', () => {
    it('deletes one whole display character', () => {
        const field = useKanaField(() => {});
        let cursor = 0;
        for (const k of [...'kata']) {
            cursor = field.typeKey(k, cursor) as number;
        }
        expect(field.display.value).toBe('かた');
        cursor = field.typeKey('Backspace', cursor) as number;
        expect(field.display.value).toBe('か');
        expect(cursor).toBe(1);
    });

    it('mid-line backspace deletes before the cursor', () => {
        const field = useKanaField(() => {});
        let cursor = 0;
        for (const k of [...'tana']) {
            cursor = field.typeKey(k, cursor) as number;
        }
        expect(field.display.value).toBe('たな');
        cursor = field.typeKey('k', 1) as number;
        expect(field.display.value).toBe('たkな');
        cursor = field.typeKey('a', cursor) as number;
        expect(field.display.value).toBe('たかな');
        expect(cursor).toBe(2);
        cursor = field.typeKey('Backspace', 1) as number;
        expect(field.display.value).toBe('かな');
        expect(cursor).toBe(0);
    });

    it('never un-converts a pending tail stepwise', () => {
        const field = useKanaField(() => {});
        let cursor = 0;
        for (const k of [...'shin']) {
            cursor = field.typeKey(k, cursor) as number;
        }
        expect(field.display.value).toBe('しn');
        cursor = field.typeKey('Backspace', cursor) as number;
        expect(field.display.value).toBe('し');
    });
});

describe('selection replace', () => {
    it('converts a replacement typed over select-all', () => {
        const field = useKanaField(() => {});
        let cursor = 0;
        for (const k of [...'taberu']) {
            cursor = field.typeKey(k, cursor) as number;
        }
        expect(field.display.value).toBe('たべる');
        expect(field.replaceSelection(0, 3, 'a')).toBe(1);
        expect(field.display.value).toBe('あ');
        expect(field.searchText.value).toBe('あ');
    });

    it('converts a mid-text replacement in place', () => {
        const field = useKanaField(() => {});
        let cursor = 0;
        for (const k of [...'taberu']) {
            cursor = field.typeKey(k, cursor) as number;
        }
        // Drop べ, convert k at the drop point; the tail never moves.
        expect(field.replaceSelection(1, 2, 'k')).toBe(2);
        expect(field.display.value).toBe('たkる');
        cursor = field.typeKey('a', 2) as number;
        expect(cursor).toBe(2);
        expect(field.display.value).toBe('たかる');
    });

    it('drops the range on backspace', () => {
        const field = useKanaField(() => {});
        let cursor = 0;
        for (const k of [...'kata']) {
            cursor = field.typeKey(k, cursor) as number;
        }
        expect(field.replaceSelection(0, 1, 'Backspace')).toBe(0);
        expect(field.display.value).toBe('た');
    });

    it('holds the modal gate while a mora is pending', () => {
        const field = useKanaField(() => {});
        const cursor = field.typeKey('s', 0) as number;
        expect(field.replaceSelection(0, 1, 'a')).toBeNull();
        expect(field.display.value).toBe('s');
        void cursor;
    });

    it('leaves other keys to native replacement', () => {
        const field = useKanaField(() => {});
        let cursor = 0;
        for (const k of [...'kata']) {
            cursor = field.typeKey(k, cursor) as number;
        }
        expect(field.replaceSelection(0, 1, ' ')).toBeNull();
        expect(field.display.value).toBe('かた');
    });
});

describe('modal gate', () => {
    it('swallows non-conversion keys while pending', () => {
        const field = useKanaField(() => {});
        const cursor = field.typeKey('s', 0) as number;
        expect(field.pendingAt(cursor)).toBe(true);
        expect(field.typeKey('ArrowLeft', cursor)).toBe(cursor);
        expect(field.typeKey(' ', cursor)).toBe(cursor);
        expect(field.display.value).toBe('s');
    });

    it('releases when the mora settles', () => {
        const field = useKanaField(() => {});
        let cursor = field.typeKey('s', 0) as number;
        cursor = field.typeKey('a', cursor) as number;
        expect(field.display.value).toBe('さ');
        expect(field.pendingAt(cursor)).toBe(false);
        expect(field.typeKey('ArrowLeft', cursor)).toBeNull();
    });

    it('ignores programmatic sets while a mora is pending', () => {
        const field = useKanaField(() => {});
        const cursor = field.typeKey('s', 0) as number;
        expect(field.pendingAt(cursor)).toBe(true);
        field.setText('abc');
        expect(field.display.value).toBe('s');
        field.setText('abc', true);
        expect(field.display.value).toBe('abc');
    });
});
