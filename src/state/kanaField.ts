// IME-style kana field: raw romaji buffer + derived display, with
// the desktop modal rule (docs/ime-conversion.md §3) — while a
// pending tail exists, only conversion keystrokes and backspace act;
// backspace deletes one whole display character and re-syncs raw.
import { computed, ref } from 'vue';
import { Dict } from '../vendor/libdict/dict.ts';

function isConversionKey(key: string): boolean {
    return key.length === 1 && /[a-zA-Z'-]/.test(key);
}

export function useKanaField(onCommit: (text: string) => void) {
    const raw = ref('');
    const enabled = ref(true);

    const display = computed(() => (enabled.value ? Dict.romajiDisplay(raw.value) : raw.value));
    const searchText = computed(() => (enabled.value ? Dict.romajiToKana(raw.value) : raw.value));
    const pending = computed(() => enabled.value && Dict.romajiHasPending(raw.value));

    function setEnabled(on: boolean): void {
        enabled.value = on;
    }

    function typeKey(key: string): boolean {
        if (!enabled.value) {
            return false;
        }
        if (pending.value && !isConversionKey(key) && key !== 'Backspace') {
            return true; // swallowed by the modal gate
        }
        if (key === 'Backspace') {
            // Delete the last display character whole: walk the raw
            // buffer back to the longest prefix that still renders the
            // truncated display. Never un-converts stepwise.
            const shown = [...display.value];
            shown.pop();
            const want = shown.join('');
            const text = raw.value;
            for (let i = text.length - 1; i >= 0; i--) {
                if (Dict.romajiDisplay(text.slice(0, i)) === want) {
                    raw.value = text.slice(0, i);
                    return true;
                }
            }
            raw.value = text.slice(0, -1);
            return true;
        }
        if (isConversionKey(key)) {
            raw.value += key.toLowerCase();
            return true;
        }
        return false;
    }

    // Selection replace (desktop parity): drop the range from the
    // buffer, then apply the key as if typed at the end — exactly
    // what the desktop does after deleting the selection. Backspace
    // drops the range. Returns the new cursor, or null when the key
    // isn't handled here (modal gate holds: other keys fall through
    // and go native, replacing the selection themselves).
    function replaceSelection(start: number, end: number, key: string): number | null {
        if (!enabled.value || pending.value) {
            return null;
        }
        const cur = display.value;
        if (key === 'Backspace') {
            raw.value = cur.slice(0, start) + cur.slice(end);
            return start;
        }
        if (isConversionKey(key)) {
            raw.value = cur.slice(0, start) + cur.slice(end) + key.toLowerCase();
            return display.value.length;
        }
        return null;
    }

    // Paste / IME / programmatic sets. While a partial mora is
    // pending the field is modal: only explicit replacements land.
    function setText(text: string, force = false): void {
        if (!force && pending.value) {
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
        pending,
        setEnabled,
        typeKey,
        setText,
        replaceSelection,
        clear,
        commit,
    };
}
