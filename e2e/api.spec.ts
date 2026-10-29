// The API as the extension depends on it: a server that refuses or is away
// is "could not explain", never "nothing wrong"; the feedback strip sends
// what the user chose and nothing more.

import { explanation, fixture, recorded, words } from '../test/server.ts';
import { clickToClose, expect, liveGate, test } from './support/extension.ts';

const WALLET = 'SignLens';

test('"Try again" asks the API again while the request waits, and the same window shows the answer', async ({
    configure,
    context,
    dapp,
    server,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.refuseApi(500);
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('#band')).toHaveClass(/error/);
    server.answerApi(explanation('ok'));
    await gate.getByRole('button', { name: 'Try again' }).click();
    await expect(gate.locator('#band')).toHaveClass(/ok/);
    await expect(gate.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    // The request waited all along: the user decides on what the window shows now.
    await expect(gate.getByRole('button', { name: 'Reject' })).toBeFocused();
    await clickToClose(gate.getByRole('button', { name: 'Continue to Fake Wallet' }));
    expect((await signing).signed).toBe(1);
});

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
    // Busy is worth one more try, after a pause; the second answer stands.
    expect(server.apiCalls.filter((call) => call.path === '/v2/explain')).toHaveLength(2);
    await expect(gate.locator('#note')).toContainText('SignLens would refuse this');
    await expect(gate.getByRole('button', { name: /Continue anyway/ })).not.toHaveClass(/primary/);
    expect(await worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('?');
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    expect((await signing).error).toContain('User rejected the request in SignLens');
});

