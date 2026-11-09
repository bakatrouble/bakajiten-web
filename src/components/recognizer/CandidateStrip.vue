<script setup lang="ts">
// Recognizer-bound candidate strip: store hits in, panel events
// out. Presentation lives in CandidateList (shared with the
// kanji dialog strips).
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useRecognizer } from '../../state/recognizer.ts';
import CandidateList from '../common/CandidateList.vue';

const emit = defineEmits<{
    insert: [ch: string];
    openKanji: [ch: string];
    tip: [ch: string, x: number, y: number];
    tipHide: [];
}>();

const recognizerStore = useRecognizer();
const { candidates } = storeToRefs(recognizerStore);

// Engine hypotheses arrive best-first: text plus score.
const items = computed(() => candidates.value.map((c) => ({ text: c.text, score: c.score })));
</script>

<template>
    <candidate-list
        :items="items"
        @insert="emit('insert', $event)"
        @open-kanji="emit('openKanji', $event)"
        @tip="(ch, x, y) => emit('tip', ch, x, y)"
        @tip-hide="emit('tipHide')"
    />
</template>
