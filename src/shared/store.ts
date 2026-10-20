// The extension's storage, typed: what each key holds in local storage
// (the settings and the sites allowed, which last) and in session storage
// (what one browser session keeps: the history and the badge's count, the
// requests waiting in a window, the wallets each tab has, the popup's
// view), and one queue for the writes that read first, so that two at
// once cannot undo each other. A request waiting in a window comes before
// the history when the browser runs out of room. Storage holds what this
// module wrote, perhaps under an earlier version: what it reads back is
// taken as written, and what must hold whatever was written there (an
// endpoint, an address) is checked again where it is used.

import type { WalletList } from './messages.ts';
import type { AddressRequest, Approval, ConnectRequest, HistoryEntry, VerdictWord } from './model.ts';
import type { Settings } from './settings.ts';

/** What local storage holds, by key: the settings (settings.ts), and the sites allowed to see the watched address (sites.ts). */
export interface LocalItems extends Settings {
    watchSites: Approval[];
}

/** What a window shows, by the page it is: an explanation to decide on, a site asking to see the watched address, or an address the page names as yours. */
export interface Pending {
    'confirm.html': HistoryEntry;
    'connect.html': ConnectRequest;
    'address.html': AddressRequest;
}

/** What session storage holds, by key. */
export interface SessionItems {
    /** The latest answers, newest first (history.ts). */
    history: HistoryEntry[];
    /** How many answers the popup has not shown yet, and the worst of them, for the badge. */
    unseen: number;
    unseenWorst: VerdictWord | null;
    /** The popup's view last chosen. */
    view: string;
    /** The wallets the latest page announced, for a popup that cannot tell its tab. */
    latestWallets: WalletList;
    /** The wallets of a tab. */
    [tab: `wallets:${number}`]: WalletList;
    /** A request waiting in a window, by the id the window is opened with. */
    [request: `pending:${string}`]: Pending[keyof Pending];
}

type Area<Items> = {
    get<K extends keyof Items & string>(...keys: K[]): Promise<Partial<Pick<Items, K>>>;
    set(items: Partial<Items>): Promise<void>;
    remove(...keys: (keyof Items & string)[]): Promise<void>;
};

/** `name`'s storage area, typed by what it holds. `chrome` is looked up at each call, so a test can put a fake in its place. */
function area<Items>(name: 'local' | 'session'): Area<Items> {
    return {
        get: async (...keys) => (await chrome.storage[name].get(keys)) as Partial<Pick<Items, (typeof keys)[number]>>,
        set: (items) => chrome.storage[name].set(items),
        remove: (...keys) => chrome.storage[name].remove(keys),
    };
}

export const local = area<LocalItems>('local');
export const session = area<SessionItems>('session');

/** The values of the keys of `Items` that changed: the new one, or undefined for one removed. */
export type Changes<Items> = { [K in keyof Items]?: Items[K] | undefined };

/** Calls `listener` with what changes in `name`'s storage area. */
export function onChange<N extends 'local' | 'session'>(
    name: N,
    listener: (changes: Changes<N extends 'local' ? LocalItems : SessionItems>) => void,
): void {
    chrome.storage.onChanged.addListener((changes, changed) => {
        if (changed !== name) return;
        const values: Record<string, unknown> = {};
        for (const [key, change] of Object.entries(changes)) values[key] = change.newValue;
        listener(values as Changes<N extends 'local' ? LocalItems : SessionItems>);
    });
}

/** The key the wallets of the tab `tabId` are kept under. */
export function walletsKey(tabId: number): `wallets:${number}` {
    return `wallets:${tabId}`;
}

/** The key a request waits under for the window `page` opened with `id`: a window reads its own kind of request, or none. */
export function pendingKey(page: keyof Pending, id: string): `pending:${string}` {
    return `pending:${page}:${id}`;
}

/** Whether `error` is the browser refusing a write for want of room. */
export function isQuotaError(error: unknown): boolean {
    return /quota/i.test(error instanceof Error ? error.message : String(error));
}

/**
 * Keeps what the window `page` opened with `id` is to show. Refused for
 * room, the oldest answers in the history make way for it, as few as it
 * takes, in the same write.
 */
export function putPending<P extends keyof Pending>(page: P, id: string, request: Pending[P]): Promise<void> {
    const items: Partial<SessionItems> = {};
    items[pendingKey(page, id)] = request;
    return inTurn(async () => {
        let history: HistoryEntry[] | undefined;
        for (;;) {
            try {
                return await session.set(history ? { ...items, history } : items);
            } catch (error) {
                if (!isQuotaError(error)) throw error;
                history ??= (await session.get('history')).history ?? [];
                if (history.length === 0) throw error;
                history = history.slice(0, -1);
            }
        }
    });
}

/** What the window `page` opened with `id` is to show, if its request still waits. */
export async function getPending<P extends keyof Pending>(page: P, id: string): Promise<Pending[P] | undefined> {
    const key = pendingKey(page, id);
    // Kept by putPending under the same page: the key says what it holds.
    return (await session.get(key))[key] as Pending[P] | undefined;
}

export function dropPending(page: keyof Pending, id: string): Promise<void> {
    return session.remove(pendingKey(page, id));
}

/**
 * Drops every request waiting in a window. For the worker as it starts:
 * one that stopped took its requests with it, and what they left would
 * only take room.
 */
export function dropStalePending(): Promise<void> {
    return inTurn(async () => {
        const area = chrome.storage.session;
        const keys = typeof area.getKeys === 'function' ? await area.getKeys() : Object.keys(await area.get(null));
        const stale = keys.filter((key) => key.startsWith('pending:'));
        if (stale.length > 0) await area.remove(stale);
    });
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `write` after every write queued before it, in this context. A
 * failure is the caller's to handle, and does not stop the writes after.
 */
export function inTurn<T>(write: () => Promise<T>): Promise<T> {
    const run = queue.then(write);
    queue = run.catch(() => {});
    return run;
}
