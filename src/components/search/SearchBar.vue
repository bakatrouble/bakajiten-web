<script setup lang="ts">
// Search field with IME-style kana conversion: romaji keystrokes
// convert live (WASM), the query follows the converted text.
// Half-typed morae never query (pending gate); the meaning switch
// clears the field, affix toggles re-search in place, scope
// switches park it.

import { mdiCog } from '@mdi/js';
import { storeToRefs } from 'pinia';
import { computed, nextTick, onMounted, ref } from 'vue';
import { useMediaQuery, onClickOutside } from '@vueuse/core';
import { useSettings } from '../../state/settings.ts';
import { SCOPE_FILE, type ScopeName } from '../../backend/Backend.ts';
import { useKanaField } from '../../state/kanaField.ts';
import { useRecognizer } from '../../state/recognizer.ts';
import { useSearch } from '../../state/search.ts';
import AppIcon from '../common/AppIcon.vue';
import MdiIcon from '../common/MdiIcon.vue';
import Button from '../ui/button/Button.vue';
import Input from '../ui/input/Input.vue';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select/index.ts';

const searchStore = useSearch();
const { prefix, suffix, scope, meaning, query, scopeReady } = storeToRefs(searchStore);
const { searchNow, searchDebounced, setScope, setMeaning } = searchStore;
const recognizer = useRecognizer();
const { open: recognizerOpen } = storeToRefs(recognizer);
const input = ref<unknown>(null);
const toggleBtn = ref<unknown>(null);
// Narrow screens collapse the mode controls into the ⋮ menu
// (Android pattern); the field and the pen stay put.
const isNarrow = useMediaQuery('(max-width: 639px)');
const menuOpen = ref(false);
const menuWrap = ref<HTMLElement | null>(null);
onClickOutside(menuWrap, () => {
    menuOpen.value = false;
});
// Popups anchored to this row open upward when the bar docks at
// the bottom (menu panel, scope dropdowns).
const { settings: appSettings } = storeToRefs(useSettings());
const barBottom = computed(() => appSettings.value.searchBar === 'bottom');

const field = useKanaField((text) => searchNow(text));

const emit = defineEmits<{ openSettings: [] }>();

const scopeItems = computed(() =>
    (Object.keys(SCOPE_FILE) as ScopeName[]).map((value) => ({
        label: value === 'english' ? 'English' : value === 'names' ? 'Names' : 'Kokugo',
        value,
        // Missing files stay disabled until downloaded (Settings →
        // Dictionaries); English always ships with the load.
        disabled: !scopeReady.value[value],
    })),
);
const scopeModel = computed({
    get: () => scope.value,
    set: (v: ScopeName) => {
        void onScope(v);
    },
});

function maybeSearch(): void {
    // Pending morae stay display-only until they resolve.
    if (!field.pending.value) {
        searchDebounced(field.searchText.value);
    }
}

function onKey(e: KeyboardEvent): void {
    // Shortcuts go native (select-all, paste, ...): conversion only
    // ever handles bare keystrokes, like the desktop modifier guard.
    if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        field.commit();
        return;
    }
    if (e.key === 'Escape') {
        field.clear();
        searchNow('');
        return;
    }
    // Selection replace runs before conversion: spliced keys land
    // where the selection was (cursor restored after render).
    const el = nativeInput();
    if (
        el?.selectionStart != null &&
        el.selectionEnd != null &&
        el.selectionEnd > el.selectionStart
    ) {
        const at = field.replaceSelection(el.selectionStart, el.selectionEnd, e.key);
        if (at != null) {
            e.preventDefault();
            nextTick(() => {
                el.focus();
                el.setSelectionRange(at, at);
            });
            maybeSearch();
            return;
        }
    }
    if (field.typeKey(e.key)) {
        e.preventDefault();
        maybeSearch();
    }
    // Printable input elsewhere re-targets here (type-to-search).
}

function onInput(value: string | number): void {
    // Paste / IME / mobile: take the field text as the new buffer,
    // unless a partial mora holds the modal gate.
    const text = String(value);
    if (text !== field.display.value) {
        field.setText(text);
        maybeSearch();
    }
}

async function onScope(v: ScopeName): Promise<void> {
    // The select snaps back on its own: scope only changes on a
    // successful load, missing files revert the switch.
    menuOpen.value = false;
    await setScope(v);
}

function togglePrefix(): void {
    prefix.value = !prefix.value;
    onMode();
}

function toggleSuffix(): void {
    suffix.value = !suffix.value;
    onMode();
}

function onMode(): void {
    // Affix switches only change the search mode: the query carries
    // over and re-searches (only the meaning switch clears).
    menuOpen.value = false;
    searchNow(field.searchText.value);
}

function setTarget(toMeaning: boolean): void {
    if (meaning.value === toMeaning) {
        return;
    }
    menuOpen.value = false;
    setMeaning(toMeaning);
    field.setEnabled(!toMeaning);
    field.clear();
    searchNow('');
}

function focus(): void {
    const el = (input.value as unknown as { $el?: HTMLElement })?.$el ?? (input.value as unknown);
    if (el instanceof HTMLInputElement) {
        el.focus();
    }
}

function nativeInput(): HTMLInputElement | null {
    const el = (input.value as unknown as { $el?: HTMLElement })?.$el ?? (input.value as unknown);
    return el instanceof HTMLInputElement ? el : null;
}

