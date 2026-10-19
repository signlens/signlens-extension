// What a page can and cannot do to the wallet in it: forge nothing, and
// never get a request through on silence.

import { expect, liveGate, test } from './extension.ts';
import { fixture } from './server.ts';

const WALLET = 'SignLens';
const RECIPIENT = 'DV3BDugD4uSbnFBwEzy6Lg4RksvPEtVCazWNwjzcL7Qp';

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
    await gate.getByRole('button', { name: 'Reject' }).click();
    expect((await signing).error).toContain('rejected in SignLens');
    expect(await dapp.evaluate(() => window.fakeCalls)).toEqual([]);
});

test('the page learns the verdict, not the explanation or who the user calls whom', async ({ configure, context, dapp }) => {
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
    await expect(gate.locator('#rows')).toContainText('To: Bob (DV3B…L7Qp)');
    await gate.getByRole('button', { name: 'Reject' }).click();
    expect((await signing).error).toContain('rejected in SignLens');
    expect(logged.some((line) => line.includes('SignLens') && line.includes('warning'))).toBe(true);
    expect(logged.join('\n')).not.toMatch(/Bob|USDC|DV3B/);
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
    await gate.getByRole('button', { name: 'Reject' }).click();
    expect((await signing).error).toContain('rejected in SignLens');
    expect(await dapp.evaluate(() => window.fakeCalls)).toEqual([]);
});
