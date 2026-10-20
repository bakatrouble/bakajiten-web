<script setup lang="ts">
// One dictionary-manager grid row: name, ellided version badge,
// cached/not-cached status badge (both tooltiped), and a caller
// action cell. The root is display:contents so the cells stay
// direct items of the parent grid.
import MaterialSpinner from '../common/MaterialSpinner.vue';
import Badge from '../ui/badge/Badge.vue';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip/index.ts';

defineProps<{
    name: string;
    /** Null while the catalog entry is still loading. */
    version: string | null;
    /** False while the cache plan is still loading. */
    statusKnown: boolean;
    cached: boolean;
    /** Rich status detail for the badge tooltip. */
    tip: string;
}>();
</script>

<template>
    <div class="contents">
        <div class="px-2 py-1 border-t border-border whitespace-nowrap">{{ name }}</div>
        <div class="px-2 py-1 border-t border-border">
            <material-spinner v-if="version == null" />
            <Tooltip v-else>
                <TooltipTrigger as-child>
                    <Badge variant="outline" class="max-w-36 truncate justify-start inline-block">{{
                        version
                    }}</Badge>
                </TooltipTrigger>
                <TooltipContent>{{ version }}</TooltipContent>
            </Tooltip>
        </div>
        <div class="px-2 py-1 border-t border-border">
            <material-spinner v-if="!statusKnown" />
            <Badge v-else :variant="cached ? 'secondary' : 'outline'">{{
                cached ? 'cached' : 'not cached'
            }}</Badge>
        </div>
        <div class="px-2 py-1 border-t border-border text-right">
            <slot name="action" />
        </div>
    </div>
</template>
