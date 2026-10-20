// The gate: a page's request in a window of its own (the explanation, or a
// site asking to see the watched address), and the user's decision. One
// request per tab at a time, so a page cannot stack up windows. A request
// goes on only on "continue": closing the window is the user's refusal;
// the page's tab closing, the page no longer waiting, or a window that
// cannot open is SignLens's, with the reason.

import type { Decision, HistoryEntry, Mode, Outcome, VerdictWord } from '../shared/model.ts';
import { dropPending, type Pending, putPending } from '../shared/store.ts';
import { describe } from '../shared/text.ts';

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
    /** Aborts when the page goes or stops waiting, with which as its reason: what is under way for the request stops with it. */
    signal: AbortSignal;
    /** A window was opened for it. */
    shown?: boolean;
    /** Ends the wait for the user's decision: set once the request is stored for its window, before the window opens. */
    decide?: (outcome: Outcome) => void;
}

/** Why a tab's second request is refused while its first is in flight. */
export const BUSY = 'still busy with an earlier request from this page';

/** A request whose page closed, reloaded or went elsewhere: no one is left to pass it to. */
export const GONE: Outcome = Object.freeze({ decision: 'reject', refused: 'the page closed or reloaded' });

/** Why what was under way for a request stopped at its deadline. */
const STOPPED_WAITING = 'the page stopped waiting';

/** The requests in flight, by tab. */
const inFlight = new Map<number, InFlight>();
/** What aborts each request's signal when its page goes. */
const stops = new WeakMap<InFlight, AbortController>();
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
    const deadline = now + DECISION_TIMEOUT_MS;
    const stop = new AbortController();
    const late = AbortSignal.timeout(Math.max(0, deadline - Date.now()));
    late.addEventListener('abort', () => stop.abort(STOPPED_WAITING), { once: true });
    const flight: InFlight = { deadline, abandoned: false, signal: stop.signal };
    stops.set(flight, stop);
    inFlight.set(tabId, flight);
    return flight;
}

/** Whether the request's page went before any window was opened for it: it was withdrawn unseen, and is not worth keeping or flagging. */
export function withdrawn(flight: InFlight): boolean {
    return flight.abandoned && !flight.shown;
}

/** The tab's request `flight` is answered. A request the tab began after this one was abandoned is left in flight. */
export function end(tabId: number, flight: InFlight): void {
    if (inFlight.get(tabId) === flight) inFlight.delete(tabId);
}

/**
 * The tab's page closed, reloaded or went elsewhere: its request is
 * refused and its window closes, and the tab may ask again at once, while
 * what was abandoned winds down: the calls under way stop, explaining
 * stops between transactions, and no window opens for it.
 */
export function abandon(tabId: number): void {
    const flight = inFlight.get(tabId);
    if (!flight) return;
    inFlight.delete(tabId);
    flight.abandoned = true;
    stops.get(flight)?.abort(GONE.refused);
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
        await dropPending(page, id);
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
        flight.shown = true;
    } catch (error) {
        clearTimeout(timer);
        decisions.delete(id);
        await dropPending(page, id);
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
    await dropPending(page, id);
    // The window may have closed itself already, or been closed by the user.
    if (windowId !== undefined) chrome.windows.remove(windowId).catch(() => {});
    return outcome;
}
