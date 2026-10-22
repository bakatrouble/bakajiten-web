<script setup lang="ts">
// First-run consent flow: catalog check, then the shared
// Dictionaries manager inline (per-file status, actions, and
// progress — no separate download screen). The bulk Download
// required button drives the manager's own bulk fetch; entry is
// an explicit Continue tap. Emits loaded when the backend is
// ready (a warm cache loads without asking).
import { computed, onMounted, ref } from 'vue';
import {
    type CachePlan,
    checkCache,
    defaultDataBase,
    REQUIRED_FILES,
    startLoad,
} from '../../backend/Backend.ts';
import MaterialSpinner from '../common/MaterialSpinner.vue';
import Button from '../ui/button/Button.vue';
import Card from '../ui/card/Card.vue';
import DictionaryManager from './DictionaryManager.vue';

const emit = defineEmits<{ loaded: [] }>();

const error = ref('');
const checking = ref(true);
const plan = ref<CachePlan | null>(null);
// Required set complete but the app stays put: entry is an
// explicit Continue tap, never automatic after a download.
const readyToEnter = ref(false);

const manager = ref<{
    downloadRequired: () => Promise<void>;
    isBusy: (name: string) => boolean;
} | null>(null);
const downloading = ref(false);
// Bulk download is pointless (and hidden) once required files are
// downloading or already in place.
const requiredBusy = computed(
    () => downloading.value || REQUIRED_FILES.some((n) => manager.value?.isBusy(n) ?? false),
);

async function downloadBulk(): Promise<void> {
    if (downloading.value) {
        return;
    }
    downloading.value = true;
    try {
        await manager.value?.downloadRequired();
    } finally {
        downloading.value = false;
    }
}

function formatMB(n: number): string {
    return n > 0 ? `≈${(n / 1048576).toFixed(0)} MB` : 'unknown size';
}

function runCheck(): void {
    error.value = '';
    plan.value = null;
    readyToEnter.value = false;
    checking.value = true;
    checkCache(defaultDataBase())
        .then((p) => {
            if (!p.needsDownload) {
                // Warm cache opens on its own (nothing downloaded).
                startLoad(p)
                    .then(() => emit('loaded'))
                    .catch((e: unknown) => {
                        plan.value = p;
                        checking.value = false;
                        error.value = e instanceof Error ? e.message : String(e);
                    });
            } else {
                plan.value = p;
                checking.value = false;
            }
        })
        .catch((e: unknown) => {
            checking.value = false;
            error.value = e instanceof Error ? e.message : String(e);
        });
}

onMounted(runCheck);

defineExpose({ recheck: runCheck });
</script>

<template>
    <div class="h-full flex items-center justify-center px-4 py-4">
        <Card class="w-full max-w-xl p-6 max-h-[80vh] flex flex-col overflow-hidden">
            <h1 class="text-2xl mb-4 shrink-0">辞 Bakajiten</h1>
            <div v-if="checking" class="flex items-center gap-2">
                <material-spinner />
                <p class="text-muted-foreground">Checking cached dictionaries</p>
            </div>
            <div v-else-if="plan != null" class="flex flex-col gap-3 min-h-0">
                <p>
                    Dictionaries download <b>{{ formatMB(plan.totalGz) }}</b> ({{
                        formatMB(plan.totalSize)
                    }} unpacked) and are cached on this device.
                </p>
                <div class="min-h-0 overflow-y-auto -mx-1 px-1">
                    <dictionary-manager
                        ref="manager"
                        :open="!checking"
                        :reload-on-required="false"
                        @complete="readyToEnter = true"
                    />
                </div>
                <div class="flex gap-2">
                    <Button
                        :disabled="
                            readyToEnter ||
                            requiredBusy ||
                            (plan.totalGz === 0 && plan.needsDownload)
                        "
                        :loading="downloading"
                        @click="downloadBulk"
                        >Download required</Button
                    >
                    <Button v-if="readyToEnter" @click="emit('loaded')">Continue</Button>
                </div>
                <p
                    v-if="plan.manifest == null && plan.needsDownload"
                    class="text-sm text-muted-foreground"
                >
                    Could not reach the dictionary catalog — check your connection and reload.
                    Developers: run
                    <code>pnpm fetch-data</code>
                    to serve it locally.
                </p>
                <p v-if="error" class="text-destructive">{{ error }}</p>
            </div>
            <div v-else>
                <p v-if="error" class="text-destructive">{{ error }}</p>
            </div>
        </Card>
    </div>
</template>
