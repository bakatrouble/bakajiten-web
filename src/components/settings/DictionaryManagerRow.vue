<script setup lang="ts">
// One dictionary-manager row: file name headline plus the action
// area, status/saved/latest subtitle lines, and the per-file
// progress bar. All presentation derives from the row view-model;
// transfers and deletes run through the emitted intents.
import { mdiDelete } from '@mdi/js';
import type { FileRow } from '../../state/dictionaries.ts';
import MdiIcon from '../common/MdiIcon.vue';
import Button from '../ui/button/Button.vue';
import Progress from '../ui/progress/Progress.vue';

defineProps<{ row: FileRow }>();
const emit = defineEmits<{
    download: [];
    remove: [];
    confirm: [];
    cancel: [];
}>();
</script>

<template>
    <div class="px-2 py-1.5 border-b border-border last:border-b-0">
        <div class="flex items-center gap-2">
            <span class="font-medium whitespace-nowrap">{{ row.name }}</span>
            <span class="flex-1" />
            <span class="inline-flex items-center gap-1 justify-end">
                <Button
                    v-if="row.actionEnabled"
                    variant="outline"
                    size="xs"
                    :disabled="row.busy"
                    :loading="row.loading"
                    @click="emit('download')"
                    >{{
                        row.actionLabel
                    }}</Button
                >
                <Button v-else variant="outline" size="xs" disabled>{{ row.actionLabel }}</Button>
                <template v-if="row.deletable">
                    <Button
                        v-if="!row.confirmArmed"
                        variant="outline"
                        size="icon-sm"
                        title="Delete"
                        :disabled="row.busy"
                        @click="emit('confirm')"
                        ><mdi-icon :path="mdiDelete" />
                        <span class="sr-only">Delete {{ row.name }}</span></Button
                    >
                    <template v-else>
                        <Button
                            variant="destructive"
                            size="xs"
                            :disabled="row.busy"
                            :loading="row.busy"
                            @click="emit('remove')"
                            >Remove?</Button
                        >
                        <Button
                            variant="ghost"
                            size="xs"
                            :disabled="row.busy"
                            @click="emit('cancel')"
                            >Keep</Button
                        >
                    </template>
                </template>
            </span>
        </div>
        <div class="text-sm text-muted-foreground">{{ row.statusWord }}</div>
        <div v-if="row.savedLine != null" class="text-sm text-muted-foreground">
            {{ row.savedLine }}
        </div>
        <div v-if="row.latestLine != null" class="text-sm text-muted-foreground">
            {{ row.latestLine }}
        </div>
        <div v-if="row.progress != null" class="flex items-center gap-2 mt-1">
            <Progress
                :model-value="row.progress.total > 0 ? Math.min(100, (row.progress.loaded / row.progress.total) * 100) : 0"
                class="flex-1"
            />
            <span class="w-12 text-right text-sm text-muted-foreground"
                >{{
                    Math.round((row.progress.loaded / Math.max(1, row.progress.total)) * 100)
                }}%</span
            >
        </div>
    </div>
</template>
