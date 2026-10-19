// A dapp asks the wallet to sign; the engine explains; the wallet refuses;
// the popup shows what the engine made of it.

import { expect, test } from './extension.ts';
import { feePayer, fixture } from './server.ts';

const WALLET = 'SignLens';

test('a nonce transfer is explained for the connected address and refused', async ({ configure, dapp, popup }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ gate: false, lookupTokens: false, simulate: false, mode: 'watch', address: feePayer(transfer.bytes) });

    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    expect(answer.account).toBe(feePayer(transfer.bytes));
    expect(answer.error).toContain('holds no keys: nothing was signed');
    expect(answer.error).toContain('SignLens verdict: warning');

    await popup.reload();
    const row = popup.locator('#history li').first();
    await expect(row.locator('.verdict')).toHaveText('warning');
    await expect(row.locator('.where')).toContainText('signTransaction');
    await row.locator('summary').click();
    await expect(row.locator('.summary-line')).toHaveText(/^Send 0\.996423 USDC \(verified\) to/);
    await expect(row.locator('.findings')).toContainText('This signature never expires');
    await expect(row.locator('.severity').first()).toHaveText('High');
    await expect(row.locator('pre')).toContainText('== Transfer tokens | Token program');
});

test('lookup tables are read over the RPC and a swap is named', async ({ configure, dapp, popup, server }) => {
    const swap = fixture('swap__both_mints_named.b64');
    server.know(swap);
    await configure({
        gate: false,
        lookupTokens: false,
        simulate: false,
        mode: 'watch',
        address: feePayer(swap.bytes),
        rpcUrl: server.rpc,
    });

    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: swap.base64,
    });
    expect(answer.error).toContain('SignLens verdict: ok');
    expect(server.calls.map((c) => c.method)).toEqual(['getMultipleAccounts']);

    await popup.reload();
    const row = popup.locator('#history li').first();
    await expect(row.locator('.verdict')).toHaveText('ok');
    await row.locator('summary').click();
    await expect(row.locator('.summary-line')).toHaveText(
        'Swap ≤ 0.005265026 tSpaceX (verified) for ≥ 0.004080684 tKalshi (verified) via DFlow',
    );
    await expect(row.locator('.tables')).toContainText('read over RPC, unverified');
});

test('an unreachable RPC leaves the tables unresolved and the swap refused, not guessed', async ({ configure, dapp, popup, server }) => {
    const swap = fixture('swap__both_mints_named.b64');
    await configure({
        gate: false,
        lookupTokens: false,
        simulate: false,
        mode: 'watch',
        address: feePayer(swap.bytes),
        rpcUrl: `${server.url}/nowhere`,
    });

    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: swap.base64,
    });
    expect(answer.error).toContain('SignLens verdict: blocked');

    await popup.reload();
    const row = popup.locator('#history li').first();
    await row.locator('summary').click();
    await expect(row.locator('.tables')).toContainText('not resolved');
    await expect(row.locator('.findings')).toContainText('loaded from lookup tables');
});

test('a message is shown as it is, since SignLens does not explain messages', async ({ configure, dapp, popup }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ gate: false, lookupTokens: false, simulate: false, mode: 'watch', address: feePayer(transfer.bytes) });

    const answer = await dapp.evaluate((wallet: string) => window.signMessage(wallet, 'Sign in to the test dapp'), WALLET);
    expect(answer.error).toContain('The message is in the SignLens popup');

    await popup.reload();
    const row = popup.locator('#history li').first();
    await expect(row.locator('.verdict')).toHaveText('message');
    await row.locator('summary').click();
    await expect(row.locator('pre')).toHaveText('Sign in to the test dapp');
});
