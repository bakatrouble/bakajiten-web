<script setup lang="ts">
// One tag group (sense.pos, sense.field, or sense.misc): pos/field
// green, misc dimmed, uk-derived "kana" red — each badge with its
// description tooltip.
import { badgeClass, type TagGroup } from '../../backend/labels.ts';
import { HOVER_SHOW_MS } from '../../state/kanjiHover.ts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip/index.ts';

defineProps<{
    tags: TagGroup;
    group: 'pos' | 'field' | 'misc';
}>();
</script>

<template>
    <TooltipProvider :delay-duration="HOVER_SHOW_MS">
        <Tooltip v-for="(t, i) in tags" :key="`${group}-${i}`">
            <TooltipTrigger as-child>
                <span class="text-xs mr-1.5 cursor-help" :class="badgeClass(t.label, group)">{{
                    t.label
                }}</span>
            </TooltipTrigger>
            <TooltipContent>{{ t.tip }}</TooltipContent>
        </Tooltip>
    </TooltipProvider>
</template>
