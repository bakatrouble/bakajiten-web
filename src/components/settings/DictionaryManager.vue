<script setup lang="ts">
// Dictionary management: a sectioned list (Required, then
// Optional — Android structure). State and transfers live in the
// dictionaries store; this view only binds sections, rows, the
// Update-all bulk action, and host handoffs (complete/changed).
import { storeToRefs } from 'pinia';
import { watch } from 'vue';
import { useDictionaries } from '../../state/dictionaries.ts';
import Button from '../ui/button/Button.vue';
import DictionaryManagerRow from './DictionaryManagerRow.vue';

const props = defineProps<{ open: boolean; reloadOnRequired?: boolean }>();
const emit = defineEmits<{ complete: [] }>();

const store = useDictionaries();
const { error, outdatedNames } = storeToRefs(store);

function reloadBehavior(): boolean {
    return props.reloadOnRequired ?? true;
}

watch(
    () => props.open,
    (open) => {
        if (open) {
            store.onComplete = () => emit('complete');
            void store.refresh();
        }
    },
    { immediate: true },
);

defineExpose({
    downloadRequired: () => store.downloadRequired(reloadBehavior()),
    isBusy: (name: string) => store.isBusy(name),
});
</script>

<template>
    <div class="flex flex-col gap-1">
        <div class="border border-border rounded-lg overflow-hidden">
            <template v-for="section in store.sections" :key="section.title">
                <div
                    class="px-2 py-1 bg-muted text-muted-foreground text-sm font-medium border-b border-border"
                >
                    {{ section.title }}
                </div>
                <dictionary-manager-row
                    v-for="row in section.rows"
                    :key="row.name"
                    :row="row"
                    @download="store.downloadOne(row.name, reloadBehavior())"
                    @remove="store.removeFile(row.name)"
                    @confirm="store.confirmName = row.name"
                    @cancel="store.confirmName = null"
                />
            </template>
        </div>
        <div v-if="outdatedNames.length > 0" class="mt-1">
            <Button
                variant="outline"
                size="xs"
                :disabled="store.busy.size > 0"
                :loading="outdatedNames.some((n) => store.busy.has(n))"
                @click="store.updateAll(reloadBehavior())"
                >{{
                    store.updateAllLabel
                }}</Button
            >
        </div>
        <p v-if="error" class="text-sm text-destructive mt-1">{{ error }}</p>
    </div>
</template>
