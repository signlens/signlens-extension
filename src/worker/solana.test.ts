// The little of the wire format the worker reads, held against mainnet
// transactions and against what their lookup tables are known to load.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { startTestServer } from '../../test/server.ts';
import {
    ACCOUNTS_PER_CALL,
    base58Decode,
    base58Encode,
    CALLS_AT_ONCE,
    fromBase64,
    isAddress,
    loadedAddresses,
    messageAccounts,
    multipleAccounts,
    readAccountList,
    tableLookups,
    toBase64,
    tokenBalance,
} from './solana.ts';

const FIXTURES = new URL('../../test/fixtures/', import.meta.url);

function fixture(name: string): { bytes: Uint8Array; writable: string[]; readonly: string[] } {
    const text = readFileSync(new URL(`${name}.b64`, FIXTURES), 'utf8');
    const list = (key: string) => {
        const line = text.split('\n').find((l) => l.startsWith(`# ${key}: `));
        return line
            ? line
                  .slice(key.length + 4)
                  .split(/\s+/)
                  .filter(Boolean)
            : [];
    };
    const base64 = text
        .split('\n')
        .filter((l) => !l.startsWith('#'))
        .join('');
    return { bytes: fromBase64(base64), writable: list('loaded-writable'), readonly: list('loaded-readonly') };
}

test('base58 round-trips an address and refuses what is not one', () => {
    const usdc = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const bytes = base58Decode(usdc);
    assert.ok(bytes);
    assert.equal(bytes.length, 32);
    assert.equal(base58Encode(bytes), usdc);
    assert.equal(base58Encode(new Uint8Array(32)), '1'.repeat(32));
    assert.equal(
        base58Decode('1'.repeat(32))?.every((b) => b === 0),
        true,
    );
    assert.equal(base58Decode('0OIl'), null);
    assert.equal(base58Decode(`1${usdc}`), null, 'a leading 1 must mean a leading zero byte');
    assert.equal(isAddress(42), false);
});

test('base64 round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test('a legacy transaction has no lookup tables and its accounts carry the right flags', () => {
    const { bytes } = fixture('legacy_durable_nonce_token_transfer');
    assert.deepEqual(tableLookups(bytes), []);
    const accounts = messageAccounts(bytes);
    assert.ok(accounts.length > 3);
    assert.equal(accounts[0]?.signer, true);
    assert.equal(accounts[0]?.writable, true, 'the fee payer is a writable signer');
    assert.ok(
        accounts.some((a) => !a.signer && !a.writable),
        'programs are read-only non-signers',
    );
});

test('a v0 transaction names its lookup tables, and the tables resolve the addresses the fixture says they load', () => {
    const swap = fixture('swap__both_mints_named');
    const lookups = tableLookups(swap.bytes);
    assert.ok(lookups.length > 0);
    const count = lookups.reduce((n, l) => n + l.writable.length + l.readonly.length, 0);
    assert.equal(count, swap.writable.length + swap.readonly.length);
    // A table laid out so that each referenced index holds the fixture's address.
    const tables = new Map<string, Uint8Array>();
    const place = (table: string, index: number, address: string) => {
        const needed = 56 + (index + 1) * 32;
        const existing = tables.get(table) ?? new Uint8Array(0);
        const data = new Uint8Array(Math.max(existing.length, needed));
        data.set(existing);
        const decoded = base58Decode(address);
        assert.ok(decoded);
        data.set(decoded, 56 + index * 32);
        tables.set(table, data);
    };
    const w = swap.writable[Symbol.iterator]();
    const r = swap.readonly[Symbol.iterator]();
    for (const lookup of lookups) for (const index of lookup.writable) place(lookup.table, index, w.next().value ?? '');
    for (const lookup of lookups) for (const index of lookup.readonly) place(lookup.table, index, r.next().value ?? '');
    assert.deepEqual(loadedAddresses(lookups, tables), { writable: swap.writable, readonly: swap.readonly });
    assert.throws(() => loadedAddresses(lookups, new Map()), /was not found/);
});

test('a v1 transaction has no lookup tables, and its accounts are the ones the engine reads', () => {
    // As crates/signlens-solana-tx/tests/mainnet_fixtures.rs has it: header
    // 1, 0, 15; after it a config mask, the lifetime and the instruction
    // count, then 52 accounts.
    const { bytes } = fixture('v1_mainnet_orca_bot');
    assert.deepEqual(tableLookups(bytes), []);
    const accounts = messageAccounts(bytes);
    assert.equal(accounts.length, 52);
    assert.deepEqual(accounts[0], { address: 'AXmnRBrNtYYyyo82cLBBhnWJ7o1iqNLZbuEVpDB3V666', writable: true, signer: true });
    assert.equal(accounts.at(-1)?.address, 'HVi6VyyLvTtFTA8f8atavxVjUKi8WjmnydfKgoZKzt7H');
    assert.equal(accounts.filter((a) => a.signer).length, 1);
    assert.equal(accounts.filter((a) => a.writable).length, 52 - 15);
    assert.throws(() => messageAccounts(bytes.subarray(0, 40)), /truncated/);
});

test('truncated and empty transactions are errors, not guesses', () => {
    assert.throws(() => tableLookups(new Uint8Array()), /empty/);
    assert.throws(() => messageAccounts(new Uint8Array()), /empty/);
    const { bytes } = fixture('swap__both_mints_named');
    assert.throws(() => tableLookups(bytes.subarray(0, 40)), /truncated/);
});

