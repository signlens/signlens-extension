// The interface's words for the reader (ADR-0015, phase 5): a message of
// the catalog in the interface's locale, else in English, the source.

import { type Args, CATALOGS } from './catalog.ts';
import { type Entry, pieces, plain, type Value } from './fluent.ts';
import type { Said } from './model.ts';

const SOURCE = 'en';
/** The pseudo-locales, which only their own tag asks for. */
const PSEUDO = new Set(['en-XA']);

/** The locales the interface is worded in: English, and each with a message (a locale with none reviewed yet is not offered). */
function offered(): string[] {
    return Object.keys(CATALOGS).filter((tag) => tag === SOURCE || Object.keys(CATALOGS[tag] ?? {}).length > 0);
}

/**
 * The interface's locale for a reader whose languages are `languages`, in
 * their order, as the engine chooses an explanation's (ADR-0015, decision
 * 9): the first that names a locale the interface has, by its tag, else by
 * its language written in the same script, so that zh-CN takes zh-Hans and
 * zh-TW, Traditional Chinese, goes on to the reader's next language;
 * English when none does.
 */
export function chooseLocale(languages: readonly string[], have: readonly string[] = offered()): string {
    for (const tag of languages) {
        let asked: Intl.Locale;
        try {
            asked = new Intl.Locale(tag);
        } catch {
            continue;
        }
        const exact = have.find((own) => own.toLowerCase() === asked.toString().toLowerCase());
        if (exact) return exact;
        const wanted = asked.maximize();
        const near = have.find((own) => {
            if (PSEUDO.has(own)) return false;
            const it = new Intl.Locale(own).maximize();
            return it.language === wanted.language && it.script === wanted.script;
        });
        if (near) return near;
    }
    return SOURCE;
}

// In the extension, a page or the worker, the reader's languages choose; in Node, under test, the interface is English.
let current = typeof document !== 'undefined' || 'ServiceWorkerGlobalScope' in globalThis ? chooseLocale(navigator.languages) : SOURCE;

/** The locale the interface is worded in. */
export function interfaceLocale(): string {
    return current;
}

/** Words the interface in `tag`, or English if it has no such locale: for tests. */
export function useLocale(tag: string): void {
    current = tag in CATALOGS ? tag : SOURCE;
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
