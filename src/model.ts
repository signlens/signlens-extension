// What SignLens keeps of a request: an answer, which is rows (one per
// transaction, or one for a message, for a request that failed as a whole,
// or for a site asking to see the watched address), and the answer as the
// history keeps it, with where it came from and what became of it. Shared
// by the worker, the window and the popup: no DOM, no `chrome`.

import type { Effect, Finding, Section } from './types.ts';

/** What became of a request: passed on (for a site's asking, allowed), or not. */
export type Decision = 'continue' | 'reject';

/** 'passthrough': explain every request, then hand it to the wallet you sign with. 'watch': connect as an address, explain, and refuse. */
export type Mode = SignLensPage.Config['mode'];

/** What a row shows: the engine's verdict on a transaction, an error, or a message, which has no verdict. */
export type VerdictWord = 'ok' | 'warning' | 'blocked' | 'error' | 'message';

/** The engine's verdict on a transaction it explained, in the window's words. */
export type TransactionVerdict = Extract<VerdictWord, 'ok' | 'warning' | 'blocked'>;

/** A transaction the API explained, with what the worker read itself. */
export interface ExplainedRow {
    kind: 'explained';
    verdict: TransactionVerdict;
    summary: string;
    findings: Finding[];
    effects: Effect[];
    sections: Section[];
    /** The engine's full text. */
    text: string;
    /** The lookup tables: "none", read, or why not. */
    tables: string;
    /** The chain the page named, when not mainnet: its word, read and simulated against the RPC in the settings all the same. */
    chain?: string;
    /** The simulation: "off", not run and why, or what it found. */
    simulation: string;
    /** The symbols of unlisted tokens named from the RPC and the token list. */
    hints: string[];
    /** The transaction as `signlens explain` reads it, to save; empty once slimmed to fit the history (history.ts). */
    capture: string;
    /** The explanation's digest, which feedback names it by. */
    digest: string | null;
    /** The transaction, base64, sent with feedback only when the user asks. */
    transaction: string;
}

/** A transaction SignLens could not explain, or a request that failed as a whole. */
export interface FailedRow {
    kind: 'failed';
    error: string;
    tables?: string;
    chain?: string;
    capture?: string;
}

/** A message to sign, shown as it is. */
export interface MessageRow {
    kind: 'message';
    text: string;
}

/** A site asking to see the watched address. */
export interface ConsentRow {
    kind: 'consent';
    address: string;
}

export type Row = ExplainedRow | FailedRow | MessageRow | ConsentRow;

/** An answer: one row or more. */
export interface Entry {
    rows: Row[];
    /** Why the request as a whole could not be explained (malformed, or its page went), which the page is told too. */
    error?: string;
}

/** An answer as the window and the popup keep it: where it came from and what became of it. */
export interface HistoryEntry extends Entry {
    time: number;
    origin?: string;
    method?: string;
    mode: Mode;
    upstream: string;
    /** What the page calls the wallet it hands the request to on Continue, in plain ASCII: its word, shown as such when `upstream` names none. */
    wallet?: string;
    /** What became of a request the user was asked about in pass-through mode, or of a site's asking to see the watched address. */
    decision?: Decision;
    /** Why SignLens refused it, when it was not the user's decision. */
    refused?: string;
}

/** A site allowed to see an address, and when. */
export interface Approval {
    origin: string;
    address: string;
    at: number;
}

/** What the consent window shows: who asks, to see what. */
export interface ConnectRequest {
    origin: string;
    address: string;
}

/** An answer that is a failure of the request as a whole. */
export function failure(error: string): Entry {
    return { rows: [{ kind: 'failed', error }], error };
}
