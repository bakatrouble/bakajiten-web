<script setup lang="ts">
// First-run consent flow: catalog check, per-file consent screen,
// confirmed download into IndexedDB. Emits loaded when the backend
// is ready (a warm cache loads without asking).
import { computed, onMounted, ref } from 'vue';
import {
    type CachePlan,
    checkCache,
    defaultDataBase,
    type FilePlan,
    type LoadProgress,
    OPTIONAL_FILES,
    REQUIRED_FILES,
    startLoad,
} from '../../backend/Backend.ts';
import MaterialSpinner from '../common/MaterialSpinner.vue';
import Button from '../ui/button/Button.vue';
import Card from '../ui/card/Card.vue';
import Progress from '../ui/progress/Progress.vue';

const emit = defineEmits<{ loaded: [] }>();

type Phase = 'checking' | 'prompt' | 'downloading';

const error = ref('');
const phase = ref<Phase>('checking');
const plan = ref<CachePlan | null>(null);
const files = ref<{ name: string; loaded: number; total: number }[]>([]);

const requiredFiles = computed<FilePlan[]>(
    () => plan.value?.files.filter((f) => REQUIRED_FILES.includes(f.name)) ?? [],
);
const optionalFiles = computed<FilePlan[]>(
    () => plan.value?.files.filter((f) => OPTIONAL_FILES.includes(f.name)) ?? [],
);

function formatMB(n: number): string {
    return n > 0 ? `≈${(n / 1048576).toFixed(0)} MB` : 'unknown size';
}

function runCheck(): void {
    error.value = '';
    files.value = [];
    plan.value = null;
    phase.value = 'checking';
    checkCache(defaultDataBase())
        .then((p) => {
            plan.value = p;
            if (!p.needsDownload) {
                download();
            } else {
                phase.value = 'prompt';
            }
        })
        .catch((e: unknown) => {
            phase.value = 'prompt';
            error.value = e instanceof Error ? e.message : String(e);
        });
}

function download(): void {
    if (plan.value == null) {
        return;
    }
    phase.value = 'downloading';
    error.value = '';
    const byFile = new Map<string, { name: string; loaded: number; total: number }>();
    startLoad(plan.value, (p: LoadProgress) => {
        byFile.set(p.file, { name: p.file, loaded: p.loaded, total: p.total });
        files.value = [...byFile.values()];
    })
        .then(() => emit('loaded'))
        .catch((e: unknown) => {
            phase.value = 'prompt';
            error.value = e instanceof Error ? e.message : String(e);
        });
}

onMounted(runCheck);

defineExpose({ recheck: runCheck });
</script>

<template>
    <div class="h-full flex items-center justify-center px-4">
        <Card class="w-full max-w-xl p-6">
            <h1 class="text-2xl mb-4">辞 Bakajiten</h1>
            <div v-if="phase === 'checking'" class="flex items-center gap-2">
                <material-spinner />
                <p class="text-muted-foreground">Checking cached dictionaries</p>
            </div>
            <div v-else-if="phase === 'prompt' && plan != null" class="flex flex-col gap-3">
                <p>
                    Dictionaries download <b>{{ formatMB(plan.totalGz) }}</b> ({{
                        formatMB(plan.totalSize)
                    }} unpacked) and are cached on this device.
                </p>
                <ul class="text-sm text-muted-foreground">
                    <li v-for="f in requiredFiles" :key="f.name">
                        {{ f.name }} — {{ f.cached ? 'cached' : formatMB(f.gz || f.size) }}
                    </li>
                    <li v-for="f in optionalFiles" :key="f.name">
                        {{ f.name }} — on demand ({{ formatMB(f.gz || f.size) }}), download it later
                        under Settings
                    </li>
                </ul>
                <div class="flex gap-2">
                    <Button :disabled="plan.totalGz === 0 && plan.needsDownload" @click="download"
                        >Download</Button
                    >
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
                <div v-if="files.length === 0" class="flex items-center gap-2">
                    <material-spinner />
                    <p class="text-muted-foreground">Loading dictionaries</p>
                </div>
                <div v-for="f in files" :key="f.name" class="flex items-center gap-2 my-2">
                    <span class="w-32 truncate">{{ f.name }}</span>
                    <Progress v-model="f.loaded" :max="f.total || 1" class="flex-1" />
                    <span class="w-12 text-right"
                        >{{ Math.round((f.loaded / Math.max(1, f.total)) * 100) }}%</span
                    >
                </div>
                <p v-if="error" class="text-destructive">{{ error }}</p>
            </div>
        </Card>
    </div>
</template>
