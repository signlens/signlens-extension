// The API as the extension depends on it: a server that refuses or is away
// is "could not explain", never "nothing wrong"; the feedback strip sends
// what the user chose and nothing more.

import { expect, liveGate, test } from './extension.ts';
import { explanation, fixture } from './server.ts';

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

test('with the window off, a request the API could not explain still waits for the user', async ({ configure, context, dapp, popup }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({
        gate: false,
        lookupTokens: false,
        simulate: false,
        mode: 'passthrough',
        upstream: 'Fake Wallet',
        apiUrl: 'http://127.0.0.1:1',
    });

    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    // SignLens would refuse what it could not explain, so the window opens all the
    // same, and says why; going on is still the user's to choose.
    const gate = await liveGate(context);
    await expect(gate.locator('#band')).toHaveClass(/error/);
    await expect(gate.locator('#note')).toContainText('The window is off in the settings, but opens for what SignLens would refuse');
    await gate.getByRole('button', { name: /Continue anyway/ }).click();
    expect((await signing).signed).toBe(1);
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
    // The ratings are a group under their question, and the chosen one says it is pressed.
    const ratings = gate.getByRole('group', { name: 'Was this explanation clear?' });
    await ratings.getByRole('button', { name: 'Unclear' }).click();
    await expect(ratings.getByRole('button', { name: 'Unclear' })).toHaveAttribute('aria-pressed', 'true');
    await expect(ratings.getByRole('button', { name: 'Clear', exact: true })).toHaveAttribute('aria-pressed', 'false');
    // What the strip says next is announced; the comment box has a name, not just a placeholder.
    await expect(gate.getByRole('status').filter({ hasText: 'Add a word if you like' })).toBeVisible();
    await gate.getByRole('textbox', { name: 'What was unclear or wrong? (optional)' }).fill('What is a durable nonce?');
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
    // The decision does not send it a second time.
    expect(server.apiCalls.filter((c) => c.path === '/v1/feedback')).toHaveLength(1);
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

test('a verdict this version does not know is an error, never a pass', async ({ configure, context, dapp, server, worker }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.answerApi(explanation('Review'));

    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('#band')).toHaveClass(/error/);
    await expect(gate.locator('#band-summary')).toContainText('"Review" is not a verdict this version knows');
    await expect(gate.getByRole('button', { name: /Continue anyway/ })).not.toHaveClass(/primary/);
    // The badge says the same as the window.
    expect(await worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('?');
    await gate.getByRole('button', { name: 'Reject' }).click();
    expect((await signing).error).toContain('rejected in SignLens');
});

test('an effect this version does not know is shown as one, not left out', async ({ configure, context, dapp, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.answerApi(explanation('Warn', { effects: [{ type: 'Drain', value: { everything: true } }] }));

    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('#band')).toHaveClass(/warning/);
    await expect(gate.locator('.effects')).toContainText('Something this version cannot show (Drain); the full text below has it');
    await gate.getByRole('button', { name: 'Reject' }).click();
    expect((await signing).error).toContain('rejected in SignLens');
});
