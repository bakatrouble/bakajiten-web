<script setup lang="ts">
// Recognizer-bound candidate strip: store hits in, panel events
// out. Presentation lives in CandidateList (shared with the
// kanji dialog strips).
import { storeToRefs } from 'pinia';
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
</script>

<template>
    <candidate-list
        :items="candidates"
        @insert="emit('insert', $event)"
        @open-kanji="emit('openKanji', $event)"
        @tip="(ch, x, y) => emit('tip', ch, x, y)"
        @tip-hide="emit('tipHide')"
    />
</template>
