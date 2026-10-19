// A page's request answered, against a fake `chrome` and the stub API: it
// goes on at once only where nothing is to be asked, what SignLens would
// refuse waits for the user even with the window off, and every refusal
// says whose it was and why.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { explanation, startTestServer, type TestServer } from '../e2e/server.ts';
import { type FakeChrome, installFakeChrome, until } from './chrome.fake.ts';
import * as gate from './gate.ts';
import type { HistoryEntry } from './model.ts';
import { answerRequest } from './requests.ts';
import type { Settings } from './settings.ts';

const BOUNDED = { timeout: 5_000 };

let fake: FakeChrome;
let server: TestServer;
let tab = 100;
beforeEach(async () => {
    fake = installFakeChrome();
    server = await startTestServer();
    tab += 1;
});
afterEach(() => server.close());

/** The settings, pointed at the stub. */
async function configure(changes: Partial<Settings>): Promise<void> {
    await chrome.storage.local.set({
        apiUrl: server.api,
        rpcUrl: server.rpc,
        simulate: false,
        lookupTokens: false,
        mode: 'passthrough',
        ...changes,
    });
}

/** Asks to sign one (made-up) transaction from the tab. */
function sign(payload: Record<string, unknown> = {}) {
    return answerRequest({ type: 'explain', payload: { origin: 'https://dapp.example', transactions: ['AQID'], ...payload } }, tab);
}

/** The id the open window's request goes by. */
async function windowId(): Promise<string> {
    await until(() => fake.windows.size === 1);
    const [url] = [...fake.windows.values()];
    return new URL(url ?? '').searchParams.get('id') ?? '';
}

function history(): HistoryEntry[] {
    return (fake.session.history as HistoryEntry[] | undefined) ?? [];
}

test('with the window off, what SignLens would not refuse goes on at once, and the history has it undecided', BOUNDED, async () => {
    await configure({ gate: false });
    server.answerApi(explanation('Ok'));
    assert.deepEqual(await sign({ wallet: 'Phan\u0007tom ' }), { decision: 'continue' });
    assert.equal(fake.opened, 0);
    const [kept] = history();
    assert.equal(kept?.decision, undefined);
    assert.equal(kept?.rows[0]?.kind, 'explained');
    // The wallet the page named, without its control characters.
    assert.equal(kept?.wallet, 'Phan?tom');
    assert.equal(fake.badge, 'OK');
});

test('what SignLens would refuse waits for the user, the window off or not; their answer is theirs', BOUNDED, async () => {
    await configure({ gate: false });
    server.refuseApi(503);
    const asking = sign();
    gate.decide(await windowId(), 'reject');
    assert.deepEqual(await asking, { decision: 'reject' });
    assert.equal(history()[0]?.decision, 'reject');
    assert.equal(fake.badge, '?');
});

test('a request that cannot be explained at all says why once, and the user decides', BOUNDED, async () => {
    await configure({ gate: true });
    const asking = answerRequest({ type: 'explain', payload: { origin: 'https://dapp.example', transactions: 'not a list' } }, tab);
    gate.decide(await windowId(), 'continue');
    assert.deepEqual(await asking, { decision: 'continue', error: 'transactions must be a list of base64 strings' });
});

test('a second request from a tab still busy is refused by SignLens, with the reason, and asks no one', BOUNDED, async () => {
    await configure({ gate: true });
    const flight = gate.begin(tab);
    assert.ok(flight);
    try {
        assert.deepEqual(await sign(), { decision: 'reject', refused: 'still busy with an earlier request from this page' });
        assert.equal(fake.opened, 0);
        assert.equal(server.apiCalls.length, 0);
    } finally {
        gate.end(tab, flight);
    }
});

test('in watch mode, with the window off, a request is refused without asking: nothing can be signed', BOUNDED, async () => {
    await configure({ gate: false, mode: 'watch', address: 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg' });
    server.answerApi(explanation('Ok'));
    assert.deepEqual(await sign({ wallet: 'Phantom' }), { decision: 'reject' });
    assert.equal(fake.opened, 0);
    // Nothing to decide, and no wallet behind it.
    assert.equal(history()[0]?.decision, undefined);
    assert.equal(history()[0]?.wallet, undefined);
});

test('without its settings, SignLens refuses, and says so', BOUNDED, async () => {
    chrome.storage.local.get = (async () => {
        throw new Error('storage is gone');
    }) as typeof chrome.storage.local.get;
    assert.deepEqual(await sign(), { decision: 'reject', refused: 'could not read its settings: storage is gone' });
});
