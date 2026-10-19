// The gate: a page's request in a window of its own (the explanation, or a
// site asking to see the watched address), and the user's decision. One
// request per tab at a time, so a page cannot stack up windows. A request
// goes on only on "continue": closing the window is the user's refusal;
// the page's tab closing, the page no longer waiting, or a window that
// cannot open is SignLens's, with the reason.

import type { Decision, HistoryEntry, Mode, VerdictWord } from './model.ts';
import { dropPending, type Pending, putPending } from './store.ts';
import { describe } from './text.ts';

/** How a request ended: the decision, and why SignLens refused it when the user did not decide. */
export interface Outcome {
    decision: Decision;
    refused?: string;
}

/**
 * How long a request may wait for the user's decision, from when it
 * arrived. The page's wallet gives up after ten minutes (`injected.ts`);
 * this ends a little earlier, so the window never takes a decision the
 * page is no longer waiting for.
 */
export const DECISION_TIMEOUT_MS = 10 * 60_000 - 5_000;

const WINDOW = { width: 520, height: 680 };

/**
 * A page's request while it is explained and decided on. It is abandoned
 * when its tab closes, and past its deadline the page has stopped waiting
 * for it.
 */
export interface InFlight {
    deadline: number;
    abandoned: boolean;
    /** Ends the wait for the user's decision, once the window is open. */
    decide?: (outcome: Outcome) => void;
}

/** Why a tab's second request is refused while its first is in flight. */
export const BUSY = 'still busy with an earlier request from this page';

/** A request whose page closed, reloaded or went elsewhere: no one is left to pass it to. */
const GONE: Outcome = Object.freeze({ decision: 'reject', refused: 'the page closed or reloaded' });

/** The requests in flight, by tab. */
const inFlight = new Map<number, InFlight>();
/** Decisions awaited, by the id the window knows its request by. */
const decisions = new Map<string, (outcome: Outcome) => void>();
let nextRequest = 0;

/**
 * Whether a request waits for the user's decision in the window: always
 * with "Show the explanation and ask first" on (`askFirst`). Off, still
 * when SignLens would refuse what would otherwise go on to the wallet: a
 * blocked transaction, or one it could not explain. Watch mode passes
 * nothing on, so there off means never.
 */
export function mustAsk(askFirst: boolean, mode: Mode, worst: VerdictWord): boolean {
    return askFirst || (mode === 'passthrough' && (worst === 'blocked' || worst === 'error'));
}

/** A request from the tab `tabId` begins, or `null` while the tab's last one is still in flight. */
export function begin(tabId: number, now = Date.now()): InFlight | null {
    if (inFlight.has(tabId)) return null;
    const flight: InFlight = { deadline: now + DECISION_TIMEOUT_MS, abandoned: false };
    inFlight.set(tabId, flight);
    return flight;
}

/** The tab's request `flight` is answered. A request the tab began after this one was abandoned is left in flight. */
export function end(tabId: number, flight: InFlight): void {
    if (inFlight.get(tabId) === flight) inFlight.delete(tabId);
}

/**
 * The tab's page closed, reloaded or went elsewhere: its request is
 * refused and its window closes, and the tab may ask again at once, while
 * what was abandoned winds down (`explainTransactions` stops between
 * transactions, and no window opens for it).
 */
export function abandon(tabId: number): void {
    const flight = inFlight.get(tabId);
    if (!flight) return;
    inFlight.delete(tabId);
    flight.abandoned = true;
    flight.decide?.(GONE);
}

/** The window's decision on request `id`; whether a request was still waiting for it. */
export function decide(id: string, decision: Decision): boolean {
    const waiting = decisions.get(id);
    waiting?.({ decision });
    return waiting !== undefined;
}

/** Shows `entry` in the explanation's window: see `ask`. */
export function askUser(entry: HistoryEntry, flight: InFlight): Promise<Outcome> {
    return ask('confirm.html', entry, flight);
}

/**
 * Opens the extension's `page` in its own window, with `pending` for it to
 * show, and resolves with the user's decision: 'continue', or 'reject'
 * when the user rejects or closes the window. Otherwise it is a refusal,
 * with why: the page's tab closed, the page stopped waiting, the window
 * could not open. A request whose page is already gone gets no window.
 */
export async function ask<P extends keyof Pending>(page: P, pending: Pending[P], flight: InFlight): Promise<Outcome> {
    if (flight.abandoned) return GONE;
    const left = flight.deadline - Date.now();
    if (left <= 0) return { decision: 'reject', refused: 'the page stopped waiting' };
    nextRequest += 1;
    const id = `${Date.now()}-${nextRequest}`;
    await putPending(page, id, pending);
    const decided = new Promise<Outcome>((resolve) => {
        decisions.set(id, resolve);
        flight.decide = resolve;
    });
    // The page may have gone while the request was stored, before it could be told.
    if (flight.abandoned) {
        decisions.delete(id);
        await dropPending(id);
        return GONE;
    }
    const timer = setTimeout(() => decisions.get(id)?.({ decision: 'reject', refused: 'no decision in time' }), left);
    let windowId: number | undefined;
    try {
        const created = await chrome.windows.create({
            url: chrome.runtime.getURL(`${page}?id=${encodeURIComponent(id)}`),
            type: 'popup',
            focused: true,
            ...WINDOW,
        });
        windowId = created?.id;
    } catch (error) {
        clearTimeout(timer);
        decisions.delete(id);
        await dropPending(id);
        return { decision: 'reject', refused: `the SignLens window could not open: ${describe(error)}` };
    }
    const closed = (removed: number) => {
        if (removed === windowId) decisions.get(id)?.({ decision: 'reject' });
    };
    chrome.windows.onRemoved.addListener(closed);
    const outcome = await decided;
    chrome.windows.onRemoved.removeListener(closed);
    clearTimeout(timer);
    decisions.delete(id);
    await dropPending(id);
    if (windowId !== undefined) chrome.windows.remove(windowId).catch(() => {});
    return outcome;
}
