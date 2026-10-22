<script setup lang="ts">
// Settings: everything applies the moment it changes (persisted
// to localStorage by the store). Dictionary files are managed
// per-file below (download / update / delete).
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { version as APP_VERSION } from '../../../package.json';
import { dataCache } from '../../backend/idb.ts';
import { useSettings } from '../../state/settings.ts';
import MaterialSpinner from '../common/MaterialSpinner.vue';
import Button from '../ui/button/Button.vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog/index.ts';
import Label from '../ui/label/Label.vue';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select/index.ts';
import DictionaryManager from './DictionaryManager.vue';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ close: []; cleared: [] }>();

const { settings } = storeToRefs(useSettings());
const usage = ref(-1);

function refreshUsage(): void {
    dataCache()
        .usage()
        .then((n) => {
            usage.value = n;
        })
        .catch(() => {
            usage.value = -1;
        });
}

watch(
    () => props.show,
    (show) => {
        if (show) {
            refreshUsage();
        }
    },
);

async function clearCache(): Promise<void> {
    await dataCache().clear();
    usage.value = 0;
    emit('cleared');
}
const isOpen = computed({
    get: () => props.show,
    set: (v: boolean) => {
        if (!v) {
            emit('close');
        }
    },
});
// Selects bind strings; settings carry a number for scale.
const scale = computed({
    get: () => String(settings.value.scale),
    set: (v: string) => {
        settings.value.scale = Number(v);
    },
});
</script>

<template>
    <Dialog v-model:open="isOpen">
        <DialogContent class="sm:max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader class="shrink-0">
                <DialogTitle>Settings</DialogTitle>
            </DialogHeader>
            <div class="flex flex-col gap-4 min-h-0 overflow-y-auto">
                <div class="flex flex-col gap-1">
                    <Label>Theme</Label>
                    <Select v-model="settings.theme">
                        <SelectTrigger class="w-full max-w-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">auto</SelectItem>
                            <SelectItem value="light">light</SelectItem>
                            <SelectItem value="dark">dark</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div class="flex flex-col gap-1">
                    <Label>Interface scale (%)</Label>
                    <Select v-model="scale">
                        <SelectTrigger class="w-full max-w-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem
                                v-for="s in ['75', '100', '125', '150', '175', '200']"
                                :key="s"
                                :value="s"
                                >{{
                                    s
                                }}</SelectItem
                            >
                        </SelectContent>
                    </Select>
                </div>
                <div class="flex flex-col gap-1">
                    <Label>Reading display</Label>
                    <Select v-model="settings.romaji">
                        <SelectTrigger class="w-full max-w-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem
                                v-for="r in ['Kana', 'Hepburn', 'Kunrei']"
                                :key="r"
                                :value="r"
                                >{{
                                    r
                                }}</SelectItem
                            >
                        </SelectContent>
                    </Select>
                </div>
                <div class="flex flex-col gap-1">
                    <Label>Search bar position</Label>
                    <Select v-model="settings.searchBar">
                        <SelectTrigger class="w-full max-w-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="top">Top</SelectItem>
                            <SelectItem value="bottom">Bottom</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div class="flex flex-col gap-1">
                    <Label>App version</Label>
                    <span class="text-sm text-muted-foreground">v{{ APP_VERSION }}</span>
                </div>
                <dictionary-manager :open="props.show" @changed="refreshUsage" />
                <div class="flex flex-col gap-1">
                    <Label>Cached dictionaries</Label>
                    <div class="flex items-center gap-2">
                        <material-spinner v-if="usage < 0" />
                        <span v-else class="text-sm text-muted-foreground">{{
                            usage === 0 ? 'empty' : `≈${(usage / 1048576).toFixed(0)} MB`
                        }}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            :disabled="usage <= 0"
                            @click="clearCache"
                            >Clear</Button
                        >
                    </div>
                </div>
            </div>
        </DialogContent>
    </Dialog>
</template>
