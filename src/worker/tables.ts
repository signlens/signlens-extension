// The address lookup tables a transaction loads accounts from, read over
// the RPC: the worker's claim, which the engine is told is unverified. A
// table can be extended, so one read is kept for a few minutes only.

import { describe } from '../shared/text.ts';
import { fetchLookupTables, type LoadedAddresses, loadedAddresses, tableLookups } from './solana.ts';

/** Lookup tables read in this worker's life, by RPC and address, with when; a table can change, so not for long. */
const tableCache = new Map<string, { at: number; data: Uint8Array }>();
const TABLE_CACHE_MS = 5 * 60_000;

/** The accounts of `addresses` that are lookup tables, from the cache or the RPC. */
async function lookupTables(rpc: string, addresses: string[], stop?: AbortSignal): Promise<Map<string, Uint8Array>> {
    const now = Date.now();
    const tables = new Map<string, Uint8Array>();
    const missing: string[] = [];
    for (const address of addresses) {
        const cached = tableCache.get(`${rpc} ${address}`);
        if (cached && now - cached.at < TABLE_CACHE_MS) tables.set(address, cached.data);
        else missing.push(address);
    }
    if (missing.length > 0) {
        const fetched = await fetchLookupTables(rpc, missing, stop);
        for (const [address, data] of fetched) {
            tableCache.set(`${rpc} ${address}`, { at: now, data });
            tables.set(address, data);
        }
    }
    return tables;
}

/** What the transaction's lookup tables load, read over the RPC, or why that is unknown, as a line for the window; no line for one that loads from none. */
export async function resolveTables(
    bytes: Uint8Array,
    rpc: string,
    stop?: AbortSignal,
): Promise<{ loaded?: LoadedAddresses; note: string | null }> {
    let lookups: ReturnType<typeof tableLookups>;
    try {
        lookups = tableLookups(bytes);
    } catch (error) {
        return { note: `not parsed (${describe(error)})` };
    }
    if (lookups.length === 0) return { note: null };
    const count = `${lookups.length} lookup table${lookups.length === 1 ? '' : 's'}`;
    try {
        const tables = await lookupTables(
            rpc,
            lookups.map((l) => l.table),
            stop,
        );
        return { loaded: loadedAddresses(lookups, tables), note: `${count} read over RPC, unverified` };
    } catch (error) {
        return { note: `${count} not resolved (${describe(error)})` };
    }
}
