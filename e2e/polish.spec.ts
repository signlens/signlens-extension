// The finishing touches: a refused request gets no inviting button, the
// badge clears once the popup is seen, a capture can be saved, the history
// cleared, and lookup tables are not fetched twice in a row.

import { closing, expect, liveGate, test } from './extension.ts';
import { feePayer, fixture } from './server.ts';

const WALLET = 'SignLens';
const SWAP = 'swap__both_mints_named.b64';

test('a request SignLens would refuse offers "Continue anyway", not the primary button', async ({ configure, context, dapp, server }) => {
    const swap = fixture(SWAP);
    // No tables: the swap is refused from the bytes alone.
    await configure({
        lookupTokens: false,
        simulate: false,
        mode: 'passthrough',
        upstream: 'Fake Wallet',
        rpcUrl: `${server.url}/nowhere`,
    });
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: swap.base64,
    });
    const gate = await liveGate(context);
    const proceed = gate.locator('#continue');
    await expect(proceed).toHaveText('Continue anyway to Fake Wallet');
    await expect(proceed).not.toHaveClass(/primary/);
    await expect(gate.locator('#note')).toContainText('SignLens would refuse this');
    await expect(gate.locator('#reject')).toBeFocused();
    // The window closes on the keydown, before the keyup a press waits for.
    await closing(gate, () => gate.keyboard.press('Escape'));
    expect((await signing).error).toContain('rejected in SignLens');
    await expect.poll(() => gate.isClosed()).toBe(true);
});

test('the badge shows the verdict until the popup is opened', async ({ configure, context, dapp, extensionId, worker }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ askFirst: false, lookupTokens: false, simulate: false, mode: 'watch', address: feePayer(transfer.bytes) });
    await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    expect(await worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('WARN');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
});

test('a capture can be saved as a fixture, and the history cleared', async ({ configure, dapp, popup, server }) => {
    const swap = fixture(SWAP);
    server.know(swap);
    await configure({
        askFirst: false,
        lookupTokens: false,
        simulate: false,
        mode: 'watch',
        address: feePayer(swap.bytes),
        rpcUrl: server.rpc,
    });
    await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: swap.base64,
    });

    await popup.reload();
    const row = popup.locator('#history li').first();
    await row.locator('summary').click();
    const downloading = popup.waitForEvent('download');
    await row.locator('a.save').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^\d{8}T\d{6}-localhost(_\d+)?\.b64$/);
    const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'));
    expect(text).toContain(`# signer: ${feePayer(swap.bytes)}`);
    expect(text).toContain(`# loaded-writable: ${swap.writable.join(' ')}`);
    expect(text).toContain(`# loaded-readonly: ${swap.readonly.join(' ')}`);
    expect(
        text
            .split('\n')
            .filter((l) => l && !l.startsWith('#'))
            .join(''),
    ).toBe(swap.base64);

    await popup.locator('#clear').click();
    await expect(popup.locator('#history li')).toHaveCount(0);
    await expect(popup.locator('#empty')).toBeVisible();
    await expect(popup.locator('#clear')).toBeHidden();
});

test('lookup tables read once are not fetched again for the next request', async ({ configure, dapp, server }) => {
    const swap = fixture(SWAP);
    server.know(swap);
    await configure({
        askFirst: false,
        lookupTokens: false,
        simulate: false,
        mode: 'watch',
        address: feePayer(swap.bytes),
        rpcUrl: server.rpc,
    });
    const sign = () =>
        dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
            wallet: WALLET,
            base64: swap.base64,
        });
    expect((await sign()).error).toContain('holds no keys');
    expect((await sign()).error).toContain('holds no keys');
    expect(server.calls.filter((c) => c.method === 'getMultipleAccounts')).toHaveLength(1);
});
