<script setup lang="ts">
// Sense-tag badges in desktop order (pos, field, misc), one group
// component per tag type. Used by the results table and the article
// so both render identically.
import type { SenseDisplay } from '../../backend/labels.ts';
import TagBadge from './TagBadge.vue';

defineProps<{ sense: Pick<SenseDisplay, 'pos' | 'field' | 'misc'> }>();
</script>

<template>
    <span class="tags">
        <tag-badge :tags="sense.pos" group="pos" />
        <tag-badge :tags="sense.field" group="field" />
        <tag-badge :tags="sense.misc" group="misc" />
    </span>
</template>
