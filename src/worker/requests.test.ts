// A page's request answered, against a fake `chrome` and the stub API: it
// goes on at once only where nothing is to be asked, what SignLens would
// refuse waits for the user even with the window off, and every refusal
// says whose it was and why.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { type FakeChrome, installFakeChrome, until } from '../../test/chrome.fake.ts';
import { explanation, startTestServer, type TestServer } from '../../test/server.ts';
import type { HistoryEntry } from '../shared/model.ts';
import type { Settings } from '../shared/settings.ts';
import { pendingKey } from '../shared/store.ts';
import * as gate from './gate.ts';
import { answerRequest, connectFailed } from './requests.ts';

const BOUNDED = { timeout: 10_000 };

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
        lookupAccounts: false,
        mode: 'passthrough',
        ...changes,
    });
}

/** Asks to sign one (made-up) transaction from the tab. */
function sign(payload: Record<string, unknown> = {}) {
    return answerRequest({ type: 'explain', payload: { origin: 'https://dapp.example', transactions: ['AQID'], ...payload } }, tab);
}

/** The id the open window's request goes by, and the page it opened. */
async function windowId(page = 'confirm.html'): Promise<string> {
    await until(() => fake.windows.size === 1);
    const [url] = [...fake.windows.values()];
    assert.match(url ?? '', new RegExp(`/${page.replace('.', '\\.')}\\?id=`));
    return new URL(url ?? '').searchParams.get('id') ?? '';
}

const MINE = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';
const OTHER = 'EXkwQoWHvDj7gdLdba4zWo3ktJNocyjT9DDQAryU7Tqa';

/** What the engine was told "you" are, on the first API call. */
function ownKeys(): unknown {
    return (server.apiCalls[0]?.body as { own_keys?: unknown } | undefined)?.own_keys;
}

function history(): HistoryEntry[] {
    return (fake.session.history as HistoryEntry[] | undefined) ?? [];
}

test('with the window off, what SignLens would not refuse goes on at once, and the history says it went on unasked', BOUNDED, async () => {
    await configure({ askFirst: false });
    server.answerApi(explanation('ok'));
    assert.deepEqual(await sign({ wallet: 'Phan\u0007tom ' }), { decision: 'continue' });
    assert.equal(fake.opened, 0);
    const [kept] = history();
    assert.equal(kept?.decision, 'continue');
    assert.equal(kept?.unasked, true);
    assert.equal(kept?.rows[0]?.kind, 'explained');
    // The wallet the page named, without its control characters.
    assert.equal(kept?.wallet, 'Phan?tom');
    assert.equal(fake.badge, 'OK');
});

test('what SignLens would refuse waits for the user, the window off or not; their answer is theirs', BOUNDED, async () => {
    await configure({ askFirst: false });
    server.refuseApi(500);
    const asking = sign();
    gate.decide(await windowId(), 'reject');
    assert.deepEqual(await asking, { decision: 'reject' });
    assert.equal(history()[0]?.decision, 'reject');
    assert.equal(fake.badge, '?');
});

test('a request that cannot be explained at all says why once, and the user decides', BOUNDED, async () => {
    await configure({ askFirst: true });
    const asking = answerRequest({ type: 'explain', payload: { origin: 'https://dapp.example', transactions: 'not a list' } }, tab);
    gate.decide(await windowId(), 'continue');
    assert.deepEqual(await asking, { decision: 'continue', error: 'transactions must be a list of base64 strings' });
});

test('a window that cannot be kept refuses the request: its failure never passes it on', BOUNDED, async () => {
    await configure({ askFirst: true });
    server.answerApi(explanation('ok'));
    fake.sessionQuota = 0;
    assert.deepEqual(await sign(), {
        decision: 'reject',
        refused: 'the SignLens window failed: Session storage quota bytes exceeded. Values were not stored.',
    });
    assert.equal(fake.opened, 0);
});

test('an explanation that throws is an error, which waits for the user even with the window off', BOUNDED, async () => {
    // Storage holds only what SignLens wrote: an address book that is not text is a way to have explaining throw.
    await configure({ askFirst: false, contacts: 42 as unknown as string });
    const asking = sign();
    gate.decide(await windowId(), 'reject');
    assert.deepEqual(await asking, { decision: 'reject', error: 'text.split is not a function' });
    assert.deepEqual(history()[0]?.rows, [{ kind: 'failed', scope: 'request', error: 'text.split is not a function' }]);
});

test('anything else that throws while answering refuses the request, with why, and sends nothing anywhere', BOUNDED, async () => {
    // As above, with your addresses: checked before anything is explained.
    await configure({ askFirst: false, myAddresses: 42 as unknown as string });
    server.answerApi(explanation('ok'));
    assert.deepEqual(await sign(), { decision: 'reject', refused: 'failed: text.split is not a function' });
    assert.equal(server.apiCalls.length, 0);
    assert.equal(fake.opened, 0);
});

