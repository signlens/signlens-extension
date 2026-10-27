// Lookup tables read over the RPC are kept a few minutes for that RPC only:
// another RPC in the settings is asked for its own.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, startTestServer, tablesOf } from '../../test/server.ts';
import { resolveTables } from './tables.ts';

test('a table kept from an earlier read is read again when a transaction uses an index it lacks: it may have been extended since', async () => {
    const swap = fixture('swap__both_mints_named');
    const server = await startTestServer();
    try {
        // The RPC has the table as it was before its last address was added.
        server.know(swap);
        const [table, data] = [...tablesOf(swap)][0] as [string, Uint8Array];
        server.knowTable(table, data.subarray(0, data.length - 32));
        const before = await resolveTables(swap.bytes, server.rpc);
        assert.match(before.note ?? '', /not resolved \(lookup table \w+ has no index \d+\)$/);
        // A table just read is not read again for it.
        const reads = server.calls.length;
        // Extended: the transaction is resolved, though the shorter table is kept.
        server.know(swap);
        const after = await resolveTables(swap.bytes, server.rpc);
        assert.match(after.note ?? '', /read over RPC, unverified$/);
        assert.deepEqual(after.loaded?.writable, swap.writable);
        assert.deepEqual(after.loaded?.readonly, swap.readonly);
        assert.equal(server.calls.length, 2 * reads);
    } finally {
        await server.close();
    }
});

test("tables read through one RPC are not taken for another's", async () => {
    const swap = fixture('swap__both_mints_named');
    const [knows, other] = await Promise.all([startTestServer(), startTestServer()]);
    try {
        knows.know(swap);
        assert.match((await resolveTables(swap.bytes, knows.rpc)).note ?? '', /read over RPC, unverified$/);
        const elsewhere = await resolveTables(swap.bytes, other.rpc);
        assert.equal(elsewhere.loaded, undefined);
        assert.match(elsewhere.note ?? '', /not resolved \(lookup table \w+ was not found\)$/);
        assert.deepEqual(
            other.calls.map((call) => call.method),
            ['getMultipleAccounts'],
        );
    } finally {
        await Promise.all([knows.close(), other.close()]);
    }
});
