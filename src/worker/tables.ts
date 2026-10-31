// The address lookup tables a transaction loads accounts from, read over
// the RPC: the worker's claim, which the engine is told is unverified. A
// table can be extended, so one read is kept for a few minutes only, and
// read again when a transaction uses an index it lacks.

import { describe } from '../shared/text.ts';
import { t } from '../shared/words.ts';
import { fetchLookupTables, type LoadedAddresses, loadedAddresses, tableLookups } from './solana.ts';

/** Lookup tables read in this worker's life, by RPC and address, with when; a table can change, so not for long. */
const tableCache = new Map<string, { at: number; data: Uint8Array }>();
const TABLE_CACHE_MS = 5 * 60_000;

/** The accounts of `addresses` that are lookup tables, from the cache unless `fresh`, or the RPC; `kept` when any came from the cache. */
async function lookupTables(
    rpc: string,
    addresses: string[],
    stop?: AbortSignal,
    fresh = false,
): Promise<{ tables: Map<string, Uint8Array>; kept: boolean }> {
    const now = Date.now();
    const tables = new Map<string, Uint8Array>();
    const missing: string[] = [];
    for (const address of addresses) {
        const cached = fresh ? undefined : tableCache.get(`${rpc} ${address}`);
        if (cached && now - cached.at < TABLE_CACHE_MS) tables.set(address, cached.data);
        else missing.push(address);
    }
    const kept = missing.length < addresses.length;
    if (missing.length > 0) {
        const fetched = await fetchLookupTables(rpc, missing, stop);
        for (const [address, data] of fetched) {
            tableCache.set(`${rpc} ${address}`, { at: now, data });
            tables.set(address, data);
        }
    }
    return { tables, kept };
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
        return { note: t('worker-tables-not-parsed', { error: describe(error) }) };
    }
    if (lookups.length === 0) return { note: null };
    const count = lookups.length;
    const addresses = lookups.map((l) => l.table);
    try {
        const read = await lookupTables(rpc, addresses, stop);
        let loaded: LoadedAddresses;
        try {
            loaded = loadedAddresses(lookups, read.tables);
        } catch (error) {
            // A table kept from an earlier read may have been extended since: read afresh, once.
            if (!read.kept) throw error;
            loaded = loadedAddresses(lookups, (await lookupTables(rpc, addresses, stop, true)).tables);
        }
        return { loaded, note: t('worker-tables-read', { count }) };
    } catch (error) {
        return { note: t('worker-tables-not-resolved', { count, error: describe(error) }) };
    }
}
