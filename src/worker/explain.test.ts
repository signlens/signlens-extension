// What a page asked, explained, in Node: the worker's pipeline against the
// end-to-end tests' stub RPC and token list, with the API answering the
// explanations it gave for the fixtures (recorded under e2e/fixtures). No
// browser and no live API: what goes out to each, and what the window gets.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { explanation, feePayer, fixture, recorded, startTestServer, type TestServer } from '../../e2e/server.ts';
import { MAX_TRANSACTION_BASE64, MAX_TRANSACTIONS } from '../shared/messages.ts';
import { type Entry, failure, type Row, requestError } from '../shared/model.ts';
import { DEFAULTS, type Settings } from '../shared/settings.ts';
import { until } from '../testing/chrome.fake.ts';
import { explainTransactions, showMessage } from './explain.ts';
import { base58Encode } from './solana.ts';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOURCE = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';
const PUMP_MINT = 'HMYd9tosnUXuNHmq7pXmoePRVBLBBjA3JBfydq6upump';
const BOB = { name: 'Bob', address: 'DV3BDugD4uSbnFBwEzy6Lg4RksvPEtVCazWNwjzcL7Qp' };
/** Where a request comes from, as the extension states it for every page request. */
const PAGE = { origin: 'https://dapp.example' };

// A stub of its own for each test: what one test taught it, or what the
// worker cached from it (lookup tables, token names, by endpoint), is not
// there for the next, whatever the order.
let server: TestServer;
beforeEach(async () => {
    server = await startTestServer();
});
afterEach(() => server.close());

/** The first row of `entry`, which must be of `kind`. */
function rowOf<K extends Row['kind']>(entry: Entry, kind: K): Extract<Row, { kind: K }> {
    const row = entry.rows[0];
    assert.equal(row?.kind, kind, JSON.stringify(row));
    return row as Extract<Row, { kind: K }>;
}

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

test("the stub's fee payer is the transaction's, legacy, v0 or v1, as the engine names it", () => {
    // The payers of the engine's recorded Fee effects, and of its own test of the v1 fixture.
    assert.equal(feePayer(fixture('legacy_durable_nonce_token_transfer').bytes), '8KvyzLR8fMXggYaxrdMX5921wwfoANcuSuV55a6Ap1fa');
    assert.equal(feePayer(fixture('swap__both_mints_named').bytes), '5yLgQQwD42seAkce1heScsh2spYgNA3q43SPhZBn8Ldc');
    assert.equal(feePayer(fixture('v1_mainnet_orca_bot').bytes), 'AXmnRBrNtYYyyo82cLBBhnWJ7o1iqNLZbuEVpDB3V666');
});

test('a request that is not a list of base64 transactions within bounds is refused before anyone is asked', async () => {
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
        const entry = await explainTransactions({ ...PAGE, transactions }, config({ simulate: true, lookupTokens: true }), [], []);
        assert.match(requestError(entry) ?? '', /transactions must be|longer than 4096 bytes/);
    }
    assert.deepEqual(server.calls, []);
    assert.deepEqual(server.apiCalls, []);
});

test('as many transactions as the limit are each explained, and as many of your addresses as the engine takes are sent', async () => {
    server.refuseApi(503);
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    const yours = Array.from({ length: 17 }, (_, i) => base58Encode(new Uint8Array(32).fill(i + 1)));
    const entry = await explainTransactions({ ...PAGE, transactions: Array(MAX_TRANSACTIONS).fill(transfer.base64) }, config(), [], yours);
    assert.equal(entry.rows.length, MAX_TRANSACTIONS);
    assert.equal(server.apiCalls.length, MAX_TRANSACTIONS);
    const sent = server.apiCalls[0]?.body as { ownKeys?: string[] } | undefined;
    assert.deepEqual(sent?.ownKeys, yours.slice(0, 16));
});

