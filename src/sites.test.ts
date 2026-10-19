// Who may see the watched address, against a fake `chrome`: a site sees it
// only once the user allows it, the answer is kept for that site and that
// address, a silent connect never asks, and a refusal remembers nothing.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { type FakeChrome, installFakeChrome, until } from './chrome.fake.ts';
import * as gate from './gate.ts';
import type { ConnectReply } from './messages.ts';
import { DEFAULTS, type Settings } from './settings.ts';
import { approvals, approve, connectWatch, revoke } from './sites.ts';

const A = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const B = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const DAPP = 'https://dapp.example';
const WATCHING: Settings = { ...DEFAULTS, mode: 'watch', address: A };
const BOUNDED = { timeout: 2_000 };

let fake: FakeChrome;
let tab = 0;
beforeEach(() => {
    fake = installFakeChrome();
    tab += 1;
});

/** The consent window that is open: its request, and the id the worker knows it by. */
async function consentWindow(): Promise<{ windowId: number; id: string; request: unknown }> {
    await until(() => fake.windows.size === 1);
    const [[windowId, url]] = [...fake.windows] as [[number, string]];
    assert.match(url, /\/connect\.html\?id=/);
    const id = new URL(url).searchParams.get('id') ?? '';
    return { windowId, id, request: fake.session[`pending:${id}`] };
}

function granted(reply: ConnectReply): string | null {
    return reply.approved ? reply.address : null;
}

test('the approvals are kept per site and per address, and taken back the same way', async () => {
    await approve(DAPP, A, 1);
    await approve(DAPP, B, 2);
    await approve('https://other.example', A, 3);
    await approve(DAPP, A, 4);
    assert.deepEqual(
        (await approvals()).map((a) => [a.origin, a.address, a.at]),
        [
            [DAPP, B, 2],
            ['https://other.example', A, 3],
            [DAPP, A, 4],
        ],
    );
    await revoke(DAPP, A);
    assert.deepEqual(
        (await approvals()).map((a) => [a.origin, a.address]),
        [
            [DAPP, B],
            ['https://other.example', A],
        ],
    );
});

test('a site the user allows sees the address, and is not asked again', BOUNDED, async () => {
    const asking = connectWatch({ origin: DAPP }, tab, WATCHING);
    const { id, request } = await consentWindow();
    assert.deepEqual(request, { origin: DAPP, address: A });
    assert.equal(gate.decide(id, 'continue'), true);
    const reply = await asking;
    assert.equal(granted(reply), A);
    assert.equal(reply.approved && reply.publicKey.length, 32);
    assert.equal(fake.windows.size, 0);
    // Asked again, loudly or silently, it is answered without a window.
    assert.equal(granted(await connectWatch({ origin: DAPP }, tab, WATCHING)), A);
    assert.equal(granted(await connectWatch({ origin: DAPP, silent: true }, tab, WATCHING)), A);
    assert.equal(fake.windows.size, 0);
});

test('denying, or closing the window, refuses and remembers nothing', BOUNDED, async () => {
    const denied = connectWatch({ origin: DAPP }, tab, WATCHING);
    gate.decide((await consentWindow()).id, 'reject');
    assert.deepEqual(await denied, { approved: false, error: 'the connection was refused in SignLens' });
    const closed = connectWatch({ origin: DAPP }, tab, WATCHING);
    fake.closeWindow((await consentWindow()).windowId);
    assert.deepEqual(await closed, { approved: false, error: 'the connection was refused in SignLens' });
    assert.deepEqual(await approvals(), []);
});

test('a silent connect never opens a window, and says nothing of why', async () => {
    assert.deepEqual(await connectWatch({ origin: DAPP, silent: true }, tab, WATCHING), { approved: false });
    assert.deepEqual(await connectWatch({ origin: DAPP, silent: true }, tab, { ...WATCHING, address: '' }), { approved: false });
    assert.equal(fake.windows.size, 0);
});

test('allowing one address is not allowing another, nor another site', BOUNDED, async () => {
    await approve(DAPP, A);
    assert.equal(granted(await connectWatch({ origin: DAPP }, tab, WATCHING)), A);
    assert.deepEqual(await connectWatch({ origin: DAPP, silent: true }, tab, { ...WATCHING, address: B }), { approved: false });
    assert.deepEqual(await connectWatch({ origin: 'https://dapp.example.evil', silent: true }, tab, WATCHING), { approved: false });
    const asking = connectWatch({ origin: DAPP }, tab, { ...WATCHING, address: B });
    assert.deepEqual((await consentWindow()).request, { origin: DAPP, address: B });
    fake.closeWindow((await consentWindow()).windowId);
    await asking;
});

test('outside watch mode, without an address, or while the tab asks something else, nothing is shown', async () => {
    assert.deepEqual(await connectWatch({ origin: DAPP }, tab, { ...WATCHING, mode: 'passthrough' }), {
        approved: false,
        error: 'SignLens is not in watch mode',
    });
    const none = await connectWatch({ origin: DAPP }, tab, { ...WATCHING, address: 'EPjF' });
    assert.equal(none.approved, false);
    assert.match(none.approved ? '' : (none.error ?? ''), /enter the address to watch/);
    const busy = gate.begin(tab);
    assert.ok(busy);
    const reply = await connectWatch({ origin: DAPP }, tab, WATCHING);
    gate.end(tab);
    assert.match(reply.approved ? '' : (reply.error ?? ''), /still busy/);
    assert.equal(fake.windows.size, 0);
});

test('a page with no address of its own (a sandboxed page, origin "null") is never shown the address', async () => {
    // Even had someone allowed "null" once: it would stand for every sandboxed page there is.
    await approve('null', A);
    for (const origin of ['null', 'chrome-extension://abc', 'file://', 'https://dapp.example/path', '']) {
        assert.deepEqual(await connectWatch({ origin }, tab, WATCHING), {
            approved: false,
            error: 'this page has no address of its own to allow',
        });
        assert.deepEqual(await connectWatch({ origin, silent: true }, tab, WATCHING), { approved: false });
    }
    assert.equal(fake.windows.size, 0);
});
