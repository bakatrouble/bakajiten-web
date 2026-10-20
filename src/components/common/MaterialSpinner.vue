<script setup lang="ts">
// Material-style circular progress indicator for loading states
// (version checks, catalog fetches).
</script>

<template>
    <span class="mat-spinner" role="progressbar" aria-label="Loading" />
</template>

<style scoped>
.mat-spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    border-radius: 9999px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    animation: mat-spin 0.8s linear infinite;
    vertical-align: -0.125em;
}

@keyframes mat-spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
