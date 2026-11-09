// Single color authority for the recognizer canvas and its edge
// fades, mirroring the desktop MaterialPalette split. All four
// inks live in the Tailwind theme (`--canvas-*` in theme.css, also
// exposed as `bg-canvas-*` utilities) and are read live so canvas
// follows the app theme; the constants below are fallback only.
import { computed, onMounted, onUnmounted, ref } from 'vue';

export interface CanvasTheme {
    paper: string;
    grid: string;
    ink: string;
    active: string;
}

const FALLBACK_LIGHT: CanvasTheme = {
    paper: '#fff',
    grid: '#ccc',
    ink: '#1565c0',
    active: '#ffc55e',
};

const FALLBACK_DARK: CanvasTheme = {
    paper: '#1f1f1f',
    grid: '#444',
    ink: '#7cc4ff',
    active: '#ffc55e',
};

export const CANVAS_LIGHT: CanvasTheme = { ...FALLBACK_LIGHT };
export const CANVAS_DARK: CanvasTheme = { ...FALLBACK_DARK };

/// Forced-colors (Windows high contrast) resolve the canvas to
/// system inks: the bitmap is not recolored by the OS, so author
/// colors would clash with the forced UI palette.
const FORCED_COLORS: CanvasTheme = {
    paper: 'Canvas',
    grid: 'GrayText',
    ink: 'CanvasText',
    active: 'Highlight',
};

function forcedColors(): CanvasTheme | null {
    try {
        return matchMedia('(forced-colors: active)').matches ? FORCED_COLORS : null;
    } catch {
        return null;
    }
}

function themeColors(): CanvasTheme | null {
    try {
        const css = getComputedStyle(document.documentElement);
        const get = (name: string): string => css.getPropertyValue(name).trim();
        const paper = get('--canvas-paper');
        const grid = get('--canvas-grid');
        const ink = get('--canvas-ink');
        const active = get('--canvas-active');
        if (paper === '' || grid === '' || ink === '' || active === '') {
            return null;
        }
        return { paper, grid, ink, active };
    } catch {
        return null;
    }
}

/// Canvas theme following the app theme (desktop: the canvas
/// surface is the only icons consumer, so it tracks the theme).
/// Values come from the Tailwind theme; the constants above are
/// fallback for contexts without CSS (tests, SSR). Forced-colors
/// wins over everything (see above).
export function useCanvasTheme() {
    const theme = ref<CanvasTheme>(FALLBACK_LIGHT);
    onMounted(() => {
        const sync = (): void => {
            const forced = forcedColors();
            if (forced != null) {
                theme.value = forced;
                return;
            }
            const dark = document.documentElement.classList.contains('dark');
            theme.value = themeColors() ?? (dark ? FALLBACK_DARK : FALLBACK_LIGHT);
        };
        sync();
        const classes = new MutationObserver(sync);
        classes.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });
        const media = matchMedia('(forced-colors: active)');
        const onMedia = (): void => sync();
        if (media.addEventListener != null) {
            media.addEventListener('change', onMedia);
        }
        onUnmounted(() => {
            classes.disconnect();
            if (media.removeEventListener != null) {
                media.removeEventListener('change', onMedia);
            }
        });
    });
    return computed(() => theme.value);
}
