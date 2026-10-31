// The interface's words for the reader (ADR-0015, phase 5): a message of
// the catalog in the interface's locale, else in English, the source.

import { type Args, CATALOGS } from './catalog.ts';
import { type Entry, pieces, plain, type Value } from './fluent.ts';

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

/** `id`'s words, without markup: for text set in code, a title, a status line. */
export function t<K extends Id>(id: K, ...args: ArgsOf<K>): string {
    const { entry, locale } = lookup(id);
    return plain(pieces(entry.value ?? [], argsOf(args), locale), locale);
}
