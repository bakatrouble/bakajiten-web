// Sense display shaping, unified in Rust (`lib/libdict
// gloss/display.rs`, exposed over UniFFI): entity labels abbreviated
// (`&vt;` -> `vt`), deduplicated, with description tips. Names
// resolve the name-type table. This module keeps the web UI shapes
// plus pure rendering helpers (badge colors, HTML highlighting).
import { Dict, type DictEntry, type ShapedSense } from '../vendor/libdict/dict.ts';

export interface Tag {
    label: string;
    tip: string;
}

export type TagGroup = Tag[];

export interface SenseDisplay {
    pos: TagGroup;
    field: TagGroup;
    misc: TagGroup;
    glosses: string[];
    xref: string[];
    /** Antonyms. */
    ant: string[];
    /** Free-text notes. */
    info: string[];
    /** Source-language attestations. */
    sources: { lang: string; text: string }[];
    /** Kanji-form restrictions (stagk). */
    restrictedKanji: string[];
    /** Reading restrictions (stagr). */
    restrictedReading: string[];
    /** Usually written in kana alone (uk tag): badge reads "kana". */
    uk: boolean;
}

function toSenseDisplay(s: ShapedSense): SenseDisplay {
    const tag = (t: { label: string; tip: string }): Tag => ({ label: t.label, tip: t.tip });
    return {
        pos: s.pos.map(tag),
        field: s.field.map(tag),
        misc: s.misc.map(tag),
        glosses: [...s.glosses],
        xref: [...s.xref],
        ant: [...s.ant],
        info: [...s.info],
        sources: s.sources.map((x) => ({ lang: x.lang ?? '', text: x.text })),
        restrictedKanji: [...s.restrictedKanji],
        restrictedReading: [...s.restrictedReading],
        uk: s.uk,
    };
}

export function displaySenses(entry: DictEntry): SenseDisplay[] {
    return Dict.displaySenses(entry).map(toSenseDisplay);
}

export interface NumberedSense {
    sense: SenseDisplay;
    /** Original 1-based sense number (gaps stay visible). */
    n: number;
}

export function numberedContentSenses(
    entry: DictEntry,
    limit = Number.POSITIVE_INFINITY,
): NumberedSense[] {
    // Rust returns content senses already filtered and numbered;
    // take the leading slice (same as the old capped scan).
    return Dict.displaySenses(entry)
        .slice(0, limit)
        .map((s) => ({ n: s.n, sense: toSenseDisplay(s) }));
}

/** Entry is usually written in kana alone (first-sense uk tag). */
export function isKanaEntry(entry: DictEntry): boolean {
    return Dict.isKanaEntry(entry);
}

/** Drop a numeric ・n tail from cross-reference queries. */
export function queryFor(term: string): string {
    return Dict.queryFor(term);
}

/** Common-word badge: news/ichi priorities on any form. */
export function isCommonWord(entry: DictEntry): boolean {
    return Dict.isCommonWord(entry);
}

/** First gloss of the first sense (row preview). */
export function previewGloss(entry: DictEntry): string {
    return Dict.previewGloss(entry);
}

/** Badge ink: kana red, misc dimmed, pos green, field blue. */
export function badgeClass(badge: string, group: 'pos' | 'field' | 'misc'): string {
    if (badge === 'kana') {
        return 'text-destructive';
    }
    if (group === 'pos') {
        return 'text-emerald-600 dark:text-emerald-500';
    } else if (group === 'misc') {
        return 'text-muted-foreground';
    } else if (group === 'field') {
        return 'text-sky-600 dark:text-sky-400';
    }
    return '';
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Query-match span (accent, like the desktop match pen). */
export function highlightMatch(text: string, matched: string): string {
    const m = matched === '' ? null : Dict.matchRange(text, matched);
    if (m == null) {
        return escapeHtml(text);
    }
    return `${escapeHtml(text.slice(0, m.start))}<mark class="bg-transparent text-emerald-600 dark:text-emerald-500 font-semibold">${escapeHtml(matched.slice(0, m.len))}</mark>${escapeHtml(text.slice(m.start + m.len))}`;
}

/** Gloss text of one sense with the query-match span highlighted. */
export function senseGlossHtml(sense: SenseDisplay, matched: string): string {
    return highlightMatch(sense.glosses.join('; '), matched);
}

/** Heading form preferring the kanji spelling that contains the
 query; otherwise the first form. */
export function preferKeb(entry: DictEntry, query: string): string {
    return Dict.preferKeb(entry, query);
}

/** Reading preferring the spelling that contains the query;
 otherwise the first reading. */
export function preferReb(entry: DictEntry, query: string): string {
    return Dict.preferReb(entry, query);
}
