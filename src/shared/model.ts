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
    /** The lookup tables, read or why not; null for a transaction that loads from none. */
    tables: string | null;
    /** The chain the page named, when not mainnet: its word, read and simulated against the RPC in the settings all the same. */
    chain?: string;
    /** The simulation, not run and why, or what it found; null when it is off in the settings. */
    simulation: string | null;
    /** The symbols of unlisted tokens named from the RPC and the token list. */
    hints: string[];
    /** The accounts read from the RPC because the explanation named them (absent in rows kept before there were any). */
    accounts?: string[];
    /** The transaction as `signlens explain` reads it, to save; empty once slimmed to fit the history (history.ts). */
    capture: string;
    /** The explanation's digest, which feedback names it by. */
    digest: string | null;
    /** The transaction, base64, sent with feedback only when the user asks. */
    transaction: string;
}

/**
 * What failed: one `transaction` of a request, read but not explained (the
 * API was away or refused), with what was read for it; or the `request`
 * as a whole (malformed, its page went, a connect with no wallet), which
 * a page asking to sign is told of too.
 */
export interface FailedRow {
    kind: 'failed';
    scope: 'transaction' | 'request';
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

/** A request refused before it was explained: the page named an address as yours that is not one of yours. */
export interface AddressRow {
    kind: 'address';
    /** The addresses the page named, which your settings do not have. */
    claimed: string[];
}

export type Row = ExplainedRow | FailedRow | MessageRow | ConsentRow | AddressRow;

/** How a request ended: the decision, and why SignLens refused it when the user did not decide. */
export interface Outcome {
    decision: Decision;
    refused?: string;
}

/** An answer: one row or more. */
export interface Entry {
    rows: Row[];
}

/** An answer as the window and the popup keep it: where it came from and what became of it. */
/** What became of it is its `Outcome`: absent from a request that never got so far. */
export interface HistoryEntry extends Entry, Partial<Outcome> {
    time: number;
    origin?: string;
    method?: string;
    mode: Mode;
    upstream: string;
    /** What the page calls the wallet it hands the request to on Continue, in plain ASCII: its word, shown as such when `upstream` names none. */
    wallet?: string;
    /** Passed on without asking: the window was off, and SignLens would not refuse it. */
    unasked?: true;
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

/** What the address window shows: the one address a page names as yours that your settings do not have, and the ones they do. */
export interface AddressRequest {
    origin: string;
    address: string;
    mine: string[];
}

/** A wallet as the wallet window offers it: the name it gave itself, in plain text, and its icon, if it gave one the window may show. */
export interface WalletChoice {
    name: string;
    /** An image's data URL, as Wallet Standard has a wallet's icon. */
    icon?: string;
}

/** What the wallet window shows: the wallets a page has, to choose the one that signs. */
export interface WalletRequest {
    origin: string;
    wallets: WalletChoice[];
}

/** An answer that is a failure of the request as a whole. */
export function failure(error: string): Entry {
    return { rows: [{ kind: 'failed', scope: 'request', error }] };
}

/** Why the request as a whole failed, if it did: what the page is told besides the decision. */
export function requestError(entry: Entry): string | undefined {
    const [row] = entry.rows;
    return row?.kind === 'failed' && row.scope === 'request' ? row.error : undefined;
}
