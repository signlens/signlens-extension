// The sites that may see the address SignLens watches. In watch mode no
// wallet stands behind SignLens to ask the user before a site learns who
// they are, so SignLens asks, in a window of its own, the first time a
// site connects, and remembers an Allow for that site and that address.
// A silent connect (a dapp reconnecting as it loads) only ever learns
// what was allowed before. The popup lists the sites and takes them back,
// and its requests keep each answer, Deny included.

import type { ConnectPayload, ConnectReply } from '../shared/messages.ts';
import type { Approval, ConnectRequest } from '../shared/model.ts';
import { type Settings, watched } from '../shared/settings.ts';
import { inTurn, local } from '../shared/store.ts';
import { describe, logged } from '../shared/text.ts';
import * as gate from './gate.ts';
import { remember } from './history.ts';

/** The sites allowed so far, oldest first. */
export async function approvals(): Promise<Approval[]> {
    return (await local.get('watchSites')).watchSites ?? [];
}

async function allowed(origin: string, address: string): Promise<boolean> {
    return (await approvals()).some((a) => a.origin === origin && a.address === address);
}

/**
 * Allows `origin` to see `address`. Approvals are written in the worker
 * only, the popup's Revoke included (a message), and in turn: an Allow and
 * a Revoke at once cannot undo each other.
 */
export function approve(origin: string, address: string, now = Date.now()): Promise<void> {
    return inTurn(async () => {
        const kept = (await approvals()).filter((a) => !(a.origin === origin && a.address === address));
        await local.set({ watchSites: [...kept, { origin, address, at: now }] });
    });
}

/** Takes back what `origin` was allowed to see of `address`. */
export function revoke(origin: string, address: string): Promise<void> {
    return inTurn(async () => {
        await local.set({ watchSites: (await approvals()).filter((a) => !(a.origin === origin && a.address === address)) });
    });
}

/**
 * Answers a connect in watch mode from the page in tab `tabId`: the
 * watched address if the site was allowed to see it, or once the user
 * allows it now; a refusal otherwise. A silent connect never asks.
 */
export async function connectWatch(payload: ConnectPayload, tabId: number, config: Settings): Promise<ConnectReply> {
    if (config.mode !== 'watch') return { approved: false, error: 'SignLens is not set to watch-only' };
    const key = watched(config);
    const { origin } = payload;
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
    if (!flight) return { approved: false, error: `SignLens is ${gate.BUSY}` };
    try {
        const request: ConnectRequest = { origin, address: key.address };
        let outcome = await gate.ask('connect.html', request, flight);
        let refusal = 'the connection was refused in SignLens';
        // A page that went before its window opened withdrew its request: nothing to keep.
        if (gate.withdrawn(flight)) return { approved: false, error: refusal };
        // The site is allowed before the requests say so: an Allow that cannot be kept is a refusal.
        if (outcome.decision === 'continue') {
            try {
                await approve(origin, key.address);
            } catch (error) {
                refusal = `could not keep the site allowed: ${describe(error)}`;
                outcome = { decision: 'reject', refused: refusal };
            }
        }
        // Kept for the popup; a failure to keep it changes nothing of the answer.
        await remember({
            time: Date.now(),
            origin,
            method: 'standard:connect',
            mode: 'watch',
            upstream: '',
            rows: [{ kind: 'consent', address: key.address }],
            ...outcome,
        }).catch(logged('keep the request'));
        return outcome.decision === 'continue' ? { approved: true, ...key } : { approved: false, error: refusal };
    } finally {
        gate.end(tabId, flight);
    }
}
