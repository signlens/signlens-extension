// Lookup tables read over the RPC are kept a few minutes for that RPC only:
// another RPC in the settings is asked for its own.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, startTestServer } from '../../e2e/server.ts';
import { resolveTables } from './tables.ts';

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
