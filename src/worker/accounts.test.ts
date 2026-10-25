// The accounts an explanation wants, read over the stub RPC: in batches,
// with the slot they were read at, and only those the engine would take.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { explanation, fixture, startTestServer, type TestServer } from '../../test/server.ts';
import type { Explanation } from '../shared/types.ts';
import { readAccounts, withAccounts } from './accounts.ts';
import { base58Encode } from './solana.ts';

let server: TestServer;
beforeEach(async () => {
    server = await startTestServer();
});
afterEach(() => server.close());

/** An address of its own for `i`. */
const address = (i: number) => base58Encode(new Uint8Array(32).fill(i + 1));

/** The Drift fixture, with accounts of `bytes` each at `addresses` instead of its own. */
function holding(addresses: string[], bytes: number) {
    const drift = fixture('legacy_squads_drift_approve_execute');
    const data = Buffer.alloc(bytes, 7).toString('base64');
    return { ...drift, accounts: addresses.map((at) => ({ address: at, owner: address(99), slot: 5, data })) };
}

test('accounts are read ten to a call, with the slot the RPC read them at, and those it does not have are left out', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => address(i));
    server.know(holding(twelve.slice(0, 11), 8));
    const read = await readAccounts(server.rpc, twelve);
    assert.deepEqual(
        server.calls.map((call) => (call.params?.[0] as string[] | undefined)?.length),
        [10, 2],
    );
    assert.deepEqual(
        read.map((account) => account.address),
        twelve.slice(0, 11),
    );
    assert.deepEqual(read[0], { address: twelve[0], owner: address(99), data: Buffer.alloc(8, 7).toString('base64'), slot: 5 });
});

test('an account longer than the engine takes is left out, and a failed read reads nothing', async () => {
    server.know(holding([address(0)], 16 * 1024 + 1));
    server.know(holding([address(1)], 16 * 1024));
    assert.deepEqual(
        (await readAccounts(server.rpc, [address(0), address(1)])).map((account) => account.address),
        [address(1)],
    );
    server.refuse('getMultipleAccounts', 403, 'Request blocked');
    assert.deepEqual(await readAccounts(server.rpc, [address(1)]), []);
});

test('the accounts of one request stay within what the API takes', async () => {
    const three = [address(0), address(1), address(2)];
    server.know(holding(three, 15 * 1024));
    const wants = { wanted_accounts: three.map((at) => ({ address: at, reason: 'it holds more' })) };
    server.answerApi(explanation('ok'));
    const first = { ...(explanation('ok', wants) as Explanation) };
    const { accounts } = await withAccounts(server.api, server.rpc, new Uint8Array([1]), { render: true }, first);
    // Two of 20,480 base64 characters each fit in 48,000; the third does not.
    assert.deepEqual(
        accounts.map((account) => account.address),
        three.slice(0, 2),
    );
    assert.equal(server.apiCalls.length, 1);
});
