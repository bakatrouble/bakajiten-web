// Doc-table traces (docs/ime-conversion.md §4) through the kana
// field: display derivation, whole-character backspace, modal gate.
import { describe, expect, it } from 'vitest';
import { useKanaField } from '../src/state/kanaField.ts';
import './fixtures.ts';

function typed(keys: string): { display: string; search: string; pending: boolean } {
    const field = useKanaField(() => {});
    for (const k of keys === '<bs>' ? [] : [...keys]) {
        field.typeKey(k);
    }
    if (keys === '<bs>') {
        field.typeKey('Backspace');
    }
    return {
        display: field.display.value,
        search: field.searchText.value,
        pending: field.pending.value,
    };
}

describe('display traces', () => {
    const cases: [string, string][] = [
        ['s', 's'],
        ['sh', 'sh'],
        ['shi', 'し'],
        ['n', 'n'],
        ['na', 'な'],
        ['nn', 'んn'],
        ['nna', 'んな'],
        ['tchi', 'っち'],
        ['shin', 'しn'],
        ['shina', 'しな'],
        ['katta', 'かった'],
        ['konnichiwa', 'こんにちは'],
        ['xtsu', 'っ'],
        ["n'", 'ん'],
        ['q', 'q'],
    ];
    for (const [keys, display] of cases) {
        it(`${keys} -> ${display}`, () => {
            expect(typed(keys).display).toBe(display);
        });
    }
});

describe('backspace', () => {
    it('deletes one whole display character', () => {
        const field = useKanaField(() => {});
        for (const k of 'kata') {
            field.typeKey(k);
        }
        expect(field.display.value).toBe('かた');
        field.typeKey('Backspace');
        expect(field.display.value).toBe('か');
    });

    it('keeps the raw buffer convertible after backspace', () => {
        const field = useKanaField(() => {});
        for (const k of 'kata') {
            field.typeKey(k);
        }
        field.typeKey('Backspace');
        // The buffer stays romaji: typing on continues conversion.
        field.typeKey('t');
        expect(field.display.value).toBe('かt');
        expect(field.pending.value).toBe(true);
    });

    it('never un-converts a pending tail stepwise', () => {
        const field = useKanaField(() => {});
        for (const k of 'shin') {
            field.typeKey(k);
        }
        expect(field.display.value).toBe('しn');
        field.typeKey('Backspace');
        expect(field.display.value).toBe('し');
    });
});

describe('selection replace', () => {
    it('converts a replacement typed over select-all', () => {
        const field = useKanaField(() => {});
        for (const k of 'taberu') {
            field.typeKey(k);
        }
        expect(field.display.value).toBe('たべる');
        expect(field.replaceSelection(0, 3, 'a')).toBe(1);
        expect(field.display.value).toBe('あ');
        expect(field.searchText.value).toBe('あ');
    });

    it('converts a mid-text replacement at the buffer end', () => {
        const field = useKanaField(() => {});
        for (const k of 'taberu') {
            field.typeKey(k);
        }
        // Like the desktop: the range drops, the key converts as if
        // typed at the end, and the tail keeps converting there.
        expect(field.replaceSelection(1, 2, 'k')).toBe(3);
        expect(field.display.value).toBe('たるk');
        field.typeKey('a');
        expect(field.display.value).toBe('たるか');
    });

    it('drops the range on backspace', () => {
        const field = useKanaField(() => {});
        for (const k of 'kata') {
            field.typeKey(k);
        }
        expect(field.replaceSelection(0, 1, 'Backspace')).toBe(0);
        expect(field.display.value).toBe('た');
    });

    it('holds the modal gate while a mora is pending', () => {
        const field = useKanaField(() => {});
        field.typeKey('s');
        expect(field.replaceSelection(0, 1, 'a')).toBeNull();
        expect(field.display.value).toBe('s');
    });

    it('leaves other keys to native replacement', () => {
        const field = useKanaField(() => {});
        for (const k of 'kata') {
            field.typeKey(k);
        }
        expect(field.replaceSelection(0, 1, ' ')).toBeNull();
        expect(field.display.value).toBe('かた');
    });
});

describe('modal gate', () => {
    it('swallows non-conversion keys while pending', () => {
        const field = useKanaField(() => {});
        field.typeKey('s');
        expect(field.pending.value).toBe(true);
        expect(field.typeKey('ArrowLeft')).toBe(true);
        expect(field.typeKey(' ')).toBe(true);
        expect(field.display.value).toBe('s');
    });

    it('releases when the mora settles', () => {
        const field = useKanaField(() => {});
        field.typeKey('s');
        field.typeKey('a');
        expect(field.display.value).toBe('さ');
        expect(field.pending.value).toBe(false);
        expect(field.typeKey('ArrowLeft')).toBe(false);
    });

    it('ignores programmatic sets while a mora is pending', () => {
        const field = useKanaField(() => {});
        field.typeKey('s');
        expect(field.pending.value).toBe(true);
        field.setText('abc');
        expect(field.display.value).toBe('s');
        field.setText('abc', true);
        expect(field.display.value).toBe('あbc');
    });
});
