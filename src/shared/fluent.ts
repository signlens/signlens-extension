// The interface's words (ADR-0015, phase 5): a message of the catalog
// (catalog.ts, compiled from locales/*/*.ftl by scripts/messages.ts) worded
// for a locale. Pure, so the Node tests run it; ui/localize.ts lays the
// words out in a page.

/**
 * One piece of a message's pattern as the catalog keeps it: text, which may
 * hold the inline markup the catalog allows; an argument; or a choice by an
 * argument, its plural category for a number, else its value, else `other`.
 */
export type Part =
    | string
    | { readonly arg: string }
    | { readonly select: string; readonly cases: Readonly<Record<string, Pattern>>; readonly other: string };
export type Pattern = readonly Part[];

/** A message: its value, and the attributes an element takes from it. */
export interface Entry {
    readonly value?: Pattern;
    readonly attributes?: Readonly<Record<string, Pattern>>;
}
export type Catalog = Readonly<Record<string, Entry>>;

/** An argument: words, a number (written as the locale writes numbers), or a node, which ui/localize.ts lays out where the argument stands. */
export type Value = string | number | Node;

/** A worded message: the pattern's text, markup and all, and the arguments as they were given. */
export type Piece = { readonly text: string } | { readonly value: Value };

/** The inline markup a message may carry: a few text-level elements, and a link the page names (`data-l10n-name`). */
export const MARKUP = /<(\/?)(strong|em|code|kbd|a)(?:\s+data-l10n-name="([a-z0-9-]+)")?\s*>/g;

/** `pattern` with `args` in its places, a choice resolved for `locale`; in Chinese, spaced where its words meet an argument. */
export function pieces(pattern: Pattern, args: Readonly<Record<string, Value>>, locale: string): Piece[] {
    const worded = placed(pattern, args, locale);
    return /^zh(-|$)/i.test(locale) ? spacedForChinese(worded, locale) : worded;
}

function placed(pattern: Pattern, args: Readonly<Record<string, Value>>, locale: string): Piece[] {
    const out: Piece[] = [];
    for (const part of pattern) {
        if (typeof part === 'string') out.push({ text: part });
        else if ('arg' in part) out.push({ value: args[part.arg] ?? `{${part.arg}}` });
        else out.push(...placed(choose(part, args[part.select], locale), args, locale));
    }
    return out;
}

/** A Chinese character. */
export const han = (c: string): boolean => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(c);
/** Full-width punctuation and forms, and the quotes, ellipsis and dash Chinese sets with them: they carry their own space. */
export const fullWidth = (c: string): boolean => /[\u3000-\u303f\uff00-\uffef\u2014\u2018\u2019\u201c\u201d\u2026]/u.test(c);
const latin = (c: string): boolean => !han(c) && !fullWidth(c) && !/\s/u.test(c);
/** Markup and spaces at the end of a text, and at its start. */
const END = /\s+((?:<[^<>]*>)*)$/u;
const START = /^((?:<[^<>]*>)*)\s+/u;

/**
 * Chinese as typeset where a message's words meet an argument, as the
 * engine sets it (ADR-0015, phase 4, D4): a translation cannot know
 * whether an argument holds a site, a number or Chinese words, so a space
 * goes where a Chinese character meets anything else but full-width
 * punctuation or a space (not after an opening bracket, nor before a
 * closing one), and none where Chinese or full-width punctuation meets
 * what wants no space, whatever space the translation put there. A joint
 * within the translation's own words is the translation's.
 */
export function spacedForChinese(worded: readonly Piece[], locale: string): Piece[] {
    const out: Piece[] = [];
    for (const piece of worded) {
        const before = out.at(-1);
        if (!before || ('text' in before && 'text' in piece)) {
            out.push(piece);
            continue;
        }
        const l = visible(before, locale).trimEnd().at(-1);
        const r = visible(piece, locale).trimStart().at(0);
        if (l === undefined || r === undefined) {
            out.push(piece);
            continue;
        }
        const wanted = (han(l) && latin(r) && !')]}>'.includes(r)) || (latin(l) && !'([{<'.includes(l) && han(r));
        if (!wanted && !han(l) && !fullWidth(l) && !han(r) && !fullWidth(r)) {
            out.push(piece);
            continue;
        }
        // The joint's spaces go, then one comes back where it is wanted.
        let left: Piece = 'text' in before ? { text: before.text.replace(END, '$1') } : before;
        let right: Piece = 'text' in piece ? { text: piece.text.replace(START, '$1') } : piece;
        const between: Piece[] = [];
        if (wanted) {
            if ('text' in right) right = { text: ` ${right.text}` };
            else if ('text' in left) left = { text: `${left.text} ` };
            else between.push({ text: ' ' });
        }
        out[out.length - 1] = left;
        out.push(...between, right);
    }
    return out;
}

/** What a piece shows, its markup left out. */
function visible(piece: Piece, locale: string): string {
    return 'text' in piece ? piece.text.replace(MARKUP, '') : shown(piece.value, locale);
}

/** The case a choice takes: a number's exact value, else its plural category; any other value as it is; else the default. */
function choose(part: Extract<Part, { select: string }>, value: Value | undefined, locale: string): Pattern {
    let key: string | undefined;
    if (typeof value === 'number') key = String(value) in part.cases ? String(value) : new Intl.PluralRules(locale).select(value);
    else if (typeof value === 'string') key = value;
    return (key !== undefined ? part.cases[key] : undefined) ?? part.cases[part.other] ?? [];
}

/** An argument as text: a number as `locale` writes it. */
export function shown(value: Value, locale: string): string {
    if (typeof value === 'number') return new Intl.NumberFormat(locale).format(value);
    if (typeof value === 'string') return value;
    return value.textContent ?? '';
}

/** The words alone, without their markup: for an attribute, a title, a status line. */
export function plain(worded: readonly Piece[], locale: string): string {
    return worded.map((piece) => ('text' in piece ? piece.text.replace(MARKUP, '') : shown(piece.value, locale))).join('');
}
