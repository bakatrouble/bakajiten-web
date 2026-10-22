<script setup lang="ts">
// Kanji detail table: every field always shown. Rows come
// preformatted from Rust (`lib/libdict kanji_details`), same table
// as Android/Qt; the web only lays them out.
import { computed } from 'vue';
import type { KanjiEntry } from '../../vendor/libdict/dict.ts';
import { Dict } from '../../vendor/libdict/dict.ts';
import KanjiInfoRow from './KanjiInfoRow.vue';

const props = defineProps<{ info: KanjiEntry }>();

const rows = computed(() => Dict.kanjiDetails(props.info));
</script>

<template>
    <section class="flex flex-col gap-3">
        <div>
            <table class="text-sm">
                <tbody>
                    <kanji-info-row
                        v-for="row in rows"
                        :key="row.key"
                        :label="row.label"
                        :value="row.value"
                    />
                </tbody>
            </table>
        </div>
    </section>
</template>