test('a transaction is explained with its lookup tables, the signer and the contacts, and the row keeps what the window needs', async () => {
    const swap = fixture('swap__both_mints_named');
    server.know(swap);
    const document = recorded('swap__both_mints_named') as { raw: { digest: string }; summary: string };
    server.answerApi(document);
    const payer = feePayer(swap.bytes);
    const entry = await explainTransactions(
        {
            transactions: [swap.base64],
            // As the extension states it: made printable where the message is read (messages.test.ts).
            origin: 'https://dapp.example',
            method: 'solana:signTransaction',
        },
        config(),
        [BOB],
        // Who "you" are is the caller's to say; one that is not an address is left out.
        [payer, 'not an address'],
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
    const row = rowOf(entry, 'explained');
    assert.equal(row?.verdict, 'blocked');
    assert.equal(row?.summary, document.summary);
    assert.equal(row?.digest, document.raw.digest);
    assert.equal(row?.transaction, swap.base64);
    assert.match(row?.tables ?? '', /^\d lookup tables? read over RPC, unverified$/);
    assert.equal(row?.simulation, null);
    assert.match(row?.capture ?? '', /^# Captured by the SignLens extension before signing\.\n# origin: https:\/\/dapp\.example\n/);
    assert.match(row?.capture ?? '', new RegExp(`# signer: ${payer}\n# loaded-writable: ${swap.writable.join(' ')}\n`));
});

test('the simulation goes with the request, as the balance changes of the accounts it may write', async () => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    const payer = feePayer(transfer.bytes);
    server.tokenAccount(SOURCE, payer, USDC, 5_000_000, 5_000_000 - 996_423);
    server.wallet(payer, 1_000_000_000, 1_000_000_000 - 12_218);
    server.answerApi(recorded('legacy_durable_nonce_token_transfer.simulated_to_contact'));
    const entry = await explainTransactions({ ...PAGE, transactions: [transfer.base64] }, config({ simulate: true }), [], [payer]);
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
    assert.equal(rowOf(entry, 'explained').simulation, '2 balance change(s), unverified');
});

test('the chain a page names is its word: the transaction is read and simulated all the same, and the name shown', async () => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    const payer = feePayer(transfer.bytes);
    server.tokenAccount(SOURCE, payer, USDC, 5_000_000, 5_000_000 - 996_423);
    server.wallet(payer, 1_000_000_000, 1_000_000_000 - 12_218);
    server.answerApi(recorded('legacy_durable_nonce_token_transfer.simulated_to_contact'));
    const entry = await explainTransactions(
        { ...PAGE, transactions: [transfer.base64], chains: ['solana:devnet'] },
        config({ simulate: true }),
        [],
        [payer],
    );
    // A page that called a mainnet drain "devnet" cannot keep the simulation from seeing it.
    assert.deepEqual(
        server.calls.map((c) => c.method),
        ['getMultipleAccounts', 'simulateTransaction'],
    );
    const sent = server.apiCalls[0]?.body as { simulation?: { changes: unknown[] } } | undefined;
    assert.equal(sent?.simulation?.changes.length, 2);
    assert.equal(rowOf(entry, 'explained').chain, 'solana:devnet');
    // Mainnet, or no name at all, is not worth a line.
    const plain = await explainTransactions({ ...PAGE, transactions: [transfer.base64], chains: ['solana:mainnet'] }, config(), [], []);
    assert.equal(rowOf(plain, 'explained').chain, undefined);
});

test('an unlisted token is named from the RPC and the token list, and the explanation asked for again with the name', async () => {
    const swap = fixture('swap__sol_from_wallet');
    server.know(swap);
    server.knowMint(PUMP_MINT, 'HMYD', 6);
    server.answerApi(recorded('swap__sol_from_wallet.tables_read'), recorded('swap__sol_from_wallet.named_by_hint'));
    const entry = await explainTransactions({ ...PAGE, transactions: [swap.base64] }, config({ lookupTokens: true }), [], []);
    assert.equal(server.apiCalls.length, 2);
    const named = server.apiCalls[1]?.body as { tokenHints?: unknown } | undefined;
    assert.deepEqual(named?.tokenHints, [{ mint: PUMP_MINT, symbol: 'HMYD', decimals: 6 }]);
    const row = rowOf(entry, 'explained');
    assert.deepEqual(row?.hints, ['HMYD']);
    assert.equal(row?.summary, (recorded('swap__sol_from_wallet.named_by_hint') as { summary: string }).summary);
});

test('an RPC or token list the settings would refuse is not asked, even when storage holds one', async () => {
    const swap = fixture('swap__sol_from_wallet');
    server.know(swap);
    server.knowMint(PUMP_MINT, 'HMYD', 6);
    server.answerApi(recorded('swap__sol_from_wallet.tables_read'));
    // `localhost.` reaches the stub, but is not one of the names plain http may go to.
    const refused = (url: string) => url.replace('//127.0.0.1:', '//localhost.:');
    const entry = await explainTransactions(
        { ...PAGE, transactions: [swap.base64] },
        config({ rpcUrl: refused(server.rpc), tokenApiUrl: refused(server.tokens), simulate: true, lookupTokens: true }),
        [],
        [],
    );
    assert.deepEqual(server.calls, []);
    const row = rowOf(entry, 'explained');
    const problem = 'the RPC address in the settings is not usable: plain http is for this machine only';
    assert.match(row?.tables ?? '', new RegExp(`not resolved \\(${problem}`));
    assert.match(row?.simulation ?? '', new RegExp(`^not run \\(${problem}`));
    assert.deepEqual(row?.hints, []);
});

