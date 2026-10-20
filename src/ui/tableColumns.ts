// Resizable table columns with persisted widths (VueUse
// localStorage). Live values track the drag; the store commits
// on pointer-up. The last column stays fluid.
import { useLocalStorage } from '@vueuse/core';
import { computed, ref } from 'vue';

export function useColumnWidths(key: string, c0: number, c1: number) {
    const colWidths = useLocalStorage(key, { c0, c1 });
    for (const k of ['c0', 'c1'] as const) {
        const v = colWidths.value[k];
        colWidths.value[k] =
            typeof v === 'number' && Number.isFinite(v)
                ? Math.min(600, Math.max(48, v))
                : k === 'c0'
                  ? c0
                  : c1;
    }
    const liveW = ref<{ c0: number | null; c1: number | null }>({ c0: null, c1: null });
    const w0 = computed(() => liveW.value.c0 ?? colWidths.value.c0);
    const w1 = computed(() => liveW.value.c1 ?? colWidths.value.c1);

    function startColResize(e: PointerEvent, col: 0 | 1): void {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const start = col === 0 ? w0.value : w1.value;
        const move = (ev: PointerEvent): void => {
            const w = Math.min(600, Math.max(48, start + (ev.clientX - startX)));
            if (col === 0) {
                liveW.value.c0 = w;
            } else {
                liveW.value.c1 = w;
            }
        };
        const up = (): void => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            const w = col === 0 ? liveW.value.c0 : liveW.value.c1;
            if (w != null) {
                colWidths.value[col === 0 ? 'c0' : 'c1'] = Math.round(w);
                if (col === 0) {
                    liveW.value.c0 = null;
                } else {
                    liveW.value.c1 = null;
                }
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    return { w0, w1, startColResize };
}