test('a token account is read for its mint, owner and amount; a wallet for its lamports', () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const owner = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    const data = new Uint8Array(165);
    data.set(base58Decode(mint) ?? new Uint8Array(32), 0);
    data.set(base58Decode(owner) ?? new Uint8Array(32), 32);
    new DataView(data.buffer).setBigUint64(64, 123_456n, true);
    const balance = tokenBalance({
        owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        lamports: 2_039_280,
        data: [toBase64(data), 'base64'],
    });
    assert.deepEqual(balance, { lamports: 2_039_280n, token: { mint, owner, amount: 123_456n } });
    const wallet = tokenBalance({ owner: '11111111111111111111111111111111', lamports: 5, data: ['', 'base64'] });
    assert.deepEqual(wallet, { lamports: 5n, token: null });
    assert.equal(tokenBalance(null), null);
});

test('accounts are read as the RPC must answer them, or not at all', () => {
    const account = { owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', lamports: 2_039_280, data: ['AQID', 'base64'], space: 3 };
    assert.deepEqual(readAccountList([account, null], 2), [{ owner: account.owner, lamports: 2_039_280, data: ['AQID', 'base64'] }, null]);
    for (const odd of [
        'x',
        [account],
        [{ ...account, owner: 7 }, null],
        [{ ...account, lamports: -1 }, null],
        [{ ...account, lamports: 1.5 }, null],
        [{ ...account, data: ['AQID', 'jsonParsed'] }, null],
        [{ ...account, data: 'AQID' }, null],
        ['account', null],
    ]) {
        assert.equal(readAccountList(odd, 2), null, JSON.stringify(odd));
    }
});

test('an RPC answer that is not what was asked for is an error, never taken for an answer', async () => {
    const server = await startTestServer();
    const address = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';
    try {
        const answers: [string, RegExp][] = [
            ['[]', /the RPC at 127\.0\.0\.1:\d+ answered something that is not JSON-RPC$/],
            ['not json', /not JSON-RPC/],
            ['{"jsonrpc":"2.0","id":1,"error":{"code":-32005,"message":"busy"}}', /RPC error: busy$/],
            ['{"jsonrpc":"2.0","id":1,"error":"busy"}', /RPC error: no message$/],
            [
                '{"jsonrpc":"2.0","id":1,"result":{"value":"x"}}',
                /the RPC at 127\.0\.0\.1:\d+ answered getMultipleAccounts with something else$/,
            ],
            ['{"jsonrpc":"2.0","id":1,"result":{"value":[]}}', /with something else/],
            ['{"jsonrpc":"2.0","id":1}', /with something else/],
        ];
        for (const [body, said] of answers) {
            server.refuse('getMultipleAccounts', 200, body);
            await assert.rejects(multipleAccounts(server.rpc, [address]), said, body);
        }
        server.stopRefusing();
        assert.deepEqual(await multipleAccounts(server.rpc, [address]), [null]);
    } finally {
        await server.close();
    }
});

/**
 * `fetch` replaced by an RPC that answers `getMultipleAccounts` after
 * `ms`, each account with as many lamports as its place in `addresses`,
 * or with a 503 for the batch that starts at `failAt`; what was asked,
 * and the most calls open at once.
 */
function batchedRpc(addresses: string[], ms: number, failAt?: number) {
    const seen = { batches: [] as string[][], signals: [] as AbortSignal[], open: 0, most: 0 };
    const real = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        const batch = (JSON.parse(String(init?.body)) as { params: [string[]] }).params[0];
        seen.batches.push(batch);
        if (init?.signal) seen.signals.push(init.signal);
        if (batch[0] === addresses[failAt ?? -1]) return new Response('down', { status: 503 });
        seen.open += 1;
        seen.most = Math.max(seen.most, seen.open);
        await new Promise((resolve) => setTimeout(resolve, ms));
        seen.open -= 1;
        const value = batch.map((address) => ({
            owner: '11111111111111111111111111111111',
            lamports: addresses.indexOf(address),
            data: ['', 'base64'],
        }));
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { context: { slot: 1 }, value } }));
    }) as typeof fetch;
    return { seen, restore: () => (globalThis.fetch = real) };
}

const many = (count: number) => Array.from({ length: count }, (_, i) => base58Encode(new Uint8Array(32).fill(i + 1)));

test('more than ten accounts are read four calls at a time, and come back in order', async () => {
    const addresses = many(45);
    const { seen, restore } = batchedRpc(addresses, 20);
    try {
        const read = await multipleAccounts('https://rpc.example/', addresses);
        assert.deepEqual(
            read.map((account) => account?.lamports),
            addresses.map((_, i) => i),
        );
        assert.equal(seen.batches.length, Math.ceil(addresses.length / ACCOUNTS_PER_CALL));
        assert.ok(seen.batches.every((batch) => batch.length <= ACCOUNTS_PER_CALL));
        assert.equal(seen.most, CALLS_AT_ONCE);
    } finally {
        restore();
    }
});

test('a call that fails fails the read, stops the calls beside it and starts no more', async () => {
    const addresses = many(45);
    const { seen, restore } = batchedRpc(addresses, 200, ACCOUNTS_PER_CALL);
    try {
        await assert.rejects(multipleAccounts('https://rpc.example/', addresses), /503/);
        assert.equal(seen.batches.length, CALLS_AT_ONCE, 'the fifth batch is never asked');
        assert.ok(seen.signals.every((signal) => signal.aborted));
    } finally {
        restore();
    }
});
