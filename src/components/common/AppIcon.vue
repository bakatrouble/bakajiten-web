<script setup lang="ts">
// Shared icon set, mirrored from the Qt frontend
// (frontends/qt/resources/icons/*.svg). All glyphs paint in
// currentColor, so they follow the theme like ButtonIcon re-tints.
import closeSvg from '../../assets/icons/close.svg?raw';
import dictionarySvg from '../../assets/icons/dictionary.svg?raw';
import eraseSvg from '../../assets/icons/erase.svg?raw';
import gridSvg from '../../assets/icons/grid.svg?raw';
import kanaSvg from '../../assets/icons/kana.svg?raw';
import kanaMatchSvg from '../../assets/icons/kana-match.svg?raw';
import latinSvg from '../../assets/icons/latin.svg?raw';
import penSvg from '../../assets/icons/pen.svg?raw';
import prefixSvg from '../../assets/icons/prefix.svg?raw';
import redoSvg from '../../assets/icons/redo.svg?raw';
import suffixSvg from '../../assets/icons/suffix.svg?raw';
import undoSvg from '../../assets/icons/undo.svg?raw';

const icons = {
    close: closeSvg,
    dictionary: dictionarySvg,
    erase: eraseSvg,
    grid: gridSvg,
    'kana-match': kanaMatchSvg,
    kana: kanaSvg,
    latin: latinSvg,
    pen: penSvg,
    prefix: prefixSvg,
    redo: redoSvg,
    suffix: suffixSvg,
    undo: undoSvg,
} as const;

export type IconName = keyof typeof icons;

defineProps<{ name: IconName }>();
</script>

<template>
    <span class="app-icon" v-html="icons[name]" />
</template>

<style scoped>
.app-icon {
    display: inline-flex;
}
/* v-html content carries no scope attribute: punch through. */
.app-icon :deep(svg) {
    width: 2em;
    height: 2em;
    display: block;
    flex: none;
}
</style>
