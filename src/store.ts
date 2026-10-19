// The extension's storage, typed: what each key holds in local storage
// (the settings and the sites allowed, which last) and in session storage
// (what one browser session keeps: the history and the badge's count, the
// requests waiting in a window, the wallets each tab has, the popup's
// view), and one queue for the writes that read first, so that two at
// once cannot undo each other. Storage holds only what this module wrote,
// so what it reads back is taken as written.

import type { WalletList } from './messages.ts';
import type { Approval, ConnectRequest, HistoryEntry, VerdictWord } from './model.ts';
import type { Settings } from './settings.ts';

/** What local storage holds, by key: the settings (settings.ts), and the sites allowed to see the watched address (sites.ts). */
export interface LocalItems extends Settings {
    watchSites: Approval[];
}

/** What a window shows, by the page it is: an explanation to decide on, or a site asking to see the watched address. */
export interface Pending {
    'confirm.html': HistoryEntry;
    'connect.html': ConnectRequest;
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

/** The key a window's request waits under. */
function pendingKey(id: string): `pending:${string}` {
    return `pending:${id}`;
}

/** Keeps what the window `page` opened with `id` is to show. */
export function putPending<P extends keyof Pending>(_page: P, id: string, request: Pending[P]): Promise<void> {
    const items: Partial<SessionItems> = {};
    items[pendingKey(id)] = request;
    return session.set(items);
}

/** What the window `page` opened with `id` is to show, if its request still waits. */
export async function getPending<P extends keyof Pending>(_page: P, id: string): Promise<Pending[P] | undefined> {
    const key = pendingKey(id);
    // Kept by putPending for the same page: the id is the window's own.
    return (await session.get(key))[key] as Pending[P] | undefined;
}

export function dropPending(id: string): Promise<void> {
    return session.remove(pendingKey(id));
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
