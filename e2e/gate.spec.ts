// The gate: the explanation shown in its own window before the request is
// refused or passed on, and the user's decision honoured.

import type { BrowserContext, Page } from '@playwright/test';
import { expect, liveGate, test } from './extension.ts';
import { feePayer, fixture } from './server.ts';

const WALLET = 'SignLens';

/** Starts a signing request and returns it with the window the gate opened. */
async function askToSign(context: BrowserContext, dapp: Page, base64: string, method?: string) {
    const signing = dapp.evaluate(
        ({ wallet, base64, method }: { wallet: string; base64: string; method: string | undefined }) => window.sign(wallet, base64, method),
        { wallet: WALLET, base64, method },
    );
    const gate = await liveGate(context);
    return { signing, gate };
}

test('in pass-through mode the window shows the explanation and Continue hands the request on', async ({
    configure,
    context,
    dapp,
    worker,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });

    const { signing, gate } = await askToSign(context, dapp, transfer.base64);
    await expect(gate.locator('#what')).toHaveText('signTransaction');
    await expect(gate.locator('#where')).toContainText('localhost');
    await expect(gate.locator('.verdict').first()).toHaveText('warning');
    await expect(gate.locator('.summary-line')).toContainText('Transfer 0.996423 USDC (verified)');
    await expect(gate.locator('.findings')).toContainText('This signature never expires');
    await expect(gate.locator('#note')).toContainText('hands the request unchanged to Fake Wallet');
    expect(await worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('WARN');

    await gate.getByRole('button', { name: 'Continue to Fake Wallet' }).click();
    const answer = await signing;
    expect(answer).toEqual({ account: 'FakeWa11et1111111111111111111111111111111111', signed: 1 });
    expect(await dapp.evaluate(() => window.fakeCalls)).toEqual([{ method: 'signTransaction', count: 1 }]);
    await expect.poll(() => gate.isClosed()).toBe(true);
});

test('Reject stops the request before the wallet sees it', async ({ configure, context, dapp, popup }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });

    const { signing, gate } = await askToSign(context, dapp, transfer.base64);
    await gate.getByRole('button', { name: 'Reject' }).click();
    const answer = await signing;
    expect(answer.error).toContain('rejected in SignLens');
    expect(await dapp.evaluate(() => window.fakeCalls)).toEqual([]);

    await popup.reload();
    await expect(popup.locator('#history li').first().locator('.decision')).toHaveText('rejected');
});

test('closing the window is a rejection', async ({ configure, context, dapp }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });

    const { signing, gate } = await askToSign(context, dapp, transfer.base64);
    await gate.close();
    const answer = await signing;
    expect(answer.error).toContain('rejected in SignLens');
    expect(await dapp.evaluate(() => window.fakeCalls)).toEqual([]);
});

test('in watch mode the window only explains, since nothing can be signed', async ({ configure, context, dapp }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'watch', address: feePayer(transfer.bytes) });

    const { signing, gate } = await askToSign(context, dapp, transfer.base64);
    await expect(gate.locator('#note')).toContainText('holds no keys');
    await expect(gate.locator('#continue')).toBeHidden();
    await gate.getByRole('button', { name: 'Close' }).click();
    const answer = await signing;
    expect(answer.error).toContain('holds no keys: nothing was signed');
});

test('a message goes through the gate too', async ({ configure, context, dapp }) => {
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });

    const signing = dapp.evaluate((wallet: string) => window.signMessage(wallet, 'Sign in to the test dapp'), WALLET);
    const gate = await liveGate(context);
    await expect(gate.locator('#what')).toHaveText('signMessage');
    await expect(gate.locator('pre')).toHaveText('Sign in to the test dapp');
    await gate.getByRole('button', { name: 'Continue to Fake Wallet' }).click();
    expect(await signing).toEqual({ signed: true });
    expect(await dapp.evaluate(() => window.fakeCalls)).toEqual([{ method: 'signMessage', count: 1 }]);
});

test('with the gate off the request is passed on at once', async ({ configure, dapp }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ gate: false, lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    expect(answer.signed).toBe(1);
});

