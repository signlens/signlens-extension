// The gate: a page's request in a window of its own (the explanation, or a
// site asking to see the watched address), and the user's decision. One
// request per tab at a time, so a page cannot stack up windows. A request
// goes on only on "continue": closing the window, the page's tab closing,
// the page no longer waiting, or a window that cannot open is a refusal.

import type { HistoryEntry } from './render.ts';
import type { Mode } from './settings.ts';
import { describe } from './text.ts';
import type { VerdictWord } from './verdict.ts';

export type Decision = 'continue' | 'reject';

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
    decide?: (decision: Decision) => void;
}

/** The requests in flight, by tab. */
const inFlight = new Map<number, InFlight>();
/** Decisions awaited, by the id the window knows its request by. */
const decisions = new Map<string, (decision: Decision) => void>();
let nextRequest = 0;

/**
 * Whether a request waits for the user's decision in the window: always
 * while the window is on. With it off, still when SignLens would refuse
 * what would otherwise go on to the wallet: a blocked transaction, or one
 * it could not explain. Watch mode passes nothing on, so there off means
 * never.
 */
export function mustAsk(windowOn: boolean, mode: Mode, worst: VerdictWord): boolean {
    return windowOn || (mode === 'passthrough' && (worst === 'blocked' || worst === 'error'));
}

/** A request from the tab `tabId` begins, or `null` while the tab's last one is still in flight. */
export function begin(tabId: number, now = Date.now()): InFlight | null {
    if (inFlight.has(tabId)) return null;
    const flight: InFlight = { deadline: now + DECISION_TIMEOUT_MS, abandoned: false };
    inFlight.set(tabId, flight);
    return flight;
}

/** The tab's request is answered. */
export function end(tabId: number): void {
    inFlight.delete(tabId);
}

/** The tab closed: its request is refused, and its window closes. */
export function abandon(tabId: number): void {
    const flight = inFlight.get(tabId);
    if (!flight) return;
    flight.abandoned = true;
    flight.decide?.('reject');
}

/** The window's decision on request `id`; whether a request was still waiting for it. */
export function decide(id: string, decision: Decision): boolean {
    const waiting = decisions.get(id);
    waiting?.(decision);
    return waiting !== undefined;
}

/** Shows `entry` in the explanation's window: see `ask`. */
export function askUser(entry: HistoryEntry, flight: InFlight): Promise<{ decision: Decision; note?: string }> {
    return ask('confirm.html', entry, flight);
}

/**
 * Opens the extension's `page` in its own window, with `pending` for it to
 * show, and resolves with the user's decision: 'continue', or 'reject'
 * when the user rejects or closes the window, the page's tab closes, or
 * the page stops waiting. A request whose page is already gone gets no
 * window.
 */
export async function ask(page: string, pending: unknown, flight: InFlight): Promise<{ decision: Decision; note?: string }> {
    if (flight.abandoned) return { decision: 'reject', note: 'the page was closed' };
    const left = flight.deadline - Date.now();
    if (left <= 0) return { decision: 'reject', note: 'the page stopped waiting' };
    nextRequest += 1;
    const id = `${Date.now()}-${nextRequest}`;
    await chrome.storage.session.set({ [`pending:${id}`]: pending });
    const decided = new Promise<Decision>((resolve) => {
        decisions.set(id, resolve);
        flight.decide = resolve;
    });
    // The page may have gone while the request was stored, before it could be told.
    if (flight.abandoned) {
        decisions.delete(id);
        await chrome.storage.session.remove(`pending:${id}`);
        return { decision: 'reject', note: 'the page was closed' };
    }
    const timer = setTimeout(() => decisions.get(id)?.('reject'), left);
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
        await chrome.storage.session.remove(`pending:${id}`);
        return { decision: 'reject', note: `the SignLens window could not open (${describe(error)})` };
    }
    const closed = (removed: number) => {
        if (removed === windowId) decisions.get(id)?.('reject');
    };
    chrome.windows.onRemoved.addListener(closed);
    const decision = await decided;
    chrome.windows.onRemoved.removeListener(closed);
    clearTimeout(timer);
    decisions.delete(id);
    await chrome.storage.session.remove(`pending:${id}`);
    if (windowId !== undefined) chrome.windows.remove(windowId).catch(() => {});
    return { decision };
}
