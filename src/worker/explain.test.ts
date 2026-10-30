// What a page asked, explained, in Node: the worker's pipeline against the
// end-to-end tests' stub RPC and token list, with the API answering the
// explanations it gave for the fixtures (recorded under test/fixtures). No
// browser and no live API: what goes out to each, and what the window gets.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { until } from '../../test/chrome.fake.ts';
import { explanation, feePayer, fixture, recorded, STAND_IN_TAG, startTestServer, type TestServer, words } from '../../test/server.ts';
import { MAX_TRANSACTION_BASE64, MAX_TRANSACTIONS } from '../shared/messages.ts';
import { type Entry, failure, type Row, requestError } from '../shared/model.ts';
import { DEFAULTS, type Settings } from '../shared/settings.ts';
import { explainTransactions, showMessage } from './explain.ts';
import { readerLocales } from './locale.ts';
import { base58Encode } from './solana.ts';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOURCE = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';
const PUMP_MINT = 'HMYd9tosnUXuNHmq7pXmoePRVBLBBjA3JBfydq6upump';
const BOB = { name: 'Bob', address: 'DV3BDugD4uSbnFBwEzy6Lg4RksvPEtVCazWNwjzcL7Qp' };
const OTHER_CONTACT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
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
        lookupAccounts: false,
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
    const refused: unknown[] = [undefined, 'AQID', [], ['not base64!'], [7], ['A'.repeat(MAX_TRANSACTION_BASE64 + 4)]];
    for (const transactions of refused) {
        const entry = await explainTransactions({ ...PAGE, transactions }, config({ simulate: true, lookupTokens: true }), [], []);
        assert.match(requestError(entry) ?? '', /transactions must be|longer than 4096 bytes/);
    }
    // Too many is said as such, not as a list that is not one.
    const many = await explainTransactions({ ...PAGE, transactions: Array(MAX_TRANSACTIONS + 1).fill('AQID') }, config(), [], []);
    assert.equal(requestError(many), `33 transactions in one request; SignLens explains at most ${MAX_TRANSACTIONS}`);
    assert.deepEqual(server.calls, []);
    assert.deepEqual(server.apiCalls, []);
});

test('past the API limit, the transactions after the one refused are not asked for, and each says why', async () => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    server.know(transfer);
    server.limitApi(explanation('ok'), explanation('ok'));
    const entry = await explainTransactions({ ...PAGE, transactions: Array(5).fill(transfer.base64) }, config({ simulate: true }), [], []);
    assert.deepEqual(
        entry.rows.map((row) => row.kind),
        ['explained', 'explained', 'failed', 'failed', 'failed'],
    );
    // The API asked three times: two explained, the third refused; nothing read for the two after.
    assert.equal(server.apiCalls.length, 3);
    const simulated = server.calls.filter((call) => call.method === 'simulateTransaction').length;
    assert.equal(simulated, 3);
    const [refused, skipped] = entry.rows.slice(2) as Extract<Row, { kind: 'failed' }>[];
    assert.equal(refused?.error, 'too many explanations; try again later');
    assert.equal(
        skipped?.error,
        'not explained: the SignLens API took no more explanations for now, from transaction 3 of 5 on; try again in a minute',
    );
    assert.ok(skipped?.capture, 'a transaction not explained can still be saved');
});

