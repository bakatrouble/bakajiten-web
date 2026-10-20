<script setup lang="ts">
// One togglable candidate strip for the kanji dialog (Similar /
// Parts / Part of): checkbox header over the shared candidate
// list; single click navigates to the kanji.
import { useId } from 'vue';
import CandidateList, { type StripItem } from '../common/CandidateList.vue';
import Checkbox from '../ui/checkbox/Checkbox.vue';
import Label from '../ui/label/Label.vue';

const open = defineModel<boolean>('open', { required: true });
defineProps<{ title: string; items: StripItem[] }>();

function setOpen(v: boolean | 'indeterminate'): void {
    if (v !== 'indeterminate') {
        open.value = v;
    }
}
// Native label activation (unlike nesting) forwards text clicks
// to the button control — reka's Label adds no forwarding.
const boxId = useId();
const emit = defineEmits<{
    navigate: [ch: string];
    tip: [ch: string, x: number, y: number];
    tipHide: [];
}>();
</script>

<template>
    <div class="shrink-0">
        <div class="flex items-center gap-1.5">
            <Checkbox :id="boxId" :model-value="open" @update:model-value="setOpen" />
            <Label :for="boxId" class="text-sm cursor-pointer">{{ title }}</Label>
        </div>
        <candidate-list
            v-if="open"
            :items="items"
            @insert="(ch) => emit('navigate', ch)"
            @open-kanji="(ch) => emit('navigate', ch)"
            @tip="(ch, x, y) => emit('tip', ch, x, y)"
            @tip-hide="emit('tipHide')"
        />
    </div>
</template>
