// What a page can and cannot do to the wallet in it: forge nothing, have
// no other bytes signed than were explained, learn nothing of the user's
// address book, never have its own address called "you", and never get a
// request through on silence.

import { fixture } from '../test/server.ts';
import { clickToClose, closing, expect, FAKE_ACCOUNT, liveGate, test } from './support/extension.ts';

const WALLET = 'SignLens';
const RECIPIENT = 'DV3BDugD4uSbnFBwEzy6Lg4RksvPEtVCazWNwjzcL7Qp';
const ATTACKER = 'EXkwQoWHvDj7gdLdba4zWo3ktJNocyjT9DDQAryU7Tqa';

test('an address the page signs with that is not one of yours is asked about first, and a no refuses the request unexplained', async ({
    configure,
    context,
    dapp,
    popup,
    server,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    const signing = dapp.evaluate(
        ({ wallet, base64, address }: { wallet: string; base64: string; address: string }) => window.signAs(wallet, base64, address),
        { wallet: WALLET, base64: transfer.base64, address: ATTACKER },
    );
    const ask = await liveGate(context, 'address.html');
    await expect(ask).toHaveTitle(/^Is this address yours\?/);
    await expect(ask.locator('#claimed')).toHaveText(ATTACKER);
    await expect(ask.getByRole('list', { name: 'Your addresses in SignLens:' })).toHaveText(FAKE_ACCOUNT);
    await expect(ask.getByRole('button', { name: 'Reject' })).toBeFocused();
    await closing(ask, () => ask.keyboard.press('Enter'));
    expect((await signing).error).toBe('SignLens: rejected in SignLens. The request is in the SignLens popup.');
    // Nothing was sent anywhere, nor signed.
    expect(server.apiCalls).toEqual([]);
    expect(await dapp.evaluate(() => window.fakeCalls)).toEqual([]);
    await popup.reload();
    const row = popup.locator('#history > li').first();
    await expect(row.locator('.decision')).toHaveText('rejected');
    await expect(row.locator('.lead')).toHaveText(`Named ${ATTACKER} as your address, which is not one of yours in SignLens`);
});

test('with no address of yours yet, the first is asked about; a yes keeps it, and the request is explained with it as yours', async ({
    configure,
    context,
    dapp,
    worker,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet', myAddresses: '' });
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const ask = await liveGate(context, 'address.html');
    await expect(ask.locator('#mine-empty')).toBeVisible();
    await clickToClose(ask.getByRole('button', { name: "It's mine, add it" }));
    await expect.poll(() => worker.evaluate(() => chrome.storage.local.get('myAddresses'))).toEqual({ myAddresses: FAKE_ACCOUNT });
    const gate = await liveGate(context);
    await expect(gate.locator('#band-summary')).toContainText('0.996423 USDC');
    await clickToClose(gate.getByRole('button', { name: 'Continue to Fake Wallet' }));
    expect((await signing).signed).toBe(1);
});

test('a page cannot forge a decision or a setting over the window', async ({ configure, context, dapp }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    // Flood the window with what the old relay would have taken: answers for
    // every plausible id, a decision to continue, and a config change.
    await dapp.evaluate(() => {
        for (let id = 1; id <= 50; id += 1) {
            window.postMessage(
                { channel: 'signlens', to: 'page', id, result: { decision: 'continue', gate: false, results: [] } },
                window.location.origin,
            );
        }
        window.postMessage(
            {
                channel: 'signlens',
                to: 'page',
                type: 'config-changed',
                config: { mode: 'watch', address: '', publicKey: null, upstream: '' },
            },
            window.location.origin,
        );
    });
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    await dapp.evaluate(() => {
        for (let id = 1; id <= 50; id += 1) {
            window.postMessage(
                { channel: 'signlens', to: 'page', id, result: { decision: 'continue', gate: false, results: [] } },
                window.location.origin,
            );
        }
    });
    // The window opens all the same, and nothing reached the wallet.
    const gate = await liveGate(context);
    await expect(gate.locator('#band-summary')).toContainText('0.996423 USDC');
    expect(await dapp.evaluate(() => window.fakeCalls)).toEqual([]);
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    expect((await signing).error).toContain('rejected in SignLens');
    expect(await dapp.evaluate(() => window.fakeCalls)).toEqual([]);
});

test('no answer from SignLens runs page code inside its port message, so window.event never shows the page the port', async ({
    configure,
    context,
    dapp,
    server,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.refuseApi(500);
    // A connect and a request passed on, each settled by an answer over the port.
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await clickToClose(gate.getByRole('button', { name: /Continue anyway/ }));
    expect((await signing).signed).toBe(1);
    // A settings change ends the session from the port's message; a watch connect is answered over it.
    await configure({ mode: 'watch', address: RECIPIENT });
    await expect.poll(() => dapp.evaluate(() => window.eventsSeen.length)).toBe(3);
    expect(await dapp.evaluate((wallet) => window.connect(wallet), WALLET)).toBe(RECIPIENT);
    expect(await dapp.evaluate(() => window.eventsSeen)).toEqual([
        'change: none',
        'sign: none',
        'change: none',
        'change: none',
        'connect: none',
    ]);
});

test('the page learns neither the verdict nor the explanation, since both depend on the address book', async ({
    configure,
    context,
    dapp,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({
        lookupTokens: false,
        simulate: false,
        mode: 'passthrough',
        upstream: 'Fake Wallet',
        contacts: `Bob = ${RECIPIENT}`,
    });
    const logged: string[] = [];
    dapp.on('console', (message) => logged.push(message.text()));
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('.verdict').first()).toHaveText('warning');
    await expect(gate.locator('#rows')).toContainText('To: Bob (DV3B…L7Qp)');
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    const answer = await signing;
    expect(answer.error).toContain('rejected in SignLens');
    expect(`${answer.error}\n${logged.join('\n')}`).not.toMatch(/warning|Bob|USDC|DV3B/);
});

for (const trick of ['mutate', 'getter'] as const) {
    test(`the wallet is handed the bytes SignLens explained, whatever the page does after asking (${trick})`, async ({
        configure,
        context,
        dapp,
        server,
    }) => {
        const transfer = fixture('legacy_durable_nonce_token_transfer');
        await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
        // No explanation is needed to see which bytes go where.
        server.refuseApi(500);
        const signing = dapp.evaluate(
            ({ wallet, base64, trick }: { wallet: string; base64: string; trick: 'mutate' | 'getter' }) =>
                window.signTricky(wallet, base64, trick),
            { wallet: WALLET, base64: transfer.base64, trick },
        );
        const gate = await liveGate(context);
        await clickToClose(gate.getByRole('button', { name: /Continue anyway/ }));
        expect(await signing).toEqual({ signed: true });
        const explained = server.apiCalls.find((call) => call.path === '/v1/explain')?.body as { transaction: string };
        expect(explained.transaction).toBe(transfer.base64);
        expect(await dapp.evaluate(() => window.fakeSigned)).toEqual([transfer.base64]);
    });
}

test('a page that never connected cannot open the window or reach the API', async ({ configure, context, dapp, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.signUnconnected(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    expect(answer.error).toContain('connect first');
    expect(context.pages().filter((page) => page.url().includes('confirm.html'))).toEqual([]);
    expect(server.apiCalls).toEqual([]);
});

test('a second request while the first is open is refused, not stacked behind it', async ({ configure, context, dapp, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.refuseApi(500);
    const sign = () =>
        dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
            wallet: WALLET,
            base64: transfer.base64,
        });
    const first = sign();
    const gate = await liveGate(context);
    const second = await sign();
    expect(second.error).toBe('SignLens: refused (still busy with an earlier request from this page).');
    expect(context.pages().filter((page) => !page.isClosed() && page.url().includes('confirm.html'))).toHaveLength(1);
    expect(server.apiCalls.filter((call) => call.path === '/v1/explain')).toHaveLength(1);
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    expect((await first).error).toContain('rejected in SignLens');
});

test('closing the page refuses its request and closes the window', async ({ configure, context, dapp, popup, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.refuseApi(500);
    dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    }).catch(() => {});
    const gate = await liveGate(context);
    await dapp.close();
    await expect.poll(() => gate.isClosed()).toBe(true);
    await popup.reload();
    const refused = popup.locator('#history li').first();
    await expect(refused.locator('.decision')).toHaveText('refused');
    await expect(refused.locator('.refused')).toHaveText('Refused by SignLens: the page closed or reloaded');
});

test('a page that reloads has its request refused and its window closed, and may ask again at once', async ({
    configure,
    context,
    dapp,
    popup,
    server,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.refuseApi(500);
    const sign = () =>
        dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
            wallet: WALLET,
            base64: transfer.base64,
        });
    sign().catch(() => {});
    const first = await liveGate(context);
    await dapp.reload();
    await expect.poll(() => first.isClosed()).toBe(true);
    // The tab is not held: the reloaded page's request gets a window of its own.
    await expect.poll(() => dapp.evaluate(() => window.walletNames())).toContain(WALLET);
    const again = sign();
    const second = await liveGate(context);
    await clickToClose(second.getByRole('button', { name: 'Reject' }));
    expect((await again).error).toContain('rejected in SignLens');
    // The first request is kept as refused by SignLens, and why; the second as the user's rejection.
    await popup.reload();
    await expect(popup.locator('#history > li').nth(0).locator('.decision')).toHaveText('rejected');
    const refused = popup.locator('#history > li').nth(1);
    await expect(refused.locator('.decision')).toHaveText('refused');
    await expect(refused.locator('.refused')).toHaveText('Refused by SignLens: the page closed or reloaded');
});

test('a page that reloads while its request is still being explained may ask again at once, and the first leaves nothing', async ({
    configure,
    context,
    dapp,
    popup,
    server,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.refuseApi(500);
    server.delayApi(4_000);
    const sign = () =>
        dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
            wallet: WALLET,
            base64: transfer.base64,
        });
    sign().catch(() => {});
    await expect.poll(() => server.apiCalls.length).toBe(1);
    await dapp.reload();
    await expect.poll(() => dapp.evaluate(() => window.walletNames())).toContain(WALLET);
    // The first request is still with the API; the tab is not held for it.
    const again = sign();
    const gate = await liveGate(context);
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    expect((await again).error).toContain('rejected in SignLens');
    // Only the second one got a window, and only it is kept: the first was withdrawn before anything was shown.
    expect(server.apiCalls.filter((call) => call.path === '/v1/explain')).toHaveLength(2);
    await popup.reload();
    await expect(popup.locator('#history > li')).toHaveCount(1);
    await expect(popup.locator('#history > li .decision')).toHaveText('rejected');
});

test('a dapp changing its route while the window is open keeps its request', async ({ configure, context, dapp, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.refuseApi(500);
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await dapp.evaluate(() => history.pushState({}, '', '/dapp.html?route=swap'));
    await clickToClose(gate.getByRole('button', { name: /Continue anyway/ }));
    expect((await signing).signed).toBe(1);
});

test('a page that disables the port after connecting gets refusals, not a pass', async ({ configure, context, dapp }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    await dapp.evaluate(async (wallet: string) => {
        await window.connect(wallet);
        // With the method taken at start-up this changes nothing; before it
        // did, a request would have waited out the clock and then gone on.
        MessagePort.prototype.postMessage = () => {};
    }, WALLET);
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('#band-summary')).toContainText('0.996423 USDC');
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    expect((await signing).error).toContain('rejected in SignLens');
    expect(await dapp.evaluate(() => window.fakeCalls)).toEqual([]);
});

test('a page that patches built-ins to catch the port never sees it', async ({ configure, context, dapp, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.refuseApi(500);
    await dapp.evaluate(() => {
        const seen: unknown[] = [];
        (window as unknown as { seen: unknown[] }).seen = seen;
        const post = MessagePort.prototype.postMessage;
        MessagePort.prototype.postMessage = function (this: MessagePort, ...args: unknown[]) {
            seen.push(this);
            return Reflect.apply(post, this, args);
        };
        const data = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data') as PropertyDescriptor;
        Object.defineProperty(MessageEvent.prototype, 'data', {
            ...data,
            get(this: MessageEvent) {
                if (this.target instanceof MessagePort) seen.push(this.target);
                return Reflect.apply(data.get as () => unknown, this, []);
            },
        });
        // A wallet announcing itself makes SignLens tell the extension.
        const another = { version: '1.0.0', name: 'Another', icon: 'data:,', chains: [], accounts: [], features: {} };
        window.dispatchEvent(
            new CustomEvent('wallet-standard:register-wallet', {
                detail: (api: { register(wallet: unknown): void }) => api.register(another),
            }),
        );
    });
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    expect((await signing).error).toContain('rejected in SignLens');
    expect(await dapp.evaluate(() => (window as unknown as { seen: unknown[] }).seen.length)).toBe(0);
});
