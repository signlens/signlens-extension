// The address lookup tables a transaction loads accounts from, read over
// the RPC: the worker's claim, which the engine is told is unverified. A
// table can be extended, so one read is kept for a few minutes only.

import { fetchLookupTables, type LoadedAddresses, loadedAddresses, tableLookups } from './solana.ts';
import { describe } from './text.ts';

/** Lookup tables read in this worker's life, by address, with when; a table can change, so not for long. */
const tableCache = new Map<string, { at: number; data: Uint8Array }>();
const TABLE_CACHE_MS = 5 * 60_000;

/** The accounts of `addresses` that are lookup tables, from the cache or the RPC. */
async function lookupTables(rpc: string, addresses: string[]): Promise<Map<string, Uint8Array>> {
    const now = Date.now();
    const tables = new Map<string, Uint8Array>();
    const missing: string[] = [];
    for (const address of addresses) {
        const cached = tableCache.get(address);
        if (cached && now - cached.at < TABLE_CACHE_MS) tables.set(address, cached.data);
        else missing.push(address);
    }
    if (missing.length > 0) {
        const fetched = await fetchLookupTables(rpc, missing);
        for (const [address, data] of fetched) {
            tableCache.set(address, { at: now, data });
            tables.set(address, data);
        }
    }
    return tables;
}

/** What the transaction's lookup tables load, read over the RPC, or why that is unknown, as a line for the window. */
export async function resolveTables(bytes: Uint8Array, rpc: string): Promise<{ loaded?: LoadedAddresses; note: string }> {
    let lookups: ReturnType<typeof tableLookups>;
    try {
        lookups = tableLookups(bytes);
    } catch (error) {
        return { note: `not parsed (${describe(error)})` };
    }
    if (lookups.length === 0) return { note: 'none' };
    const count = `${lookups.length} lookup table${lookups.length === 1 ? '' : 's'}`;
    try {
        const tables = await lookupTables(
            rpc,
            lookups.map((l) => l.table),
        );
        return { loaded: loadedAddresses(lookups, tables), note: `${count} read over RPC, unverified` };
    } catch (error) {
        return { note: `${count} not resolved (${describe(error)})` };
    }
}