test('with the window off, a request the API could not explain still waits for the user', async ({ configure, context, dapp, popup }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({
        askFirst: false,
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
    await expect(gate.locator('#note')).toHaveText(
        '“Show the explanation and ask first” is off, but SignLens still asks before passing on what it would refuse. Continuing hands this unchanged to Fake Wallet, which asks for its own approval.',
    );
    await gate.getByRole('button', { name: /Continue anyway/ }).click();
    await expect(gate.getByRole('dialog')).toContainText('SignLens could not explain this, so nothing is known of what it does.');
    await clickToClose(gate.getByRole('dialog').getByRole('button', { name: 'Continue anyway' }));
    expect((await signing).signed).toBe(1);
    await popup.reload();
    await expect(popup.locator('#engine-status')).toHaveText(/SignLens API not reachable/);
    const row = popup.locator('#history li').first();
    await expect(row.locator('.verdict')).toHaveText('error');
    await expect(row.locator('.lead')).toContainText('did not answer');
});

test('a rating left in the window goes when the window is closed by its frame, as closing is a decision', async ({
    configure,
    context,
    dapp,
    server,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await gate.getByRole('button', { name: 'Unclear' }).click();
    await gate.getByRole('textbox', { name: 'What was unclear or wrong? (optional)' }).fill('Closed before deciding');
    // Closed by the window's own close button: no Reject was pressed.
    await gate.close();
    expect((await signing).error).toContain('User rejected the request in SignLens');
    await expect.poll(() => server.apiCalls.filter((c) => c.path === '/v1/feedback').length).toBe(1);
    expect(server.apiCalls.find((c) => c.path === '/v1/feedback')?.body).toMatchObject({
        rating: 'unclear',
        comment: 'Closed before deciding',
    });
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
    // What a rating sends is said before one is given.
    await expect(gate.locator('#feedback-what')).toContainText("the site, SignLens's version, what this window shows");
    await expect(gate.locator('#feedback-what')).toContainText('only if you tick the box below');
    // The ratings are a group under their question, and the chosen one says it is pressed.
    const ratings = gate.getByRole('group', { name: 'Was this explanation clear?' });
    await ratings.getByRole('button', { name: 'Unclear' }).click();
    await expect(ratings.getByRole('button', { name: 'Unclear' })).toHaveAttribute('aria-pressed', 'true');
    await expect(ratings.getByRole('button', { name: 'Clear', exact: true })).toHaveAttribute('aria-pressed', 'false');
    // What the strip says next is announced; the comment box has a name, not just a placeholder.
    await expect(gate.getByRole('status').filter({ hasText: 'Add a word if you like' })).toBeVisible();
    await gate.getByRole('textbox', { name: 'What was unclear or wrong? (optional)' }).fill('What is a durable nonce?');
    await clickToClose(gate.getByRole('button', { name: 'Continue to Fake Wallet' }));
    await signing;
    await expect.poll(() => server.apiCalls.filter((c) => c.path === '/v1/feedback').length).toBe(1);
    const sent = server.apiCalls.find((c) => c.path === '/v1/feedback')?.body as {
        message_hash: string;
        origin: string;
        extension: string;
        seen: { verdict: string; findings: { code: string }[]; instructions: { program: string }[] };
    };
    expect(sent).toMatchObject({
        rating: 'unclear',
        comment: 'What is a durable nonce?',
        transaction: null,
        method: 'solana:signTransaction',
    });
    expect(sent.message_hash).toMatch(/^[0-9a-f]{64}$/);
    // The site and what the window showed go with every rating; the tables only with the bytes.
    expect(sent.origin).toMatch(/^(localhost|127\.0\.0\.1):\d+$/);
    expect(sent.extension).toMatch(/^\d+\.\d+\.\d+/);
    expect(sent.seen.verdict).toBe('warn');
    expect(sent.seen.findings.length).toBeGreaterThan(0);
    expect(sent.seen.instructions.map((i) => i.program)).toContain('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    expect(sent).not.toHaveProperty('loaded_writable');

    // And with the box ticked, the bytes go along.
    const again = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const second = await liveGate(context);
    await second.locator('#feedback-cover input').check();
    await second.getByRole('button', { name: 'Wrong' }).click();
    await clickToClose(second.getByRole('button', { name: 'Reject' }));
    await again.catch(() => {});
    await expect.poll(() => server.apiCalls.filter((c) => c.path === '/v1/feedback').length).toBe(2);
    expect(server.apiCalls.filter((c) => c.path === '/v1/feedback').at(-1)?.body).toMatchObject({
        rating: 'wrong',
        transaction: transfer.base64,
    });
});

test('an explanation SignLens called OK can send its transaction too, when asked', async ({ configure, context, dapp, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    // The recorded explanation, called OK: a digest, so a strip to rate it in.
    server.answerApi({ ...(recorded('legacy_durable_nonce_token_transfer') as object), verdict: 'ok' });
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('#band')).toHaveClass(/\bok\b/);
    await expect(gate.locator('#feedback')).toBeVisible();
    // An OK that reads wrong is a gap too, so the offer is there, unchecked.
    const box = gate.getByRole('checkbox', { name: 'Send this transaction to SignLens so it can be looked into' });
    await expect(box).not.toBeChecked();
    await expect(gate.locator('#feedback-what')).toContainText('only if you tick the box below');
    await box.check();
    await gate.getByRole('button', { name: 'Wrong' }).click();
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    await signing.catch(() => {});
    await expect.poll(() => server.apiCalls.filter((c) => c.path === '/v1/feedback').length).toBe(1);
    expect(server.apiCalls.find((c) => c.path === '/v1/feedback')?.body).toMatchObject({
        rating: 'wrong',
        transaction: transfer.base64,
        seen: { verdict: 'ok' },
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
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
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
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    expect((await signing).error).toContain('User rejected the request in SignLens');
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
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    expect((await signing).error).toContain('User rejected the request in SignLens');
});

test("an effect of a type this version does not know is shown in the engine's words, not left out", async ({
    configure,
    context,
    dapp,
    server,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });
    server.answerApi(
        explanation('warn', { effects: [{ type: 'drain', value: { everything: true }, message: words('Drain everything') }] }),
    );

    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('#band')).toHaveClass(/warning/);
    // The engine words an effect of any type, so one this version does not know is shown in its words.
    await expect(gate.locator('.effects')).toContainText('Drain everything');
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    expect((await signing).error).toContain('User rejected the request in SignLens');
});
