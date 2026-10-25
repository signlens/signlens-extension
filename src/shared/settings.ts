// The settings and their defaults, shared by the worker, the popup and
// the window; the content script asks the worker for the part the page
// needs.

import { base58Decode as decodeAddress } from './base58.ts';
import type { Mode } from './model.ts';
import { inTurn, local } from './store.ts';
import type { Contact } from './types.ts';

export interface Settings {
    /** 'passthrough': explain every request, then hand it to the wallet you sign with. 'watch': connect as `address`, explain, and refuse. */
    mode: Mode;
    address: string;
    /** Name of the wallet to pass requests to; empty for the first one found. */
    upstream: string;
    /** The SignLens API that computes the explanations (beta). Later the engine runs inside the extension and this goes. */
    apiUrl: string;
    rpcUrl: string;
    /** "Show the explanation and ask first": wait for a decision before refusing a request or passing it on. Off, in pass-through mode, a request SignLens would refuse (blocked, or an error) still waits for one; in watch mode none does (`gate.mustAsk`). */
    askFirst: boolean;
    /** The address book, one `Name = address` per line. */
    contacts: string;
    /**
     * Your own addresses, one per line: in pass-through mode the only ones
     * SignLens calls "you". An address a page names as yours that is not
     * here is asked about first (requests.ts).
     */
    myAddresses: string;
    /** Look up tokens the snapshot does not list: decimals from the RPC's mint accounts, symbols from the token list, passed to the engine as claims. */
    lookupTokens: boolean;
    tokenApiUrl: string;
    /** Simulate the transaction over the RPC and hold the balance changes against the explanation, as a claim. */
    simulate: boolean;
    /** Read over the RPC the accounts an explanation names (a multisig proposal's stored transaction, a DAO proposal's options), and ask again with them, as claims. */
    lookupAccounts: boolean;
    /** Show the instructions and the details under the effects rather than behind one toggle: the reader's last choice, not a setting. */
    showInstructions: boolean;
}

export const DEFAULTS: Readonly<Settings> = Object.freeze({
    mode: 'passthrough',
    address: '',
    upstream: '',
    apiUrl: 'https://api.signlens.dev',
    rpcUrl: 'https://solana-rpc.publicnode.com',
    askFirst: true,
    contacts: '',
    myAddresses: '',
    lookupTokens: true,
    tokenApiUrl: 'https://lite-api.jup.ag/tokens/v2/search',
    simulate: true,
    lookupAccounts: true,
    showInstructions: false,
});

/** The endpoints a user can point the extension at. */
export const ENDPOINTS = ['apiUrl', 'rpcUrl', 'tokenApiUrl'] as const;

/** The settings as stored, with the defaults where nothing is stored. */
export async function settings(): Promise<Settings> {
    return { ...DEFAULTS, ...(await local.get(...(Object.keys(DEFAULTS) as (keyof Settings)[]))) };
}

/** The 32 bytes `text` is the base58 of, as a plain array (it travels to the page as JSON), or `null`. */
export function addressBytes(text: unknown): number[] | null {
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
        if (!match || !name || !address || !addressBytes(address)) {
            bad.push(i + 1);
            return;
        }
        contacts.push({ name, address });
    });
    return { contacts, bad };
}

/** Your addresses as the settings hold them: the valid lines of `text`, once each, and the line numbers of the others. */
export function parseAddresses(text: string): { addresses: string[]; bad: number[] } {
    const addresses: string[] = [];
    const bad: number[] = [];
    text.split('\n').forEach((line, i) => {
        const address = line.trim();
        if (address === '') return;
        if (!addressBytes(address)) bad.push(i + 1);
        else if (!addresses.includes(address)) addresses.push(address);
    });
    return { addresses, bad };
}

/** Adds `more` to your addresses in the settings, in turn with any other write that reads first. */
export function addAddresses(more: string[]): Promise<void> {
    return inTurn(async () => {
        const { myAddresses = '' } = await local.get('myAddresses');
        const kept = parseAddresses(myAddresses).addresses;
        const added = more.filter((address) => !kept.includes(address));
        if (added.length > 0) await local.set({ myAddresses: [myAddresses.trimEnd(), ...added].filter(Boolean).join('\n') });
    });
}

/**
 * The settings the wallet in the page needs, as the worker answers a
 * `config` message. Never the watched address: every page asks for this,
 * and a site sees that address only once the user allows it (sites.ts).
 */
export function pageConfig(config: Settings): SignLensPage.Config {
    return { mode: config.mode, upstream: config.upstream };
}

/** The address watch mode connects as, with its key as a plain array, or `null` while no valid one is set. */
export function watched(config: Pick<Settings, 'address'>): { address: string; publicKey: number[] } | null {
    const address = config.address.trim();
    const publicKey = addressBytes(address);
    return publicKey ? { address, publicKey } : null;
}