test('the window puts the verdict and what the transaction does first, with the full text one click away', async ({
    configure,
    context,
    dapp,
    worker,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    const payer = feePayer(transfer.bytes);
    await configure({ lookupTokens: false, simulate: false, mode: 'watch', address: payer });

    const { signing, gate } = await askToSign(context, dapp, transfer.base64);
    await expect(gate.locator('#title')).toHaveText('Sign a transaction');
    await expect(gate.locator('#where .host')).toContainText('localhost');
    await expect(gate.locator('#band')).toHaveClass(/warning/);
    await expect(gate.locator('#band-summary')).toContainText('Send 0.996423 USDC (verified)');

    // The effects as sentences, the signer's own accounts marked.
    const effects = gate.locator('.effects li');
    await expect(effects.first()).toContainText('You send 0.996423 USDC (verified) from Your token account (Ffz5…piwg) (verified) to DV3B');
    await expect(effects.first().locator('.address.self')).toHaveCount(1);
    await expect(effects).toContainText([/You send/, /Create/, /You pay a fee of 0.000012218 SOL/, /Valid FOREVER until nonce account/]);

    // The instructions and the details behind one toggle, closed until the
    // reader opens it, which is remembered.
    const all = gate.locator('.disclosure.instructions');
    await expect(all.locator(':scope > .toggle')).toHaveText('Instruction and details');
    await expect(all.locator(':scope > .disclosure-body')).toBeHidden();
    await all.locator(':scope > .toggle').click();
    await expect(all.locator(':scope > .disclosure-body')).toBeVisible();
    expect(await worker.evaluate(() => chrome.storage.local.get('showInstructions'))).toEqual({ showInstructions: true });

    // The instruction open with its fields; the rest and the full text behind toggles.
    const instruction = gate.locator('.disclosure.section').first();
    await expect(instruction.locator('.section-title')).toHaveText('Transfer tokens');
    await expect(instruction.locator('dl.fields')).toBeVisible();
    await expect(instruction.locator('dl.fields')).toContainText('Authorized by');
    const more = gate.locator('.disclosure.more');
    await expect(more.locator(':scope > .toggle')).toContainText('Details: also, signers, fee, validity');
    await expect(more.locator(':scope > .disclosure-body')).toBeHidden();
    await more.locator(':scope > .toggle').click();
    await expect(more.locator(':scope > .disclosure-body')).toBeVisible();
    await expect(more.locator('.section-title')).toContainText(['Also', 'Signers', 'Fee', 'Validity']);

    // A label with help opens it under its value; a trust marker opens its own.
    const total = more.locator('dl.fields dt .term', { hasText: 'Total' });
    await expect(more.locator('.help-note')).toHaveCount(0);
    await total.click();
    await expect(total).toHaveAttribute('aria-expanded', 'true');
    await expect(more.locator('dl.fields dd .help-note')).toHaveText(/What the network charges/);
    await total.click();
    await expect(more.locator('.help-note')).toHaveCount(0);
    const verified = effects.first().locator('.term', { hasText: '(verified)' }).first();
    await verified.press('Enter');
    await expect(effects.first().locator('.help-note')).toHaveText(/comes from SignLens itself/);
    const full = gate.locator('.disclosure.full-text');
    await expect(full.locator('pre')).toBeHidden();
    await full.locator(':scope > .toggle').press('Enter');
    await expect(full.locator('pre')).toBeVisible();
    await expect(full.locator('pre')).toContainText('== Transfer tokens | Token program (verified)');

    // The buttons are in view without scrolling.
    expect(await gate.locator('#reject').evaluate((b) => b.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
    await gate.getByRole('button', { name: 'Close' }).click();
    expect((await signing).error).toContain('holds no keys');
});

test('a label the descriptor explains opens its help in the gate', async ({ configure, context, dapp }) => {
    // A legacy transaction, so no lookup table stands between the gate and
    // the Pump.fun descriptor's fields.
    const buy = fixture('buy_exact_sol_in__track_volume_given.b64');
    // A reader who opened the instructions before finds them open.
    await configure({ lookupTokens: false, simulate: false, mode: 'watch', address: feePayer(buy.bytes), showInstructions: true });

    const { signing, gate } = await askToSign(context, dapp, buy.base64);
    const all = gate.locator('.disclosure.instructions');
    await expect(all.locator(':scope > .toggle')).toHaveText('Instruction and details');
    await expect(all.locator(':scope > .disclosure-body')).toBeVisible();
    const instruction = gate.locator('.disclosure.section').first();
    await expect(instruction.locator('.section-title')).toHaveText('Buy');
    const curve = instruction.locator('dl.fields dt .term', { hasText: 'Bonding curve' });
    await curve.click();
    await expect(instruction.locator('.help-note')).toHaveText(/has not graduated to a pool yet/);
    // A label the descriptor leaves plain is no term.
    await expect(instruction.locator('dl.fields dt', { hasText: 'Additional accounts' }).locator('.term')).toHaveCount(1);
    await gate.getByRole('button', { name: 'Close' }).click();
    expect((await signing).error).toContain('holds no keys');
});

test('long instruction data folds to two lines until asked for', async ({ configure, context, dapp, server }) => {
    // The stub RPC has none of the swap's lookup tables, so it cannot be
    // read past its bytes, and those run to several lines.
    const swap = fixture('swap__both_mints_named.b64');
    await configure({
        lookupTokens: false,
        simulate: false,
        mode: 'passthrough',
        upstream: 'Fake Wallet',
        rpcUrl: server.rpc,
        showInstructions: true,
    });

    const { signing, gate } = await askToSign(context, dapp, swap.base64);
    const bytes = gate.locator('code.bytes').first();
    await expect(bytes).toHaveClass(/clamped/);
    await expect(bytes).toContainText('0xf8c69e91e17587c8');
    const more = gate.locator('.more-bytes').first();
    await expect(more).toHaveText(/^show all \d+ bytes$/);
    await more.click();
    await expect(bytes).not.toHaveClass(/clamped/);
    await expect(more).toHaveText('show less');
    await gate.getByRole('button', { name: 'Reject' }).click();
    await signing.catch(() => {});
});
