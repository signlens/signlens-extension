// Unlisted tokens: the worker reads a mint's decimals over the RPC and its
// symbol from the token list, and the engine names the token as a claim.

import { feePayer, fixture } from '../test/server.ts';
import { expect, test } from './support/extension.ts';

const WALLET = 'SignLens';
const PUMP = 'swap__sol_from_wallet.b64';
const PUMP_MINT = 'HMYd9tosnUXuNHmq7pXmoePRVBLBBjA3JBfydq6upump';

test('a pump token is named from the RPC and the token list, marked unverified', async ({ configure, dapp, popup, server }) => {
    const swap = fixture(PUMP);
    server.know(swap);
    server.knowMint(PUMP_MINT, 'HMYD', 6);
    await configure({
        askFirst: false,
        simulate: false,
        mode: 'watch',
        address: feePayer(swap.bytes),
        rpcUrl: server.rpc,
        lookupTokens: true,
        tokenApiUrl: server.tokens,
    });

    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: swap.base64,
    });
    expect(answer.error).toContain('holds no keys');
    expect(server.calls.map((c) => c.method)).toEqual(['getMultipleAccounts', 'getMultipleAccounts', 'tokens']);
    expect(server.calls.find((c) => c.method === 'tokens')?.query).toBe(PUMP_MINT);

    await popup.reload();
    const row = popup.locator('#history li').first();
    await expect(row.locator('.verdict')).toHaveText('ok');
    await row.locator('summary').click();
    await expect(row.locator('.summary-line')).toContainText('≥ 142,243.976392 HMYD (claimed, unverified)');
    await expect(row.locator('.tables').nth(1)).toHaveText(/Unlisted tokens named .*: HMYD/);
    await expect(row.locator('pre')).toContainText('HMYD mint (HMYd…pump) (claimed, unverified)');
});

test('a token nothing names stays in raw units, and the lookup is remembered', async ({ configure, dapp, popup, server }) => {
    const swap = fixture(PUMP);
    server.know(swap);
    await configure({
        askFirst: false,
        simulate: false,
        mode: 'watch',
        address: feePayer(swap.bytes),
        rpcUrl: server.rpc,
        lookupTokens: true,
        tokenApiUrl: server.tokens,
    });
    const sign = () =>
        dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
            wallet: WALLET,
            base64: swap.base64,
        });
    await sign();
    await sign();
    // The second request asked the RPC for its tables again but not for the mint.
    expect(server.calls.filter((c) => c.method === 'tokens')).toHaveLength(1);

    await popup.reload();
    const row = popup.locator('#history li').first();
    await row.locator('summary').click();
    await expect(row.locator('.summary-line')).toContainText(
        'raw units of an unverified token (HMYd9tosnUXuNHmq7pXmoePRVBLBBjA3JBfydq6upump)',
    );
});

test('with the lookup off nothing leaves for the token list', async ({ configure, dapp, server }) => {
    const swap = fixture(PUMP);
    server.know(swap);
    server.knowMint(PUMP_MINT, 'HMYD', 6);
    await configure({
        askFirst: false,
        simulate: false,
        mode: 'watch',
        address: feePayer(swap.bytes),
        rpcUrl: server.rpc,
        lookupTokens: false,
        tokenApiUrl: server.tokens,
    });
    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: swap.base64,
    });
    expect(answer.error).toContain('holds no keys');
    expect(server.calls.map((c) => c.method)).toEqual(['getMultipleAccounts']);
});
