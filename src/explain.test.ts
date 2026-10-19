// What a page asked, explained, in Node: the worker's pipeline against the
// end-to-end tests' stub RPC and token list, with the API answering the
// explanations it gave for the fixtures (recorded under e2e/fixtures). No
// browser and no live API: what goes out to each, and what the window gets.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { explanation, feePayer, fixture, recorded, startTestServer, type TestServer } from '../e2e/server.ts';
import { explainTransactions, showMessage } from './explain.ts';
import { MAX_TRANSACTION_BASE64, MAX_TRANSACTIONS } from './messages.ts';
import { DEFAULTS, type Settings } from './settings.ts';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOURCE = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';
const PUMP_MINT = 'HMYd9tosnUXuNHmq7pXmoePRVBLBBjA3JBfydq6upump';
const BOB = { name: 'Bob', address: 'DV3BDugD4uSbnFBwEzy6Lg4RksvPEtVCazWNwjzcL7Qp' };

let server: TestServer;
before(async () => {
    server = await startTestServer();
});
after(() => server.close());

/** The settings, pointed at the stub, with only `changes` on. */
function config(changes: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULTS,
        apiUrl: server.api,
        rpcUrl: server.rpc,
        tokenApiUrl: server.tokens,
        simulate: false,
        lookupTokens: false,
        ...changes,
    };
}

/** Forgets the calls the stub saw, so each test counts its own. */
function fresh(): void {
    server.calls.length = 0;
    server.apiCalls.length = 0;
}

test('a request that is not a list of base64 transactions within bounds is refused before anyone is asked', async () => {
    fresh();
    const refused: unknown[] = [
        undefined,
        'AQID',
        [],
        ['not base64!'],
        [7],
        Array(MAX_TRANSACTIONS + 1).fill('AQID'),
        ['A'.repeat(MAX_TRANSACTION_BASE64 + 4)],
    ];
    for (const transactions of refused) {
        const entry = await explainTransactions({ transactions }, config({ simulate: true, lookupTokens: true }), []);
        assert.match(entry.error ?? '', /transactions must be|longer than 4096 bytes/);
    }
    assert.deepEqual(server.calls, []);
    assert.deepEqual(server.apiCalls, []);
});

