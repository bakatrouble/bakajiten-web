// Free-floating dialog geometry (drag by header, resize from
// the corner), persisted in settings and clamped on screen.
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useSettings } from '../state/settings.ts';

const MIN_W = 480;
const MIN_H = 320;

export function useDialogGeometry(fallback: { w: number; h: number; y: number }) {
    const { settings } = storeToRefs(useSettings());
    // Live values during a drag/resize; settings carry the rest.
    const dragPos = ref<{ x: number; y: number } | null>(null);
    const liveSize = ref<{ w: number; h: number } | null>(null);
    const saved = computed(() => settings.value.kanjiDialog);

    const box = computed(() => {
        const w = Math.max(MIN_W, liveSize.value?.w ?? saved.value?.w ?? fallback.w);
        const h = Math.max(MIN_H, liveSize.value?.h ?? saved.value?.h ?? fallback.h);
        return {
            x:
                dragPos.value?.x ??
                Math.min(
                    Math.max(0, saved.value?.x ?? window.innerWidth - w - 16),
                    Math.max(0, window.innerWidth - 80),
                ),
            y:
                dragPos.value?.y ??
                Math.min(
                    Math.max(0, saved.value?.y ?? fallback.y),
                    Math.max(0, window.innerHeight - 60),
                ),
            w,
            h,
        };
    });

    function commit(partial: { x: number; y: number } | { w: number; h: number }): void {
        const b = box.value;
        settings.value.kanjiDialog = {
            x: 'x' in partial ? Math.round(partial.x) : Math.round(b.x),
            y: 'y' in partial ? Math.round(partial.y) : Math.round(b.y),
            w: 'w' in partial ? Math.round(partial.w) : Math.round(b.w),
            h: 'h' in partial ? Math.round(partial.h) : Math.round(b.h),
        };
    }

    function startDrag(e: PointerEvent): void {
        if (e.button !== 0 || (e.target as Element | null)?.closest('button') != null) {
            return;
        }
        e.preventDefault();
        const startX = e.clientX - box.value.x;
        const startY = e.clientY - box.value.y;
        const move = (ev: PointerEvent): void => {
            dragPos.value = {
                x: Math.min(Math.max(0, ev.clientX - startX), Math.max(0, window.innerWidth - 80)),
                y: Math.min(Math.max(0, ev.clientY - startY), Math.max(0, window.innerHeight - 60)),
            };
        };
        const up = (): void => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (dragPos.value != null) {
                commit(dragPos.value);
                dragPos.value = null;
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    function startResize(e: PointerEvent): void {
        if (e.button !== 0) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const start = { w: box.value.w, h: box.value.h };
        const move = (ev: PointerEvent): void => {
            liveSize.value = {
                w: Math.max(MIN_W, start.w + (ev.clientX - startX)),
                h: Math.max(MIN_H, start.h + (ev.clientY - startY)),
            };
        };
        const up = (): void => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (liveSize.value != null) {
                commit(liveSize.value);
                liveSize.value = null;
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    /// Grow/shrink the persisted height (strip toggles), clamped
    /// to the viewport below the dialog top.
    function adjustHeight(delta: number): void {
        const b = box.value;
        const maxH = Math.max(MIN_H, window.innerHeight - b.y - 8);
        commit({
            w: b.w,
            h: Math.min(maxH, Math.max(MIN_H, Math.round(b.h + delta))),
        });
    }

    return { box, startDrag, startResize, adjustHeight };
}
