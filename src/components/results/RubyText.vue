<script setup lang="ts">
// Heading with furigana: segment via WASM, paint ruby over kanji
// runs, plain text elsewhere.
import { computed } from 'vue';
import { Dict } from '../../vendor/libdict/dict.ts';

const props = defineProps<{ text: string; reading: string }>();

const spans = computed(
    () => Dict.furiganaSegment(props.text, props.reading) ?? [{ text: props.text, ruby: '' }],
);
</script>

<template>
    <span
        ><template v-for="(s, i) in spans" :key="i"
            ><ruby v-if="s.ruby !== ''">{{ s.text }}<rt>{{ s.ruby }}</rt></ruby
            ><span v-else>{{ s.text }}</span></template
        ></span
    >
</template>

<style scoped>
/* Furigana stays out of text selection: copying the headword
yields the kanji alone. */
ruby rt {
    user-select: none;
}
</style>
