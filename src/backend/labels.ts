// Sense display shaping, mirroring DictionaryModel::displaySenses:
// entity labels abbreviated (`&vt;` -> `vt`), deduplicated, with
// description tips. Name entries resolve the name-type table.
import { Dict, type DictEntry, type DictSense } from '../vendor/libdict/dict.ts';

export function abbreviate(label: string): string {
    if (label.startsWith('&') && label.endsWith(';')) {
        return label.slice(1, -1);
    }
    return label;
}

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

function collect(
    indices: Uint8Array,
    labelOf: (i: number) => string,
    tipOf: (i: number) => string,
): TagGroup {
    const tags: TagGroup = [];
    for (const tag of indices) {
        const label = abbreviate(labelOf(tag));
        if (label !== '' && !tags.some((t) => t.label === label)) {
            tags.push({ label, tip: tipOf(tag) });
        }
    }
    return tags;
}

export function displaySenses(entry: DictEntry): SenseDisplay[] {
    return entry.senses.map((s: DictSense) => {
        const pos = collect(
            s.pos,
            (i) => (entry.isName ? Dict.nameTypeLabel(i) : Dict.posLabel(i)),
            (i) => (entry.isName ? Dict.nameTypeDescription(i) : Dict.posDescription(i)),
        );
        const field = collect(s.field, Dict.fieldLabel, Dict.fieldDescription);
        const miscRaw = collect(s.misc, Dict.miscLabel, Dict.miscDescription);
        // The uk tag renders as a "kana" badge (its description stays).
        const uk = miscRaw.some((t) => t.label === 'uk');
        const misc: TagGroup = miscRaw.map((t) =>
            t.label === 'uk' ? { label: 'kana', tip: t.tip } : t,
        );
        const restrictedKanji = [...s.stagk];
        const restrictedReading = [...s.stagr];
        return {
            pos,
            field,
            misc,
            glosses: s.glosses,
            xref: s.xref,
            ant: s.ant,
            info: s.info,
            sources: s.sources.map((x) => ({ lang: x.lang ?? '', text: x.text })),
            restrictedKanji,
            restrictedReading,
            uk,
        };
    });
}

/** Entry is usually written in kana alone (first-sense uk tag). */
export function isKanaEntry(entry: DictEntry): boolean {
    return displaySenses(entry)[0]?.uk === true;
}

/** Drop a numeric ・n tail from cross-reference queries. */
export function queryFor(term: string): string {
    return term.replace(/・\d+$/, '');
}

/** Common-word badge: news/ichi priorities on any form. */
export function isCommonWord(entry: DictEntry): boolean {
    const prios = [
        ...entry.kanji.flatMap((k) => k.priorities),
        ...entry.readings.flatMap((r) => r.priorities),
    ];
    return prios.some((p) => p === 'news1' || p === 'news2' || p === 'ichi1' || p === 'ichi2');
}

/// One-line row preview: first gloss of the first sense.
export function previewGloss(entry: DictEntry): string {
    return entry.senses[0]?.glosses[0] ?? '';
}

/// Badge ink for the shared tag rendering (desktop MeaningBuilder
/// pens): uk-derived kana red, misc dimmed, pos green, field blue.
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

/// Gloss text of one sense with the query-match span highlighted.
export function senseGlossHtml(sense: SenseDisplay, matched: string): string {
    return highlightMatch(sense.glosses.join('; '), matched);
}

export interface NumberedSense {
    sense: SenseDisplay;
    /** Original 1-based sense number (gaps stay visible). */
    n: number;
}

/// Content-bearing senses with original numbering: skips empty
/// senses without renumbering the rest. Shared by the article
/// pane and the results table.
export function numberedContentSenses(
    entry: DictEntry,
    limit = Number.POSITIVE_INFINITY,
): NumberedSense[] {
    const out: NumberedSense[] = [];
    const senses = displaySenses(entry);
    for (let i = 0; i < senses.length && out.length < limit; i++) {
        const sense = senses[i];
        if (sense == null || (sense.glosses.length === 0 && sense.info.length === 0)) {
            continue;
        }
        out.push({ sense, n: i + 1 });
    }
    return out;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/// Query-match span (accent, like the desktop match pen).
/// Matches against the displayed text; the engine's `matched`
/// surface may live in the other column.
export function highlightMatch(text: string, matched: string): string {
    const at = matched === '' ? -1 : text.indexOf(matched);
    if (at < 0) {
        return escapeHtml(text);
    }
    return `${escapeHtml(text.slice(0, at))}<mark class="bg-transparent text-emerald-600 dark:text-emerald-500 font-semibold">${escapeHtml(matched)}</mark>${escapeHtml(text.slice(at + matched.length))}`;
}

/// Heading form preferring the kanji spelling that contains the
/// query (desktop heading rule); otherwise the first form.
export function preferKeb(entry: DictEntry, query: string): string {
    if (query !== '') {
        const hit = entry.kanji.find((k) => k.keb.includes(query));
        if (hit != null) {
            return hit.keb;
        }
    }
    return entry.heading;
}

/// Reading preferring the spelling that contains the query;
/// otherwise the first reading.
export function preferReb(entry: DictEntry, query: string): string {
    if (query !== '') {
        const hit = entry.readings.find((r) => r.reb.includes(query));
        if (hit != null) {
            return hit.reb;
        }
    }
    return entry.reading;
}
