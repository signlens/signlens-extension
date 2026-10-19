// The sites that may see the address SignLens watches. In watch mode no
// wallet stands behind SignLens to ask the user before a site learns who
// they are, so SignLens asks, in a window of its own, the first time a
// site connects, and remembers the answer for that site and that address.
// A silent connect (a dapp reconnecting as it loads) only ever learns
// what was allowed before. The popup lists the sites and takes them back.

import * as gate from './gate.ts';
import type { ConnectPayload, ConnectReply } from './messages.ts';
import { type Settings, watched } from './settings.ts';
import { printable } from './text.ts';

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

const KEY = 'watchSites';

/** The sites allowed so far, oldest first. */
export async function approvals(): Promise<Approval[]> {
    const stored = (await chrome.storage.local.get(KEY)) as { watchSites?: Approval[] };
    return stored.watchSites ?? [];
}

async function allowed(origin: string, address: string): Promise<boolean> {
    return (await approvals()).some((a) => a.origin === origin && a.address === address);
}

/** Allows `origin` to see `address`. */
export async function approve(origin: string, address: string, now = Date.now()): Promise<void> {
    const kept = (await approvals()).filter((a) => !(a.origin === origin && a.address === address));
    await chrome.storage.local.set({ [KEY]: [...kept, { origin, address, at: now }] });
}

/** Takes back what `origin` was allowed to see of `address`. */
export async function revoke(origin: string, address: string): Promise<void> {
    await chrome.storage.local.set({ [KEY]: (await approvals()).filter((a) => !(a.origin === origin && a.address === address)) });
}

/**
 * Answers a connect in watch mode from the page in tab `tabId`: the
 * watched address if the site was allowed to see it, or once the user
 * allows it now; a refusal otherwise. A silent connect never asks.
 */
export async function connectWatch(payload: ConnectPayload, tabId: number, config: Settings): Promise<ConnectReply> {
    if (config.mode !== 'watch') return { approved: false, error: 'SignLens is not in watch mode' };
    const key = watched(config);
    const origin = printable(payload.origin, 200);
    // A sandboxed page's origin is "null", shared with every other such page:
    // allowing one would allow them all. Only a site's own address is asked about.
    if (!/^https?:\/\/[^/]+$/.test(origin)) {
        return payload.silent === true ? { approved: false } : { approved: false, error: 'this page has no address of its own to allow' };
    }
    if (key && (await allowed(origin, key.address))) return { approved: true, ...key };
    // Asked without a window, there is nothing more to say.
    if (payload.silent === true) return { approved: false };
    if (!key) return { approved: false, error: "enter the address to watch in the extension's popup, then connect again" };
    const flight = gate.begin(tabId);
    if (!flight) return { approved: false, error: 'SignLens is still busy with an earlier request from this page' };
    try {
        const request: ConnectRequest = { origin, address: key.address };
        const { decision } = await gate.ask('connect.html', request, flight);
        if (decision !== 'continue') return { approved: false, error: 'the connection was refused in SignLens' };
        await approve(origin, key.address);
        return { approved: true, ...key };
    } finally {
        gate.end(tabId);
    }
}
