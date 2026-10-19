// Token names from the RPC and the token list: kept for the endpoints that
// gave them, and a lookup that failed is not kept at all. Each test has a
// stub of its own and a mint of its own, so none answers from another's.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer } from '../e2e/server.ts';
import { tokenHints } from './hints.ts';

test("a name learned through one RPC and token list is not taken for another's", async () => {
    const mint = 'HMYd9tosnUXuNHmq7pXmoePRVBLBBjA3JBfydq6upump';
    const [named, other] = await Promise.all([startTestServer(), startTestServer()]);
    try {
        named.knowMint(mint, 'HMYD', 6);
        assert.deepEqual(await tokenHints([mint], { rpcUrl: named.rpc, tokenApiUrl: named.tokens }), [
            { mint, symbol: 'HMYD', decimals: 6 },
        ]);
        assert.deepEqual(await tokenHints([mint], { rpcUrl: other.rpc, tokenApiUrl: other.tokens }), []);
        // Both asked, in parallel.
        assert.deepEqual(other.calls.map((call) => call.method).sort(), ['getMultipleAccounts', 'tokens']);
    } finally {
        await Promise.all([named.close(), other.close()]);
    }
});

test('a token list that failed is asked again next time', async () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const server = await startTestServer();
    const config = { rpcUrl: server.rpc, tokenApiUrl: server.tokens };
    try {
        server.knowMint(mint, 'USDC', 6);
        server.refuse('tokens', 503, 'down');
        assert.deepEqual(await tokenHints([mint], config), []);
        server.stopRefusing();
        assert.deepEqual(await tokenHints([mint], config), [{ mint, symbol: 'USDC', decimals: 6 }]);
        // Named once, it is kept.
        server.calls.length = 0;
        assert.deepEqual(await tokenHints([mint], config), [{ mint, symbol: 'USDC', decimals: 6 }]);
        assert.deepEqual(server.calls, []);
    } finally {
        await server.close();
    }
});