function buttonRect(): DOMRect | null {
    const el = (toggleBtn.value as unknown as { $el?: HTMLElement })?.$el;
    return el?.getBoundingClientRect() ?? null;
}

// Insert at the cursor like the desktop submit: splice the display
// text, replace the buffer outright, and search immediately.
function insertChar(ch: string): void {
    const el = nativeInput();
    if (el == null) {
        field.setText(ch, true);
        searchNow(field.searchText.value);
        return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = `${el.value.slice(0, start)}${ch}${el.value.slice(end)}`;
    field.setText(next, true);
    searchNow(field.searchText.value);
    nextTick(() => {
        el.focus();
        const pos = start + ch.length;
        el.setSelectionRange(pos, pos);
    });
}

onMounted(() => {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            focus();
        }
    });
});

defineExpose({
    focus,
    setQuery: (t: string) => field.setText(t, true),
    insertChar,
    buttonRect,
    query,
});
</script>

<template>
    <div class="flex items-center gap-2">
        <!-- Narrow screens collapse the mode controls into the ⋮
            menu (Android pattern, icons-only); the ⋮ sits rightmost.
            Single render branch per width, so control state never
            duplicates. -->
        <template v-if="!isNarrow">
            <Button
                :variant="suffix ? 'default' : 'ghost'"
                title="Suffix match"
                class="w-10 h-10"
                @click="toggleSuffix"
                ><app-icon name="suffix" /></Button
            >
            <Button
                :variant="prefix ? 'default' : 'ghost'"
                title="Prefix match"
                class="w-10 h-10"
                @click="togglePrefix"
                ><app-icon name="prefix" /></Button
            >
        </template>
        <Button
            ref="toggleBtn"
            :variant="recognizerOpen ? 'default' : 'ghost'"
            title="Handwriting"
            class="w-10 h-10"
            data-recognizer-toggle
            @click="recognizer.toggle()"
            ><app-icon name="pen" /></Button
        >
        <Input
            ref="input"
            :model-value="field.display.value"
            placeholder="Search Japanese…"
            autocomplete="off"
            :spellcheck="false"
            class="flex-1"
            @keydown="onKey"
            @update:model-value="onInput"
        />
        <template v-if="!isNarrow">
            <Button
                :variant="!meaning ? 'default' : 'ghost'"
                title="Japanese (dictionary order)"
                class="w-10 h-10"
                @click="setTarget(false)"
                ><app-icon name="kana" /></Button
            >
            <Button
                :variant="meaning ? 'default' : 'ghost'"
                title="Meaning (English gloss)"
                class="w-10 h-10"
                @click="setTarget(true)"
                ><app-icon name="latin" /></Button
            >
            <Select v-model="scopeModel">
                <SelectTrigger class="w-28">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent
                    :position="barBottom ? 'popper' : 'item-aligned'"
                    :side="barBottom ? 'top' : 'bottom'"
                >
                    <SelectItem
                        v-for="o in scopeItems"
                        :key="o.value"
                        :value="o.value"
                        :disabled="o.disabled"
                        >{{
                            o.label
                        }}</SelectItem
                    >
                </SelectContent>
            </Select>
        </template>
        <div v-else ref="menuWrap" class="relative">
            <Button
                variant="ghost"
                title="Search options"
                class="w-10 h-10"
                @click="menuOpen = !menuOpen"
                ><app-icon name="menu"
            /></Button>
            <div
                v-if="menuOpen"
                role="menu"
                :class="barBottom ? 'bottom-12' : 'top-12'"
                class="absolute right-0 z-30 w-auto rounded-md border border-border bg-popover p-2 shadow-md"
            >
                <div class="grid grid-cols-[repeat(4,2.5rem)] gap-1">
                    <Button
                        :variant="suffix ? 'default' : 'ghost'"
                        title="Suffix match"
                        class="w-10 h-10"
                        @click="toggleSuffix"
                        ><app-icon name="suffix" /></Button
                    >
                    <Button
                        :variant="prefix ? 'default' : 'ghost'"
                        title="Prefix match"
                        class="w-10 h-10"
                        @click="togglePrefix"
                        ><app-icon name="prefix" /></Button
                    >
                    <Button
                        :variant="!meaning ? 'default' : 'ghost'"
                        title="Japanese (dictionary order)"
                        class="w-10 h-10"
                        @click="setTarget(false)"
                        ><app-icon name="kana" /></Button
                    >
                    <Button
                        :variant="meaning ? 'default' : 'ghost'"
                        title="Meaning (English gloss)"
                        class="w-10 h-10"
                        @click="setTarget(true)"
                        ><app-icon name="latin" /></Button
                    >
                </div>
                <div class="my-1 border-t border-border" />
                <Select v-model="scopeModel">
                    <SelectTrigger class="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                        :position="barBottom ? 'popper' : 'item-aligned'"
                        :side="barBottom ? 'top' : 'bottom'"
                    >
                        <SelectItem
                            v-for="o in scopeItems"
                            :key="o.value"
                            :value="o.value"
                            :disabled="o.disabled"
                            >{{
                                o.label
                            }}</SelectItem
                        >
                    </SelectContent>
                </Select>
                <div class="my-1 border-t border-border" />
                <Button
                    variant="ghost"
                    title="Settings"
                    class="w-full justify-start gap-2"
                    @click="emit('openSettings'); menuOpen = false"
                    ><mdi-icon :path="mdiCog" />Settings</Button
                >
            </div>
        </div>
    </div>
</template>
