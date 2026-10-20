<script setup lang="ts">
// Hover card: glyph left, meaning/ON/Kun table right. Positioned
// below-right of the cursor, clamped into the viewport.
import { computed, ref, watch } from 'vue';
import { backend } from '../../backend/Backend.ts';
import type { KanjiEntry } from '../../vendor/libdict/dict.ts';
import { Dict } from '../../vendor/libdict/dict.ts';
import Card from '../ui/card/Card.vue';
import CardContent from '../ui/card/CardContent.vue';

const props = defineProps<{ ch: string | null; x: number; y: number }>();

const info = ref<KanjiEntry | null>(null);

watch(
    () => props.ch,
    async (ch) => {
        info.value = null;
        if (ch == null) {
            return;
        }
        const b = await backend();
        info.value = b.kanji.lookup(ch);
    },
);

const x = computed(() => Math.min(props.x + 14, window.innerWidth - 260));
const y = computed(() => Math.min(props.y + 16, window.innerHeight - 140));
</script>

<template>
    <Card
        v-if="ch != null && info != null"
        class="fixed z-[60] max-w-64 pointer-events-none"
        :style="{ left: `${x}px`, top: `${y}px` }"
    >
        <CardContent class="flex gap-2 p-2 sm:p-2">
            <div class="text-5xl leading-none">{{ ch }}</div>
            <table class="text-xs">
                <tbody>
                    <tr>
                        <th class="pr-2 text-left text-muted-foreground">meaning</th>
                        <td>{{ info.meanings.slice(0, 3).join('; ') }}</td>
                    </tr>
                    <tr>
                        <th class="pr-2 text-left text-muted-foreground">ON</th>
                        <td>{{ info.on.join('、') }}</td>
                    </tr>
                    <tr>
                        <th class="pr-2 text-left text-muted-foreground">Kun</th>
                        <td>{{ info.kun.join('、') }}</td>
                    </tr>
                    <tr>
                        <th class="pr-2 text-left text-muted-foreground">strokes</th>
                        <td>{{ info.strokes }}</td>
                    </tr>
                    <tr v-if="info.radical != null">
                        <th class="pr-2 text-left text-muted-foreground">radical</th>
                        <td>{{ Dict.radicalGlyph(info.radical) }} ({{ info.radical }})</td>
                    </tr>
                    <tr v-if="info.grade != null">
                        <th class="pr-2 text-left text-muted-foreground">grade</th>
                        <td>{{ Dict.gradeKind(info.grade) }} {{ info.grade }}</td>
                    </tr>
                    <tr v-if="info.jlpt != null">
                        <th class="pr-2 text-left text-muted-foreground">JLPT</th>
                        <td>N{{ info.jlpt }}</td>
                    </tr>
                </tbody>
            </table>
        </CardContent>
    </Card>
</template>
