<script setup lang="ts">
// One kanji detail table row: dim caption plus value run (the
// caller formats, `-` included — every field always shows).
defineProps<{ label: string; value: string }>();
</script>

<template>
    <tr>
        <th class="pr-2 text-left text-muted-foreground align-top">{{ label }}:</th>
        <td>{{ value }}</td>
    </tr>
</template>
