<script setup lang="ts">
// Results/article divider: drag resizes the results share,
// commits the persisted percent on release. The width pct is
// exposed so the list can track the live drag.
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useSettings } from '../../state/settings.ts';

const props = defineProps<{ container: HTMLElement | null }>();

const { settings } = storeToRefs(useSettings());
// Live drag value; null outside a drag (settings carry the rest).
const live = ref<number | null>(null);
const pct = computed(() => live.value ?? settings.value.resultsPct ?? 46);

function startDrag(e: PointerEvent): void {
    e.preventDefault();
    const el = props.container;
    if (el == null) {
        return;
    }
    const startX = e.clientX;
    const start = pct.value;
    const width = el.clientWidth;
    const move = (ev: PointerEvent): void => {
        live.value = Math.min(85, Math.max(15, start + ((ev.clientX - startX) / width) * 100));
    };
    const up = (): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (live.value != null) {
            settings.value.resultsPct = Math.round(live.value);
            live.value = null;
        }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
}

defineExpose({ pct });
</script>

<template>
    <div
        class="w-1.5 cursor-col-resize hover:bg-primary/30 shrink-0"
        title="Resize panes"
        @pointerdown="startDrag"
    />
</template>
