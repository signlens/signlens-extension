// The interface's words for the reader (ADR-0015, phase 5): a message of
// the catalog in the interface's locale, else in English, the source.

import { type Args, CATALOGS } from './catalog.ts';
import { type Entry, pieces, plain, type Value } from './fluent.ts';
import type { Said } from './model.ts';

const SOURCE = 'en';
const current = SOURCE;

/** The locale the interface is worded in. */
export function interfaceLocale(): string {
    return current;
}

export type Id = keyof Args;
/** The arguments message `K` takes, if it takes any. */
export type ArgsOf<K extends Id> = Args[K] extends undefined ? [] : [Args[K]];

/** `id` in the interface's locale, else in English, with the locale it is in. */
export function lookup(id: Id): { entry: Entry; locale: string } {
    const own = CATALOGS[current]?.[id];
    if (own) return { entry: own, locale: current };
    return { entry: CATALOGS[SOURCE]?.[id] ?? {}, locale: SOURCE };
}

/** The arguments as the formatter takes them. */
export function argsOf(args: readonly unknown[]): Readonly<Record<string, Value>> {
    return (args[0] ?? {}) as Readonly<Record<string, Value>>;
}

/** `entry`'s words in `locale`, without markup. */
function worded(entry: Entry, args: Readonly<Record<string, Value>>, locale: string): string {
    return plain(pieces(entry.value ?? [], args, locale), locale);
}

/** `id`'s words, without markup: for text set in code, a title, a status line. */
export function t<K extends Id>(id: K, ...args: ArgsOf<K>): string {
    const { entry, locale } = lookup(id);
    return worded(entry, argsOf(args), locale);
}

/** `id`'s words in English, whatever the interface's locale: what a page is told, for its developers. */
export function english<K extends Id>(id: K, ...args: ArgsOf<K>): string {
    return worded(CATALOGS[SOURCE]?.[id] ?? {}, argsOf(args), SOURCE);
}

/** The arguments message `K` takes as storage keeps them: words and numbers, never a node. */
export type KeptArgsOf<K extends Id> = Args[K] extends undefined ? [] : [{ readonly [P in keyof Args[K]]: Exclude<Args[K][P], Node> }];

/** `id` with its arguments, kept to be worded when it is shown (`spoken`), in the interface's locale then. */
export function said<K extends Id>(id: K, ...args: KeptArgsOf<K>): Said {
    const [kept] = args;
    return kept ? { id, args: kept as NonNullable<Said['args']> } : { id };
}

/** `said` in the interface's locale: a message kept in storage, so looked up as it was kept; one this version does not have is its identifier. */
export function spoken(said: Said): string {
    const { entry, locale } = lookup(said.id);
    return entry.value ? worded(entry, said.args ?? {}, locale) : said.id;
}

/** `said` in English, whatever the interface's locale: what its page is told. */
export function inEnglish(said: Said): string {
    return worded(CATALOGS[SOURCE]?.[said.id] ?? {}, said.args ?? {}, SOURCE);
}