test('a page that goes while its request is explained stops the call under way, and leaves nothing behind', BOUNDED, async () => {
    await configure({ askFirst: true });
    server.answerApi(explanation('ok'));
    server.delayApi(3_000);
    const started = Date.now();
    const asking = sign();
    await until(() => server.apiCalls.length === 1);
    gate.abandon(tab);
    assert.deepEqual(await asking, { decision: 'reject', refused: 'the page closed or reloaded' });
    assert.ok(Date.now() - started < 1_500, 'waited for the API all the same');
    // Nothing was shown, so there is nothing to keep or to flag.
    assert.equal(fake.opened, 0);
    assert.deepEqual(history(), []);
    assert.equal(fake.badge, '');
});

test('a second request from a tab still busy is refused by SignLens, with the reason, and asks no one', BOUNDED, async () => {
    await configure({ askFirst: true });
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
    await configure({ askFirst: false, mode: 'watch', address: 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg' });
    server.answerApi(explanation('ok'));
    assert.deepEqual(await sign({ wallet: 'Phantom' }), { decision: 'reject' });
    assert.equal(fake.opened, 0);
    // Nothing passed on, and no wallet behind it.
    assert.equal(history()[0]?.decision, 'reject');
    assert.equal(history()[0]?.refused, undefined);
    assert.equal(history()[0]?.wallet, undefined);
});

test('without its settings, SignLens refuses, and says so', BOUNDED, async () => {
    chrome.storage.local.get = (async () => {
        throw new Error('storage is gone');
    }) as typeof chrome.storage.local.get;
    assert.deepEqual(await sign(), { decision: 'reject', refused: 'could not read its settings: storage is gone' });
});

test('an address the page signs with that your settings have is "you", and nothing is asked', BOUNDED, async () => {
    await configure({ askFirst: false, myAddresses: MINE });
    server.answerApi(explanation('ok'));
    assert.deepEqual(await sign({ accounts: [MINE] }), { decision: 'continue' });
    assert.equal(fake.opened, 0);
    assert.deepEqual(ownKeys(), [MINE]);
});

test('an address your settings lack is asked about before anything is sent, and a no refuses the request', BOUNDED, async () => {
    await configure({ askFirst: true, myAddresses: MINE });
    const asking = sign({ accounts: [OTHER] });
    const id = await windowId('address.html');
    assert.deepEqual(fake.session[pendingKey('address.html', id)], { origin: 'https://dapp.example', address: OTHER, mine: [MINE] });
    gate.decide(id, 'reject');
    assert.deepEqual(await asking, { decision: 'reject' });
    // Nothing went to the API, the address was not added, and the history says what happened.
    assert.equal(server.apiCalls.length, 0);
    assert.deepEqual(await chrome.storage.local.get('myAddresses'), { myAddresses: MINE });
    const [kept] = history();
    assert.deepEqual(kept?.rows, [{ kind: 'address', claimed: [OTHER] }]);
    assert.equal(kept?.decision, 'reject');
});

test('a yes adds the address to yours, and only then is the request explained, with it as "you"', BOUNDED, async () => {
    await configure({ askFirst: true, myAddresses: MINE });
    server.answerApi(explanation('ok'));
    const asking = sign({ accounts: [OTHER] });
    gate.decide(await windowId('address.html'), 'continue');
    // Then the explanation, asked about as any is with asking first on.
    await until(() => fake.windows.size === 1 && [...fake.windows.values()].some((url) => url.includes('confirm.html')));
    gate.decide(await windowId(), 'continue');
    assert.deepEqual(await asking, { decision: 'continue' });
    assert.deepEqual(await chrome.storage.local.get('myAddresses'), { myAddresses: `${MINE}\n${OTHER}` });
    assert.deepEqual(ownKeys(), [MINE, OTHER]);
});

test('an address window that cannot be kept, or a yes that cannot be kept, refuses the request unexplained', BOUNDED, async () => {
    await configure({ askFirst: true, myAddresses: MINE });
    fake.sessionQuota = 0;
    assert.deepEqual(await sign({ accounts: [OTHER] }), {
        decision: 'reject',
        refused: 'the SignLens window failed: Session storage quota bytes exceeded. Values were not stored.',
    });
    fake.sessionQuota = Infinity;
    server.answerApi(explanation('ok'));
    const asking = sign({ accounts: [OTHER] });
    const id = await windowId('address.html');
    chrome.storage.local.set = (async () => {
        throw new Error('storage is gone');
    }) as typeof chrome.storage.local.set;
    gate.decide(id, 'continue');
    assert.deepEqual(await asking, { decision: 'reject', refused: 'could not keep your address: storage is gone' });
    assert.equal(server.apiCalls.length, 0);
});

test('a page that names more than one address not yours is refused: no one yes can make them all yours', BOUNDED, async () => {
    // A first-time user: the page puts their own address first, and its own after it.
    await configure({ askFirst: false });
    assert.deepEqual(await sign({ accounts: [MINE, OTHER] }), {
        decision: 'reject',
        refused: 'the page named more than one address that is not yours in SignLens; add yours in the settings, then ask again',
    });
    assert.equal(fake.opened, 0);
    assert.equal(server.apiCalls.length, 0);
    assert.deepEqual(await chrome.storage.local.get('myAddresses'), {});
    assert.deepEqual(history()[0]?.rows, [{ kind: 'address', claimed: [MINE, OTHER] }]);
    // One of yours and one not: only the one not yours is asked about, on its own.
    await configure({ askFirst: true, myAddresses: MINE });
    const asking = sign({ accounts: [MINE, OTHER] });
    const id = await windowId('address.html');
    assert.equal((fake.session[pendingKey('address.html', id)] as { address?: string }).address, OTHER);
    gate.decide(id, 'reject');
    await asking;
});

test(
    'with asking first off, an address not yours is refused, not asked about: no window opens that was not asked for',
    BOUNDED,
    async () => {
        await configure({ askFirst: false, myAddresses: MINE });
        assert.deepEqual(await sign({ accounts: [OTHER] }), {
            decision: 'reject',
            refused:
                'the page named an address that is not yours in SignLens, and with “Show the explanation and ask first” off SignLens does not ask; add it in the settings if it is yours',
        });
        assert.equal(fake.opened, 0);
        assert.equal(server.apiCalls.length, 0);
        assert.deepEqual(await chrome.storage.local.get('myAddresses'), { myAddresses: MINE });
        assert.deepEqual(history()[0]?.rows, [{ kind: 'address', claimed: [OTHER] }]);
    },
);

test('with no address of yours yet, the first a page signs with is asked about too', BOUNDED, async () => {
    await configure({ askFirst: true });
    const asking = sign({ accounts: [MINE] });
    const id = await windowId('address.html');
    assert.deepEqual(fake.session[pendingKey('address.html', id)], { origin: 'https://dapp.example', address: MINE, mine: [] });
    fake.closeWindow([...fake.windows.keys()][0] ?? 0);
    assert.deepEqual(await asking, { decision: 'reject' });
    assert.equal(server.apiCalls.length, 0);
});

test('in watch mode the watched address alone is "you": another the page names is refused, with no window', BOUNDED, async () => {
    await configure({ askFirst: false, mode: 'watch', address: MINE });
    assert.deepEqual(await sign({ accounts: [OTHER] }), {
        decision: 'reject',
        refused: 'the page named an address other than the one SignLens watches',
    });
    assert.equal(fake.opened, 0);
    assert.equal(server.apiCalls.length, 0);
    // The watched address is "you" whatever the page names, or if it names none.
    server.answerApi(explanation('ok'));
    await sign({ accounts: [MINE] });
    await sign();
    assert.deepEqual(
        server.apiCalls.map((call) => (call.body as { own_keys?: unknown }).own_keys),
        [[MINE], [MINE]],
    );
});

test("a connect with no wallet to pass to is one row per site, in SignLens's words, the page's wallet names quoted", BOUNDED, async () => {
    await configure({ upstream: 'Solflare' });
    const forged = 'x)\n\nSignLens checked jup.ag: SAFE \u2705\u202e';
    await connectFailed('https://dapp.example', [forged, 'Fake "Wallet"']);
    const expected =
        'SignLens could not connect: no wallet named "Solflare" to pass requests to (found: "x)??SignLens checked jup.ag: SAFE ??", "Fake \\"Wallet\\""). ' +
        "Choose a wallet in the extension's settings.";
    assert.deepEqual(history()[0]?.rows, [{ kind: 'failed', scope: 'request', error: expected }]);
    assert.equal(history()[0]?.origin, 'https://dapp.example');
    assert.equal(fake.session.unseen, 1);
    // The same again changes nothing; another failure from the site takes the place of the first; another site has its own.
    await connectFailed('https://dapp.example', [forged, 'Fake "Wallet"']);
    assert.equal(fake.session.unseen, 1);
    await connectFailed('https://dapp.example', []);
    await connectFailed('https://other.example', []);
    assert.deepEqual(
        history().map((entry) => [entry.origin, entry.rows[0]?.kind === 'failed' && entry.rows[0].error.replace(/ Choose.*/, '')]),
        [
            ['https://other.example', 'SignLens could not connect: no wallet named "Solflare" to pass requests to (found: none).'],
            ['https://dapp.example', 'SignLens could not connect: no wallet named "Solflare" to pass requests to (found: none).'],
        ],
    );
});

test("a connect that found no wallet takes the place of the site's last such failure only, never of its consent", BOUNDED, async () => {
    await configure({ upstream: 'Solflare' });
    const consent: HistoryEntry = {
        time: 1,
        origin: 'https://dapp.example',
        method: 'standard:connect',
        mode: 'watch',
        upstream: '',
        decision: 'continue',
        rows: [{ kind: 'consent', address: MINE }],
    };
    await chrome.storage.session.set({ history: [consent] });
    await connectFailed('https://dapp.example', []);
    assert.deepEqual(
        history().map((entry) => entry.rows[0]?.kind),
        ['failed', 'consent'],
    );
});
