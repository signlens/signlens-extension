// A stand-in for the few `chrome` APIs the worker's modules use, so their
// tests run in Node: storage in memory, a session area that refuses a write
// over its quota, the badge, a call that keeps the worker up, and windows
// that open, close as the user closes them, and fail to open on request. A `.fake.ts` file is never built into the
// extension (tsconfig.build.json).

type Items = Record<string, unknown>;

export interface FakeChrome {
    /** What session storage holds. */
    readonly session: Items;
    /** How many bytes of JSON session storage holds before it refuses a write, as the browser refuses one over its quota. */
    sessionQuota: number;
    /** The badge text last set. */
    badge: string;
    /** The windows open, by id, with the URL each opened. */
    readonly windows: Map<number, string>;
    /** How many windows were ever opened. */
    opened: number;
    /** How many times the worker made a call to stay up (`alive.ts`). */
    pings: number;
    /** Makes the next window fail to open. */
    failNextWindow(): void;
    /** Closes window `id` as the user would. */
    closeWindow(id: number): void;
}

/** Storage as `chrome.storage` keeps it: values copied in and out, and a write that would take it over `quota()` refused whole. */
function area(items: Items, quota = () => Infinity) {
    return {
        async get(keys?: string | string[] | Items | null): Promise<Items> {
            if (keys === null || keys === undefined) return structuredClone(items);
            const defaults: Items = typeof keys === 'string' || Array.isArray(keys) ? {} : keys;
            const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
            const found: Items = { ...defaults };
            for (const name of names) if (Object.hasOwn(items, name)) found[name] = structuredClone(items[name]);
            return found;
        },
        async set(values: Items): Promise<void> {
            const limit = quota();
            if (limit !== Infinity && new TextEncoder().encode(JSON.stringify({ ...items, ...values })).length > limit) {
                throw new Error('Session storage quota bytes exceeded. Values were not stored.');
            }
            Object.assign(items, structuredClone(values));
        },
        async remove(keys: string | string[]): Promise<void> {
            for (const name of typeof keys === 'string' ? [keys] : keys) delete items[name];
        },
    };
}

/** Puts a fresh fake on `globalThis.chrome` and returns its handles. */
export function installFakeChrome(): FakeChrome {
    const session: Items = {};
    const windows = new Map<number, string>();
    const removed = new Set<(id: number) => void>();
    let nextWindow = 0;
    let failing = false;
    const close = (id: number) => {
        if (!windows.delete(id)) return;
        for (const listener of [...removed]) listener(id);
    };
    const fake: FakeChrome = {
        session,
        sessionQuota: Infinity,
        badge: '',
        windows,
        opened: 0,
        pings: 0,
        failNextWindow: () => {
            failing = true;
        },
        closeWindow: close,
    };
    (globalThis as { chrome?: unknown }).chrome = {
        runtime: {
            id: 'fake',
            getURL: (path: string) => `chrome-extension://fake/${path.replace(/^\//, '')}`,
            getPlatformInfo: async () => {
                fake.pings += 1;
                return { os: 'linux', arch: 'x86-64' };
            },
        },
        storage: { session: area(session, () => fake.sessionQuota), local: area({}) },
        action: {
            setBadgeBackgroundColor: async () => {},
            setBadgeTextColor: async () => {},
            setBadgeText: async ({ text }: { text: string }) => {
                fake.badge = text;
            },
        },
        windows: {
            async create({ url }: { url: string }) {
                if (failing) {
                    failing = false;
                    throw new Error('no display');
                }
                nextWindow += 1;
                fake.opened += 1;
                windows.set(nextWindow, url);
                return { id: nextWindow };
            },
            async remove(id: number) {
                close(id);
            },
            onRemoved: {
                addListener: (listener: (id: number) => void) => removed.add(listener),
                removeListener: (listener: (id: number) => void) => removed.delete(listener),
            },
        },
    };
    return fake;
}

/** Waits until `ready()` holds, giving pending work its turns; fails after five seconds, well past a loaded machine's slowest turn. */
export async function until(ready: () => boolean): Promise<void> {
    const end = Date.now() + 5_000;
    while (!ready()) {
        if (Date.now() > end) throw new Error('timed out waiting');
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
}
