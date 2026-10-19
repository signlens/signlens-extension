// What a row's verdict is called, and which is worst: the one ranking the
// toolbar badge and the window's band both go by. No DOM, so the worker,
// the pages and the tests share it.

import type { Entry, Row } from './render.ts';

/** What a row shows: the engine's verdict, an error, or a message, which has no verdict. */
export type VerdictWord = 'ok' | 'warning' | 'blocked' | 'error' | 'message';

/**
 * From least to most serious. Blocked ranks above error: both stop the
 * request, and "blocked" is what SignLens found rather than what it could
 * not find out, so it is what a mixed request shows.
 */
const ORDER: readonly VerdictWord[] = ['message', 'ok', 'warning', 'error', 'blocked'];

/** The worse of two verdicts. */
export function worse(a: VerdictWord, b: VerdictWord): VerdictWord {
    return ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a;
}

/** The verdict word a row shows. */
export function rowVerdictWord(row: Row): VerdictWord {
    return row.error ? 'error' : (row.verdict ?? 'message');
}

/** The rows of an answer: one per transaction, or one for a message or a failure. */
export function rows(entry: Entry): Row[] {
    return entry.results ?? [{ error: entry.error ?? null, ...(entry.text !== undefined ? { text: entry.text } : {}) }];
}

/** The worst verdict among rows: what the band and the badge show. */
export function worstVerdict(list: Row[]): VerdictWord {
    return list.map(rowVerdictWord).reduce(worse, 'message');
}
