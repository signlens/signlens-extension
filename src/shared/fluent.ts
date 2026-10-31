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

/** `pattern` with `args` in its places, a choice resolved for `locale`. */
export function pieces(pattern: Pattern, args: Readonly<Record<string, Value>>, locale: string): Piece[] {
    const out: Piece[] = [];
    for (const part of pattern) {
        if (typeof part === 'string') out.push({ text: part });
        else if ('arg' in part) out.push({ value: args[part.arg] ?? `{${part.arg}}` });
        else out.push(...pieces(choose(part, args[part.select], locale), args, locale));
    }
    return out;
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
