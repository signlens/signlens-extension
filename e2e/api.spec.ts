// The API as the extension depends on it: a server that refuses or is away
// is "could not explain", never "nothing wrong"; the feedback strip sends
// what the user chose and nothing more.

import { expect, liveGate, test } from './extension.ts';
import { fixture } from './server.ts';

const WALLET = 'SignLens';

test('an API that refuses leaves the request unexplained, with a verdict that cannot pass', async ({
    configure,
    context,
    dapp,
    server,
    worker,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.refuseApi(503);

    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('#band')).toHaveClass(/error/);
    await expect(gate.locator('#band-summary')).toContainText('every worker is busy');
    await expect(gate.locator('#note')).toContainText('SignLens would refuse this');
    await expect(gate.getByRole('button', { name: /Continue anyway/ })).not.toHaveClass(/primary/);
    expect(await worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('?');
    await gate.getByRole('button', { name: 'Reject' }).click();
    expect((await signing).error).toContain('rejected in SignLens');
});

test('with the window off, an API that is not there is reported, and the request goes on', async ({ configure, dapp, popup }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({
        gate: false,
        lookupTokens: false,
        simulate: false,
        mode: 'passthrough',
        upstream: 'Fake Wallet',
        apiUrl: 'http://127.0.0.1:1',
    });

    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    // The gate is off, so the request went on to the wallet; the explanation is in the popup.
    expect(answer.signed).toBe(1);
    await popup.reload();
    await expect(popup.locator('#engine-status')).toHaveText(/SignLens API not reachable/);
    const row = popup.locator('#history li').first();
    await expect(row.locator('.verdict')).toHaveText('error');
    await expect(row.locator('.lead')).toContainText('did not answer');
});

test('the feedback strip sends the rating, and the transaction only when asked', async ({ configure, context, dapp, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });

    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('#feedback')).toBeVisible();
    // A warning: the offer to send the transaction is there, unchecked.
    const cover = gate.locator('#feedback-cover');
    await expect(cover).toBeVisible();
    await gate.getByRole('button', { name: 'Unclear' }).click();
    await gate.locator('#feedback-comment').fill('What is a durable nonce?');
    await gate.getByRole('button', { name: 'Continue to Fake Wallet' }).click();
    await signing;
    await expect.poll(() => server.apiCalls.filter((c) => c.path === '/v1/feedback').length).toBe(1);
    const sent = server.apiCalls.find((c) => c.path === '/v1/feedback')?.body as { messageHash: string };
    expect(sent).toMatchObject({ rating: 'unclear', comment: 'What is a durable nonce?', transaction: null });
    expect(sent.messageHash).toMatch(/^[0-9a-f]{64}$/);

    // And with the box ticked, the bytes go along.
    const again = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const second = await liveGate(context);
    await second.locator('#feedback-cover input').check();
    await second.getByRole('button', { name: 'Wrong' }).click();
    await second.getByRole('button', { name: 'Reject' }).click();
    await again.catch(() => {});
    await expect.poll(() => server.apiCalls.filter((c) => c.path === '/v1/feedback').length).toBe(2);
    expect(server.apiCalls.filter((c) => c.path === '/v1/feedback').at(-1)?.body).toMatchObject({
        rating: 'wrong',
        transaction: transfer.base64,
    });
});

test('a clear rating is sent at once', async ({ configure, context, dapp, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await gate.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(gate.locator('#feedback-note')).toHaveText(/Sent to SignLens/);
    await expect.poll(() => server.apiCalls.filter((c) => c.path === '/v1/feedback').length).toBe(1);
    await gate.getByRole('button', { name: 'Reject' }).click();
    await signing.catch(() => {});
});

test('an API that answers an error without a message is an error, never a message to pass on', async ({
    configure,
    context,
    dapp,
    server,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.refuseApi(500, '{"error":"boom"}');

    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('#band')).toHaveClass(/error/);
    await expect(gate.locator('#band-summary')).toContainText('not an explanation');
    await expect(gate.getByRole('button', { name: /Continue anyway/ })).not.toHaveClass(/primary/);
    await gate.getByRole('button', { name: 'Reject' }).click();
    expect((await signing).error).toContain('rejected in SignLens');
});
