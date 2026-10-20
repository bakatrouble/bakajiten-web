<script setup lang="ts">
// Material Design icon from an @mdi/js path: currentColor fill,
// 24px grid, sized like the Qt-bundled SVGs.
defineProps<{ path: string }>();
</script>

<template>
    <svg viewBox="0 0 24 24" class="size-[1.4em]" fill="currentColor" aria-hidden="true">
        <path :d="path" />
    </svg>
</template>
