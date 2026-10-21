// What a row's verdict is called, and which is worst: the one ranking the
// toolbar badge and the window's band both go by, and the one line each
// row is summed up in. No DOM, so the worker, the pages and the tests
// share it.

import type { Row, TransactionVerdict, VerdictWord } from './model.ts';
import type { Explanation, Verdict } from './types.ts';

/**
 * From least to most serious. Blocked ranks above error: both stop the
 * request, and "blocked" is what SignLens found rather than what it could
 * not find out, so it is what a mixed request shows.
 */
const ORDER: readonly VerdictWord[] = ['message', 'ok', 'warning', 'error', 'blocked'];

/** The engine's verdicts in the window's words. */
const WORDS: Readonly<Record<Verdict, TransactionVerdict>> = { ok: 'ok', warn: 'warning', block: 'blocked' };

/** The window's word for the engine's verdict on `explanation`. */
export function verdictOf(explanation: Explanation): TransactionVerdict {
    return WORDS[explanation.verdict];
}

/** The worse of two verdicts. */
export function worse(a: VerdictWord, b: VerdictWord): VerdictWord {
    return ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a;
}

/** The verdict word a row shows. */
export function rowVerdictWord(row: Row): VerdictWord {
    switch (row.kind) {
        case 'explained':
            return row.verdict;
        case 'failed':
            return 'error';
        case 'message':
        case 'consent':
            return 'message';
        case 'address':
            return 'warning';
    }
}

/** The worst verdict among rows: what the band and the badge show. Nothing explained at all is nothing known: an error, never a pass. */
export function worstVerdict(list: readonly Row[]): VerdictWord {
    return list.length === 0 ? 'error' : list.map(rowVerdictWord).reduce(worse, 'message');
}

/** A row in one line: what the band and a history row lead with. */
export function summaryOf(row: Row): string {
    switch (row.kind) {
        case 'explained':
            return row.summary;
        case 'failed':
            // A line leads with a capital, whatever the failure's own words (which the page is told as they are).
            return row.scope === 'transaction' ? `Not explained: ${row.error}` : row.error.charAt(0).toUpperCase() + row.error.slice(1);
        case 'message':
            return 'A message, shown as it is';
        case 'consent':
            return `Asked to see the watched address ${row.address}`;
        case 'address':
            return `Named ${row.claimed.join(', ')} as your address, which is not one of yours in SignLens`;
    }
}
