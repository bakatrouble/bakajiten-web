<script setup lang="ts">
// One article sense row: number, badges with description tips,
// glosses, kanji/reading restrictions, antonyms, cross-refs,
// notes, and loanword sources.
import type { SenseDisplay } from '../../backend/labels.ts';
import Button from '../ui/button/Button.vue';
import TagBadges from './TagBadges.vue';

defineProps<{ n: number; sense: SenseDisplay }>();
const emit = defineEmits<{ search: [query: string] }>();
</script>

<template>
    <li :data-sense="n">
        <span class="mr-1">{{ n }}.</span>
        <tag-badges :sense="sense" />
        <span>{{ sense.glosses.join('; ') }}</span>
        <span v-if="sense.restrictedKanji.length > 0" class="text-muted-foreground text-sm">
            (kanji only: {{ sense.restrictedKanji.join(', ') }})</span
        >
        <span v-if="sense.restrictedReading.length > 0" class="text-muted-foreground text-sm">
            (reading only: {{ sense.restrictedReading.join(', ') }})</span
        >
        <span v-if="sense.ant.length > 0" class="ml-2 text-muted-foreground text-sm">
            ×<Button
                v-for="a in sense.ant"
                :key="a"
                variant="link"
                size="sm"
                class="px-1 underline cursor-pointer"
                @click="emit('search', a)"
                >{{
                    a
                }}</Button
            >
        </span>
        <span v-if="sense.xref.length > 0" class="ml-2 text-muted-foreground">
            →<Button
                v-for="x in sense.xref"
                :key="x"
                variant="link"
                size="sm"
                class="px-1 underline cursor-pointer"
                @click="emit('search', x)"
                >{{
                    x
                }}</Button
            >
        </span>
        <div v-if="sense.info.length > 0" class="text-muted-foreground text-sm">
            {{ sense.info.join(' ') }}
        </div>
        <div v-if="sense.sources.length > 0" class="text-muted-foreground text-sm">
            <span v-for="(src, k) in sense.sources" :key="k" class="mr-2"
                >From {{ src.lang }}: {{ src.text }}</span
            >
        </div>
    </li>
</template>