test('a transaction is explained with its lookup tables, the signer and the contacts, and the row keeps what the window needs', async () => {
    fresh();
    const swap = fixture('swap__both_mints_named');
    server.know(swap);
    const document = recorded('swap__both_mints_named') as { raw: { digest: string }; summary: string };
    server.answerApi(document);
    const payer = feePayer(swap.bytes);
    const entry = await explainTransactions(
        {
            transactions: [swap.base64],
            accounts: [payer, 'not an address'],
            origin: 'https://dapp.example\u0000',
            method: 'solana:signTransaction',
        },
        config(),
        [BOB],
    );
    assert.deepEqual(
        server.calls.map((c) => c.method),
        ['getMultipleAccounts'],
    );
    assert.deepEqual(server.apiCalls[0]?.body, {
        transaction: swap.base64,
        ownKeys: [payer],
        loadedWritable: swap.writable,
        loadedReadonly: swap.readonly,
        contacts: [BOB],
        render: true,
    });
    const row = entry.results?.[0];
    assert.equal(row?.verdict, 'blocked');
    assert.equal(row?.summary, document.summary);
    assert.equal(row?.digest, document.raw.digest);
    assert.equal(row?.transaction, swap.base64);
    assert.match(row?.tables ?? '', /^\d lookup tables? read over RPC, unverified$/);
    assert.equal(row?.simulation, 'off');
    assert.match(row?.capture ?? '', /^# Captured by the SignLens extension before signing\.\n# origin: https:\/\/dapp\.example\?\n/);
    assert.match(row?.capture ?? '', new RegExp(`# signer: ${payer}\n# loaded-writable: ${swap.writable.join(' ')}\n`));
});

test('the simulation goes with the request, as the balance changes of the accounts it may write', async () => {
    fresh();
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    const payer = feePayer(transfer.bytes);
    server.tokenAccount(SOURCE, payer, USDC, 5_000_000, 5_000_000 - 996_423);
    server.wallet(payer, 1_000_000_000, 1_000_000_000 - 12_218);
    server.answerApi(recorded('legacy_durable_nonce_token_transfer.simulated_to_contact'));
    const entry = await explainTransactions({ transactions: [transfer.base64], accounts: [payer] }, config({ simulate: true }), []);
    assert.deepEqual(
        server.calls.map((c) => c.method),
        ['getMultipleAccounts', 'simulateTransaction'],
    );
    const sent = server.apiCalls[0]?.body as { simulation: { failure: unknown; units: unknown; changes: unknown[] } };
    assert.equal(sent.simulation.failure, null);
    assert.equal(sent.simulation.units, 4200);
    assert.deepEqual(
        new Set(sent.simulation.changes.map((c) => JSON.stringify(c))),
        new Set([
            JSON.stringify({ account: payer, delta: '-12218' }),
            JSON.stringify({ account: SOURCE, owner: payer, mint: USDC, delta: '-996423' }),
        ]),
    );
    assert.equal(entry.results?.[0]?.simulation, '2 balance change(s), unverified');
});

test('the chain a page names is its word: the transaction is read and simulated all the same, and the name shown', async () => {
    fresh();
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    const payer = feePayer(transfer.bytes);
    server.tokenAccount(SOURCE, payer, USDC, 5_000_000, 5_000_000 - 996_423);
    server.wallet(payer, 1_000_000_000, 1_000_000_000 - 12_218);
    server.answerApi(recorded('legacy_durable_nonce_token_transfer.simulated_to_contact'));
    const entry = await explainTransactions(
        { transactions: [transfer.base64], accounts: [payer], chains: ['solana:devnet'] },
        config({ simulate: true }),
        [],
    );
    // A page that called a mainnet drain "devnet" cannot keep the simulation from seeing it.
    assert.deepEqual(
        server.calls.map((c) => c.method),
        ['getMultipleAccounts', 'simulateTransaction'],
    );
    const sent = server.apiCalls[0]?.body as { simulation?: { changes: unknown[] } } | undefined;
    assert.equal(sent?.simulation?.changes.length, 2);
    assert.equal(entry.results?.[0]?.chain, 'solana:devnet');
    // Mainnet, or no name at all, is not worth a line.
    fresh();
    const plain = await explainTransactions({ transactions: [transfer.base64], chains: ['solana:mainnet'] }, config(), []);
    assert.equal(plain.results?.[0]?.chain, undefined);
});

test('an unlisted token is named from the RPC and the token list, and the explanation asked for again with the name', async () => {
    fresh();
    const swap = fixture('swap__sol_from_wallet');
    server.know(swap);
    server.knowMint(PUMP_MINT, 'HMYD', 6);
    server.answerApi(recorded('swap__sol_from_wallet.tables_read'), recorded('swap__sol_from_wallet.named_by_hint'));
    const entry = await explainTransactions({ transactions: [swap.base64] }, config({ lookupTokens: true }), []);
    assert.equal(server.apiCalls.length, 2);
    const named = server.apiCalls[1]?.body as { tokenHints?: unknown } | undefined;
    assert.deepEqual(named?.tokenHints, [{ mint: PUMP_MINT, symbol: 'HMYD', decimals: 6 }]);
    const row = entry.results?.[0];
    assert.deepEqual(row?.hints, ['HMYD']);
    assert.equal(row?.summary, (recorded('swap__sol_from_wallet.named_by_hint') as { summary: string }).summary);
});

test('if asking again with the names fails, the first explanation stands', async () => {
    fresh();
    const swap = fixture('swap__sol_from_wallet');
    server.know(swap);
    server.knowMint(PUMP_MINT, 'HMYD', 6);
    const first = recorded('swap__sol_from_wallet.tables_read') as { summary: string };
    server.answerApi(first, { schema: 'signlens-api/1', error: { code: 'busy', message: 'every worker is busy' } });
    const row = (await explainTransactions({ transactions: [swap.base64] }, config({ lookupTokens: true }), [])).results?.[0];
    assert.equal(server.apiCalls.length, 2, 'asked again with the name');
    assert.equal(row?.error, null);
    assert.equal(row?.summary, first.summary);
    assert.deepEqual(row?.hints, []);
});

test("the API's error, or an explanation that does not hold together, is an error row that keeps the tables and the capture", async () => {
    fresh();
    const swap = fixture('swap__both_mints_named');
    server.know(swap);
    server.refuseApi(503);
    const busy = (await explainTransactions({ transactions: [swap.base64] }, config(), [])).results?.[0];
    assert.equal(busy?.verdict, null);
    assert.equal(busy?.error, 'every worker is busy; try again');
    assert.match(busy?.tables ?? '', /read over RPC/);
    assert.ok(busy?.capture);
    server.answerApi(explanation('Ok', { effects: [{ type: 'Transfer', value: {} }] }));
    const broken = (await explainTransactions({ transactions: [swap.base64] }, config(), [])).results?.[0];
    assert.match(broken?.error ?? '', /explanation\.effects\[0\]\.value\.from is not an object/);
});

test('the size limits are on the bytes: 4096 bytes of transaction pass, 4097 do not, and messages are bounded too', async () => {
    fresh();
    server.refuseApi(503);
    const of = (bytes: number) => Buffer.alloc(bytes, 1).toString('base64');
    // 4097 and 4098 bytes fit in as many base64 characters as 4096.
    assert.equal(of(4096).length, of(4098).length);
    for (const bytes of [4097, 4098]) {
        assert.deepEqual(await explainTransactions({ transactions: [of(bytes)] }, config(), []), {
            error: 'a transaction is longer than 4096 bytes',
        });
    }
    assert.equal(server.apiCalls.length, 0);
    const fits = await explainTransactions({ transactions: [of(4096)] }, config(), []);
    assert.equal(fits.error, undefined);
    assert.equal(server.apiCalls.length, 1);
    assert.deepEqual(showMessage({ message: of(65_537) }), { error: 'the message is longer than 65536 bytes' });
    assert.deepEqual(showMessage({ message: of(65_538) }), { error: 'the message is longer than 65536 bytes' });
    assert.deepEqual(showMessage({ message: 'A'.repeat(10_000_000) }), { error: 'the message is longer than 65536 bytes' });
    assert.ok('text' in showMessage({ message: of(65_536) }));
});

test('a message is shown as it is: text as text, anything else as hex, and never with control characters', () => {
    const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
    assert.deepEqual(showMessage({ message: encode(new TextEncoder().encode('Sign in to dapp.example\u0007')) }), {
        text: 'Sign in to dapp.example?',
    });
    assert.deepEqual(showMessage({ message: encode(new Uint8Array([0xff, 0x00])) }), { text: '(2 bytes, not text) ff00' });
    assert.deepEqual(showMessage({ message: '%%%' }), { error: 'the message is not base64' });
    assert.deepEqual(showMessage({}), { error: 'message is required' });
});
