// The settings and their defaults, shared by the worker, the popup and
// the window; the content script asks the worker for the part the page
// needs.

import { base58Decode as decodeAddress } from './solana.ts';
import type { Contact } from './types.ts';

export type Mode = 'passthrough' | 'watch';

export interface Settings {
    /** 'passthrough': explain every request, then hand it to the wallet you sign with. 'watch': connect as `address`, explain, and refuse. */
    mode: Mode;
    address: string;
    /** Name of the wallet to pass requests to; empty for the first one found. */
    upstream: string;
    /** The SignLens API that computes the explanations (beta). Later the engine runs inside the extension and this goes. */
    apiUrl: string;
    rpcUrl: string;
    /** Show the explanation and wait for a decision before refusing a request or passing it on. Off, a request SignLens would refuse (blocked, or not explained) still waits for one (`gate.mustAsk`). */
    gate: boolean;
    /** The address book, one `Name = address` per line. */
    contacts: string;
    /** Look up tokens the snapshot does not list: decimals from the RPC's mint accounts, symbols from the token list, passed to the engine as claims. */
    lookupTokens: boolean;
    tokenApiUrl: string;
    /** Simulate the transaction over the RPC and hold the balance changes against the explanation, as a claim. */
    simulate: boolean;
    /** Show the instructions and the details under the effects rather than behind one toggle: the reader's last choice, not a setting. */
    showInstructions: boolean;
}

export const DEFAULTS: Readonly<Settings> = Object.freeze({
    mode: 'passthrough',
    address: '',
    upstream: '',
    apiUrl: 'https://api.signlens.dev',
    rpcUrl: 'https://solana-rpc.publicnode.com',
    gate: true,
    contacts: '',
    lookupTokens: true,
    tokenApiUrl: 'https://lite-api.jup.ag/tokens/v2/search',
    simulate: true,
    showInstructions: false,
});

/** The endpoints a user can point the extension at. */
export const ENDPOINTS = ['apiUrl', 'rpcUrl', 'tokenApiUrl'] as const;

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Why `url` cannot be an endpoint, or `null` when it can: https, or plain
 * http to this machine only. The API is sent the transaction and the
 * address book and the RPC the transaction, so not in the clear.
 */
export function endpointProblem(url: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return 'not a URL';
    }
    if (parsed.protocol === 'https:') return null;
    if (parsed.protocol !== 'http:') return 'not an http(s) URL';
    return LOOPBACK.has(parsed.hostname) ? null : 'plain http is for this machine only (localhost, 127.0.0.1); use https';
}

/** The settings as stored, with the defaults where nothing is stored. */
export async function settings(): Promise<Settings> {
    return (await chrome.storage.local.get(DEFAULTS)) as Settings;
}

/** The 32 bytes `text` is the base58 of, as a plain array (it travels to the page as JSON), or `null`. */
export function base58Decode(text: unknown): number[] | null {
    const bytes = decodeAddress(text);
    return bytes ? Array.from(bytes) : null;
}

/**
 * The address book as the engine takes it: the valid `Name = address`
 * lines of `text`, and the line numbers of the others.
 */
export function parseContacts(text: string): { contacts: Contact[]; bad: number[] } {
    const contacts: Contact[] = [];
    const bad: number[] = [];
    text.split('\n').forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed === '') return;
        const match = /^(.+?)\s*=\s*([1-9A-HJ-NP-Za-km-z]+)$/.exec(trimmed);
        const name = match?.[1]?.trim();
        const address = match?.[2];
        if (!match || !name || !address || !base58Decode(address)) {
            bad.push(i + 1);
            return;
        }
        contacts.push({ name, address });
    });
    return { contacts, bad };
}

/**
 * The settings the wallet in the page needs, as the worker answers a
 * `config` message. Never the watched address: every page asks for this,
 * and a site sees that address only once the user allows it (sites.ts).
 */
export interface PageConfig {
    mode: Mode;
    upstream: string;
}

export function pageConfig(config: Settings): PageConfig {
    return { mode: config.mode, upstream: config.upstream };
}

/** The address watch mode connects as, with its key as a plain array, or `null` while no valid one is set. */
export function watched(config: Pick<Settings, 'address'>): { address: string; publicKey: number[] } | null {
    const address = config.address.trim();
    const publicKey = base58Decode(address);
    return publicKey ? { address, publicKey } : null;
}
