<script setup lang="ts">
// Kanji detail table: every field always shown, `-` when the
// source carries none (desktop KanjiDialog). Part strips live
// below the tabs as togglable candidate strips.
import { computed } from 'vue';
import type { KanjiEntry } from '../../vendor/libdict/dict.ts';
import { Dict } from '../../vendor/libdict/dict.ts';
import KanjiInfoRow from './KanjiInfoRow.vue';

const props = defineProps<{ info: KanjiEntry }>();

/// Qt `joinedOrDash`: comma-joined values or `-` when empty.
function dash(values: string[], sep = ', '): string {
    return values.length > 0 ? values.join(sep) : '-';
}

const codepoint = computed(() => {
    const cp = props.info.character.codePointAt(0) ?? 0;
    return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
});
const gradeText = computed(() => {
    const g = props.info.grade;
    if (g == null) {
        return '';
    }
    return `${Dict.gradeKind(g)} ${g}`;
});
const radicalText = computed(() => {
    const r = props.info.radical;
    return r == null ? '' : `${Dict.radicalGlyph(r)} (${r})`;
});
const skipText = computed(() => {
    const text = props.info.skip.join(', ');
    return props.info.skipMisgrade && text !== '' ? `${text} (miscount)` : text;
});
// Numbered pinyin from the source, marked like the desktop.
const chineseText = computed(() => dash(props.info.chinese.map((r) => Dict.pinyinMarked(r))));
</script>

<template>
    <section class="flex flex-col gap-3">
        <div>
            <table class="text-sm">
                <tbody>
                    <kanji-info-row label="Meaning" :value="dash(info.meanings, '; ')" />
                    <kanji-info-row label="ON" :value="dash(info.on, '、')" />
                    <kanji-info-row label="Kun" :value="dash(info.kun, '、')" />
                    <kanji-info-row label="Nanori" :value="dash(info.nanori, '、')" />
                    <kanji-info-row label="Chinese" :value="chineseText" />
                    <kanji-info-row label="Korean" :value="dash(info.korean)" />
                    <kanji-info-row label="Vietnamese" :value="dash(info.vietnamese)" />
                    <kanji-info-row label="Strokes" :value="String(info.strokes)" />
                    <kanji-info-row label="Grade" :value="gradeText === '' ? '-' : gradeText" />
                    <kanji-info-row
                        label="JLPT"
                        :value="info.jlpt == null ? '-' : `N${info.jlpt}`"
                    />
                    <kanji-info-row label="Frequency" :value="String(info.freq ?? '-')" />
                    <kanji-info-row
                        label="Radical"
                        :value="radicalText === '' ? '-' : radicalText"
                    />
                    <kanji-info-row label="Radical names" :value="dash(info.radNames)" />
                    <kanji-info-row label="Unicode" :value="codepoint" />
                    <kanji-info-row
                        label="JIS X0208"
                        :value="info.jis208 == null ? '-' : `${info.jis208.ku}-${info.jis208.ten}`"
                    />
                    <kanji-info-row label="JIS X0212" :value="dash(info.jis212)" />
                    <kanji-info-row label="JIS X0213" :value="dash(info.jis213)" />
                    <kanji-info-row label="JIS X0208 refs" :value="dash(info.jis208Refs)" />
                    <kanji-info-row label="SKIP" :value="skipText === '' ? '-' : skipText" />
                    <kanji-info-row label="Four corner" :value="dash(info.fourCorner)" />
                    <kanji-info-row label="De Roo" :value="dash(info.deroo)" />
                    <kanji-info-row label="SH" :value="dash(info.shDesc)" />
                    <kanji-info-row label="Nelson" :value="dash(info.nelsonC)" />
                    <kanji-info-row label="NJECD" :value="dash(info.njecd)" />
                    <kanji-info-row label="O'Neill" :value="dash(info.oneill)" />
                    <kanji-info-row label="De Roo refs" :value="dash(info.derooVariant)" />
                    <kanji-info-row label="SH refs" :value="dash(info.sH)" />
                </tbody>
            </table>
        </div>
    </section>
</template>
