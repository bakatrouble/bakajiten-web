<script setup lang="ts">
// Article pane: ruby heading, sense badges with description
// tooltips, clickable cross-references and alternate forms.
// Text selects natively; the furigana stays out of the heading
// selection. Senses without content never render.

import { XIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import {
    isCommonWord,
    isKanaEntry,
    numberedContentSenses,
    preferKeb,
    preferReb,
} from '../../backend/labels.ts';
import { useKanjiHover } from '../../state/kanjiHover.ts';
import { useSearch } from '../../state/search.ts';
import { useSettings } from '../../state/settings.ts';
import type { DictEntry } from '../../vendor/libdict/dict.ts';
import { Dict } from '../../vendor/libdict/dict.ts';
import MaterialSpinner from '../common/MaterialSpinner.vue';
import Badge from '../ui/badge/Badge.vue';
import Button from '../ui/button/Button.vue';
import RubyText from './RubyText.vue';
import SenseItem from './SenseItem.vue';

const props = defineProps<{ entry: DictEntry | null; status: string }>();
const emit = defineEmits<{
    close: [];
    search: [query: string];
    tip: [ch: string, x: number, y: number];
    tipHide: [];
    openKanji: [ch: string];
}>();

const kanjiHover = useKanjiHover();
const { query } = storeToRefs(useSearch());
const onMove = (e: MouseEvent): void => kanjiHover.onMove(e, emit);
const onLeave = (): void => kanjiHover.onLeave(emit);
const onDoubleClick = (e: MouseEvent): void => kanjiHover.onDoubleClick(e, emit);
const commonWord = computed(() => props.entry != null && isCommonWord(props.entry));
const kanaOnly = computed(() => props.entry != null && isKanaEntry(props.entry));
// Loading statuses end in …: show a spinner instead of the dots.
const isLoading = computed(() => props.status.endsWith('…'));
const loadingText = computed(() => (isLoading.value ? props.status.slice(0, -1) : props.status));
const heading = computed(() => (props.entry == null ? '' : preferKeb(props.entry, query.value)));

// Numbered, content-bearing senses (shared with the results
// table so both number identically).
const numberedSenses = computed(() =>
    props.entry == null ? [] : numberedContentSenses(props.entry),
);

const readingLine = computed(() => {
    if (props.entry == null) {
        return '';
    }
    const settings = storeToRefs(useSettings()).settings;
    const reading = preferReb(props.entry, query.value);
    const shown =
        settings.value.romaji === 'Hepburn' || settings.value.romaji === 'Kunrei'
            ? Dict.kanaToRomaji(reading, settings.value.romaji)
            : reading;
    const parts = props.entry.readings.map((r) => r.reb).filter((r) => r !== reading);
    return [shown, ...parts].join('、');
});

const otherForms = computed(() => {
    if (props.entry == null) {
        return [];
    }
    return [...new Set(props.entry.kanji.map((k) => k.keb))].filter((k) => k !== heading.value);
});

const otherReadings = computed(() => {
    if (props.entry == null) {
        return [];
    }
    const shown = preferReb(props.entry, query.value);
    return [...new Set(props.entry.readings.map((r) => r.reb))].filter((r) => r !== shown);
});
</script>

<template>
    <article
        v-if="entry != null"
        class="article px-4 py-3 overflow-y-auto cursor-text"
        @mousemove="onMove"
        @mouseleave="onLeave"
        @scroll="onLeave"
        @dblclick="onDoubleClick"
    >
        <header class="flex items-baseline gap-3 text-2xl" :class="{ 'opacity-60': kanaOnly }">
            <ruby-text :text="heading" :reading="entry.reading" />
            <span class="flex gap-1">
                <Badge v-if="entry.jlpt > 0" variant="outline">N{{ entry.jlpt }}</Badge>
                <Badge v-if="entry.isName" variant="outline">name</Badge>
                <Badge v-if="commonWord" variant="outline">common</Badge>
            </span>
            <span class="flex-1" />
            <Button
                variant="ghost"
                size="icon-sm"
                title="Close article"
                class="self-start"
                @click="emit('close')"
                ><XIcon /><span class="sr-only">Close article</span></Button
            >
        </header>
        <div class="text-primary mb-2">{{ readingLine }}</div>
        <ol class="m-0 pl-0 list-none flex flex-col gap-1.5">
            <sense-item
                v-for="row in numberedSenses"
                :key="row.n"
                :n="row.n"
                :sense="row.sense"
                @search="emit('search', $event)"
            />
        </ol>
        <div v-if="otherForms.length > 0" class="mt-2 text-muted-foreground">
            also:
            <Button
                v-for="f in otherForms"
                :key="f"
                variant="link"
                size="sm"
                class="px-1 underline cursor-pointer"
                @click="emit('search', f)"
                >{{
                    f
                }}</Button
            >
        </div>
        <div v-if="otherReadings.length > 0" class="mt-1 text-muted-foreground">
            readings:
            <Button
                v-for="r in otherReadings"
                :key="r"
                variant="link"
                size="sm"
                class="px-1 underline cursor-pointer"
                @click="emit('search', r)"
                >{{
                    r
                }}</Button
            >
        </div>
    </article>
    <p v-else class="p-4 text-muted-foreground flex items-center gap-2">
        <material-spinner v-if="isLoading" /><span>{{ loadingText }}</span>
    </p>
</template>