test('as many transactions as the limit are each explained, and as many of your addresses as the engine takes are sent', async () => {
    server.refuseApi(500);
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    const yours = Array.from({ length: 17 }, (_, i) => base58Encode(new Uint8Array(32).fill(i + 1)));
    const entry = await explainTransactions({ ...PAGE, transactions: Array(MAX_TRANSACTIONS).fill(transfer.base64) }, config(), [], yours);
    assert.equal(entry.rows.length, MAX_TRANSACTIONS);
    assert.equal(server.apiCalls.length, MAX_TRANSACTIONS);
    const sent = server.apiCalls[0]?.body as { own_keys?: string[] } | undefined;
    assert.deepEqual(sent?.own_keys, yours.slice(0, 16));
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
    const [call] = server.apiCalls;
    assert.ok(call);
    const { contacts, ...sent } = call.body as { contacts: { name: string; address: string }[] };
    assert.deepEqual(sent, {
        transaction: swap.base64,
        own_keys: [payer],
        loaded_writable: swap.writable,
        loaded_readonly: swap.readonly,
        render: true,
        // The reader's languages, as the browser lists them.
        locale: readerLocales(),
    });
    // The contact's address, its name a stand-in (contacts.ts).
    assert.deepEqual(
        contacts.map((contact) => contact.address),
        [BOB.address],
    );
    assert.match(contacts[0]?.name ?? '', /^\[\[contact-1-[0-9a-f]{16}\]\]$/);
    const row = rowOf(entry, 'explained');
    assert.equal(row?.verdict, 'blocked');
    assert.deepEqual(row?.summary, document.summary);
    assert.equal(row?.digest, document.raw.digest);
    assert.equal(row?.transaction, swap.base64);
    assert.match(row?.tables ?? '', /^\d lookup tables? read over RPC, unverified$/);
    assert.equal(row?.simulation, null);
    assert.match(row?.capture ?? '', /^# Captured by the SignLens extension before signing\.\n# origin: https:\/\/dapp\.example\n/);
    assert.match(row?.capture ?? '', new RegExp(`# signer: ${payer}\n# loaded-writable: ${swap.writable.join(' ')}\n`));
});

test('no name in the address book leaves the browser: each call of a request has the same stand-ins, and the names are put back in what the window shows', async () => {
    const drift = fixture('legacy_squads_drift_approve_execute');
    server.know(drift);
    const [proposal] = drift.accounts;
    assert.ok(proposal);
    // The engine writes a name as it was sent wherever it speaks of the address, as the stub writes this request's stand-in.
    const bob = `[[contact-1-${STAND_IN_TAG}]]`;
    const said = {
        summary: words(`Send 1 SOL to ${bob} (DV3B…L7Qp)`),
        findings: [
            { severity: 'high', code: 'LOOKALIKE_ADDRESS', message: words(`The recipient looks like ${bob} (DV3B…L7Qp)`), instruction: 0 },
        ],
        effects: [
            {
                type: 'revoke',
                value: {
                    subject: {
                        address: BOB.address,
                        label: words(`${bob}'s USDC account`),
                        label_trust: 'verified',
                        is_self: false,
                        stand_in: null,
                    },
                },
                message: words(`Revoke the delegate on ${bob}'s USDC account (DV3B…L7Qp) (verified)`),
            },
        ],
        text: `To: ${bob} (DV3B…L7Qp) (verified)`,
    };
    server.answerApi(explanation('warn', { ...said, ...wanting(proposal.address) }), explanation('warn', said));
    const alice = { name: 'Alice', address: OTHER_CONTACT };
    const entry = await explainTransactions({ ...PAGE, transactions: [drift.base64] }, config({ lookupAccounts: true }), [BOB, alice], []);
    assert.equal(server.apiCalls.length, 2);
    const books = server.apiCalls.map((call) => (call.body as { contacts: { name: string; address: string }[] }).contacts);
    for (const call of server.apiCalls) assert.ok(!/Bob|Alice/.test(JSON.stringify(call.body)), 'a name went to the API');
    assert.deepEqual(books[1], books[0]);
    assert.deepEqual(
        books[0]?.map((contact) => contact.address),
        [BOB.address, OTHER_CONTACT],
    );
    const row = rowOf(entry, 'explained');
    assert.equal(row.summary.text, 'Send 1 SOL to Bob (DV3B…L7Qp)');
    assert.equal(row.findings[0]?.message.text, 'The recipient looks like Bob (DV3B…L7Qp)');
    assert.deepEqual(row.effects[0], {
        type: 'revoke',
        value: {
            subject: { address: BOB.address, label: words("Bob's USDC account"), label_trust: 'verified', is_self: false, stand_in: null },
        },
        message: words("Revoke the delegate on Bob's USDC account (DV3B…L7Qp) (verified)"),
    });
    assert.equal(row.text, 'To: Bob (DV3B…L7Qp) (verified)');
    // A rating reports the summary without the name.
    assert.equal(row.reportedSummary, 'Send 1 SOL to a contact (DV3B…L7Qp)');
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
    const named = server.apiCalls[1]?.body as { token_hints?: unknown } | undefined;
    assert.deepEqual(named?.token_hints, [{ mint: PUMP_MINT, symbol: 'HMYD', decimals: 6 }]);
    const row = rowOf(entry, 'explained');
    assert.deepEqual(row?.hints, ['HMYD']);
    assert.deepEqual(row?.summary, (recorded('swap__sol_from_wallet.named_by_hint') as { summary: unknown }).summary);
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
    server.answerApi(first, { schema: 'signlens-api-error/1', error: { code: 'busy', message: 'every worker is busy' } });
    const row = rowOf(
        await explainTransactions({ ...PAGE, transactions: [swap.base64] }, config({ lookupTokens: true }), [], []),
        'explained',
    );
    assert.equal(server.apiCalls.length, 2, 'asked again with the name');
    assert.deepEqual(row.summary, first.summary);
    assert.deepEqual(row?.hints, []);
});

/** What an explanation that wants `addresses` adds to its document. */
function wanting(...addresses: string[]): { wanted_accounts: { address: string; reason: ReturnType<typeof words> }[] } {
    return { wanted_accounts: addresses.map((address) => ({ address, reason: words('what it holds would explain more') })) };
}

/** The `accounts` of each API call so far. */
function accountsSent(): unknown[] {
    return server.apiCalls.map((call) => (call.body as { accounts?: unknown }).accounts);
}

test('the accounts an explanation wants are read over the RPC and the API asked again with them, twice at most', async () => {
    const drift = fixture('legacy_squads_drift_approve_execute');
    server.know(drift);
    const [proposal, stored] = drift.accounts;
    assert.ok(proposal && stored);
    server.answerApi(
        explanation('block', wanting(proposal.address)),
        // The vault transaction's address comes from the proposal's index: wanted once the proposal is read.
        explanation('block', wanting(proposal.address, stored.address)),
        explanation('block', { summary: words('Approve proposal #7 (per your RPC)'), ...wanting(BOB.address) }),
    );
    const entry = await explainTransactions({ ...PAGE, transactions: [drift.base64] }, config({ lookupAccounts: true }), [], []);
    // Each read once, and no third round for what the last answer wants.
    assert.deepEqual(
        server.calls.map((call) => call.params?.[0]),
        [[proposal.address], [stored.address]],
    );
    assert.deepEqual(accountsSent(), [undefined, [proposal], [proposal, stored]]);
    const row = rowOf(entry, 'explained');
    assert.equal(row.summary.text, 'Approve proposal #7 (per your RPC)');
    assert.deepEqual(row.accounts, [proposal.address, stored.address]);
    // Saved as `signlens explain --read-accounts` reads it.
    assert.ok(row.capture.includes(`\n# account: ${proposal.address} ${proposal.owner} ${proposal.slot} ${proposal.data}\n`));
});

test('an account the RPC does not have, or cannot give, leaves the explanation as it was', async () => {
    const drift = fixture('legacy_squads_drift_approve_execute');
    const first = explanation('block', wanting(BOB.address));
    server.answerApi(first);
    const missing = rowOf(
        await explainTransactions({ ...PAGE, transactions: [drift.base64] }, config({ lookupAccounts: true }), [], []),
        'explained',
    );
    assert.equal(server.calls.length, 1);
    assert.equal(server.apiCalls.length, 1, 'asked again with nothing');
    assert.equal(missing.accounts, undefined);
    server.know(drift);
    server.refuse('getMultipleAccounts', 503, 'down');
    const refused = rowOf(
        await explainTransactions({ ...PAGE, transactions: [drift.base64] }, config({ lookupAccounts: true }), [], []),
        'explained',
    );
    assert.equal(server.apiCalls.length, 2);
    assert.equal(refused.accounts, undefined);
    assert.ok(!refused.capture.includes('# account:'));
});

test('if asking again with the accounts fails, the explanation before stands', async () => {
    const drift = fixture('legacy_squads_drift_approve_execute');
    server.know(drift);
    server.answerApi(explanation('block', { summary: words('Approve proposal #7'), ...wanting(drift.accounts[0]?.address ?? '') }), {
        schema: 'signlens-api-error/1',
        error: { code: 'busy', message: 'every worker is busy' },
    });
    const row = rowOf(
        await explainTransactions({ ...PAGE, transactions: [drift.base64] }, config({ lookupAccounts: true }), [], []),
        'explained',
    );
    assert.equal(server.apiCalls.length, 2);
    assert.equal(row.summary.text, 'Approve proposal #7');
    assert.equal(row.accounts, undefined);
});

test('with account lookup off, nothing is read and the API is asked once', async () => {
    const drift = fixture('legacy_squads_drift_approve_execute');
    server.know(drift);
    server.answerApi(explanation('block', wanting(drift.accounts[0]?.address ?? '')));
    const row = rowOf(await explainTransactions({ ...PAGE, transactions: [drift.base64] }, config(), [], []), 'explained');
    assert.deepEqual(server.calls, []);
    assert.equal(server.apiCalls.length, 1);
    assert.equal(row.accounts, undefined);
});

test('the names of unlisted tokens are asked for with the accounts read', async () => {
    const drift = fixture('legacy_squads_drift_approve_execute');
    server.know(drift);
    server.knowMint(PUMP_MINT, 'HMYD', 6);
    const [proposal] = drift.accounts;
    assert.ok(proposal);
    // Any explanation with an unnamed token will do: the API's answers are scripted.
    const unnamed = recorded('swap__sol_from_wallet.tables_read');
    server.answerApi({ ...unnamed, ...wanting(proposal.address) }, unnamed, recorded('swap__sol_from_wallet.named_by_hint'));
    const row = rowOf(
        await explainTransactions({ ...PAGE, transactions: [drift.base64] }, config({ lookupAccounts: true, lookupTokens: true }), [], []),
        'explained',
    );
    assert.deepEqual(accountsSent(), [undefined, [proposal], [proposal]]);
    assert.ok((server.apiCalls[2]?.body as { token_hints?: unknown } | undefined)?.token_hints);
    assert.deepEqual(row.hints, ['HMYD']);
    assert.deepEqual(row.accounts, [proposal.address]);
});

test("the API's error, or an explanation that does not hold together, is an error row that keeps the tables and the capture", async () => {
    const swap = fixture('swap__both_mints_named');
    server.know(swap);
    server.refuseApi(500);
    const busy = rowOf(await explainTransactions({ ...PAGE, transactions: [swap.base64] }, config(), [], []), 'failed');
    assert.equal(busy.error, 'every worker is busy; try again');
    assert.match(busy?.tables ?? '', /read over RPC/);
    assert.ok(busy?.capture);
    server.answerApi(explanation('ok', { effects: [{ type: 'transfer', value: {} }] }));
    const broken = rowOf(await explainTransactions({ ...PAGE, transactions: [swap.base64] }, config(), [], []), 'failed');
    assert.match(broken.error, /explanation\.effects\[0\]\.value\.from is not an object/);
});

test('the size limits are on the bytes: 4096 bytes of transaction pass, 4097 do not, and messages are bounded too', async () => {
    server.refuseApi(500);
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