test('a request whose page went is explained no further, and the call under way is given up', async () => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    server.delayApi(3_000);
    const page = new AbortController();
    const three = [transfer.base64, transfer.base64, transfer.base64];
    const started = Date.now();
    const explaining = explainTransactions({ ...PAGE, transactions: three }, config(), [], [], page.signal);
    // The page reloads while the first transaction is with the API.
    await until(() => server.apiCalls.length > 0);
    page.abort('the page closed or reloaded');
    assert.deepEqual(await explaining, failure('not explained: the page closed or reloaded'));
    assert.equal(server.apiCalls.length, 1);
    assert.ok(Date.now() - started < 1_500, 'waited for the API all the same');
});

test('if asking again with the names fails, the first explanation stands', async () => {
    const swap = fixture('swap__sol_from_wallet');
    server.know(swap);
    server.knowMint(PUMP_MINT, 'HMYD', 6);
    const first = recorded('swap__sol_from_wallet.tables_read') as { summary: string };
    server.answerApi(first, { schema: 'signlens-api/1', error: { code: 'busy', message: 'every worker is busy' } });
    const row = rowOf(
        await explainTransactions({ ...PAGE, transactions: [swap.base64] }, config({ lookupTokens: true }), [], []),
        'explained',
    );
    assert.equal(server.apiCalls.length, 2, 'asked again with the name');
    assert.equal(row.summary, first.summary);
    assert.deepEqual(row?.hints, []);
});

test("the API's error, or an explanation that does not hold together, is an error row that keeps the tables and the capture", async () => {
    const swap = fixture('swap__both_mints_named');
    server.know(swap);
    server.refuseApi(503);
    const busy = rowOf(await explainTransactions({ ...PAGE, transactions: [swap.base64] }, config(), [], []), 'failed');
    assert.equal(busy.error, 'every worker is busy; try again');
    assert.match(busy?.tables ?? '', /read over RPC/);
    assert.ok(busy?.capture);
    server.answerApi(explanation('Ok', { effects: [{ type: 'Transfer', value: {} }] }));
    const broken = rowOf(await explainTransactions({ ...PAGE, transactions: [swap.base64] }, config(), [], []), 'failed');
    assert.match(broken.error, /explanation\.effects\[0\]\.value\.from is not an object/);
});

test('the size limits are on the bytes: 4096 bytes of transaction pass, 4097 do not, and messages are bounded too', async () => {
    server.refuseApi(503);
    const of = (bytes: number) => Buffer.alloc(bytes, 1).toString('base64');
    // 4097 and 4098 bytes fit in as many base64 characters as 4096.
    assert.equal(of(4096).length, of(4098).length);
    for (const bytes of [4097, 4098]) {
        assert.deepEqual(
            await explainTransactions({ ...PAGE, transactions: [of(bytes)] }, config(), [], []),
            failure('a transaction is longer than 4096 bytes'),
        );
    }
    assert.equal(server.apiCalls.length, 0);
    const fits = await explainTransactions({ ...PAGE, transactions: [of(4096)] }, config(), [], []);
    // Explained, or not: but no longer refused as a whole.
    assert.equal(requestError(fits), undefined);
    assert.equal(server.apiCalls.length, 1);
    assert.deepEqual(showMessage({ ...PAGE, message: of(65_537) }), failure('the message is longer than 65536 bytes'));
    assert.deepEqual(showMessage({ ...PAGE, message: of(65_538) }), failure('the message is longer than 65536 bytes'));
    assert.deepEqual(showMessage({ ...PAGE, message: 'A'.repeat(10_000_000) }), failure('the message is longer than 65536 bytes'));
    assert.equal(rowOf(showMessage({ ...PAGE, message: of(65_536) }), 'message').text.length > 0, true);
});

test('a message is shown as it is: text as text, anything else as hex, and never with control characters', () => {
    const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
    assert.deepEqual(showMessage({ ...PAGE, message: encode(new TextEncoder().encode('Sign in to dapp.example\u0007')) }), {
        rows: [{ kind: 'message', text: 'Sign in to dapp.example?' }],
    });
    assert.deepEqual(showMessage({ ...PAGE, message: encode(new Uint8Array([0xff, 0x00])) }), {
        rows: [{ kind: 'message', text: '(2 bytes, not text) ff00' }],
    });
    assert.deepEqual(showMessage({ ...PAGE, message: '%%%' }), failure('the message is not base64'));
    assert.deepEqual(showMessage({ ...PAGE }), failure('message is required'));
});
