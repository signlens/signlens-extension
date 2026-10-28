// The address book: a named contact labels the recipient, and an address
// that merely resembles one, sharing the characters a shortened address
// shows, is flagged as a lookalike: a high finding, so a warning verdict.
// The names stay in the browser: the API is sent stand-ins for them.

import { base58Decode } from '../src/worker/solana.ts';
import { explanation, feePayer, fixture, STAND_IN_TAG } from '../test/server.ts';
import { clickToClose, expect, liveGate, test } from './support/extension.ts';

const WALLET = 'SignLens';
/** The nonce transfer's receiving token account. */
const RECIPIENT = 'DV3BDugD4uSbnFBwEzy6Lg4RksvPEtVCazWNwjzcL7Qp';
/** Same first and last four characters, different key. */
const LOOKALIKE = `${RECIPIENT.slice(0, 10)}1111111111${RECIPIENT.slice(20)}`;

test('a lookalike of a contact is flagged', async ({ configure, dapp, popup, server }) => {
    expect(base58Decode(LOOKALIKE)).not.toBeNull();
    expect(LOOKALIKE).not.toBe(RECIPIENT);
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({
        askFirst: false,
        lookupTokens: false,
        simulate: false,
        mode: 'watch',
        address: feePayer(transfer.bytes),
        contacts: `Bob = ${LOOKALIKE}\nnot a line\n`,
    });

    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    // The verdict depends on the address book: the page is not told it.
    expect(answer.error).not.toContain('warning');

    await popup.reload();
    const row = popup.locator('#history li').first();
    await expect(row.locator('.verdict')).toHaveText('warning');
    await row.locator('summary').click();
    await expect(row.locator('.severity').first()).toHaveText('High');
    await expect(row.locator('.findings')).toContainText(`looks like Bob`);
    await expect(row.locator('.findings')).toContainText('only its first and last characters match');
    await expect(popup.locator('#contacts-hint')).toHaveText('Line 2 not read: expected Name = address.');
    expect(server.apiCalls.filter((call) => call.path === '/v1/explain')).toHaveLength(1);
    expect(JSON.stringify(server.apiCalls)).not.toContain('Bob');
});

test('the contact itself labels the recipient', async ({ configure, dapp, popup, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({
        askFirst: false,
        lookupTokens: false,
        simulate: false,
        mode: 'watch',
        address: feePayer(transfer.bytes),
        contacts: `Bob = ${RECIPIENT}`,
    });

    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    expect(answer.error).not.toContain('warning');

    await popup.reload();
    const row = popup.locator('#history li').first();
    await expect(row.locator('.verdict')).toHaveText('warning');
    await row.locator('summary').click();
    await expect(row.locator('pre')).toContainText('To: Bob (DV3B…L7Qp) (verified)');
    await expect(row.locator('.findings')).not.toContainText('looks like');
    expect(JSON.stringify(server.apiCalls)).not.toContain('Bob');
});

test('a summary that names a contact shows the name, and a rating reports it as "a contact"', async ({
    configure,
    context,
    dapp,
    server,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet', contacts: `Bob = ${RECIPIENT}` });
    // As a program's summary may name an account: the engine writes what it was sent, the request's stand-in.
    server.answerApi(
        explanation('warn', {
            summary: `Lock 5 USDC for [[contact-1-${STAND_IN_TAG}]] (DV3B…L7Qp)`,
            raw: { format: 'legacy', digest: 'a'.repeat(64) },
        }),
    );
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('#band-summary')).toHaveText('Lock 5 USDC for Bob (DV3B…L7Qp)');
    await gate.getByRole('button', { name: 'Unclear' }).click();
    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    await signing;
    await expect.poll(() => server.apiCalls.filter((c) => c.path === '/v1/feedback').length).toBe(1);
    const sent = server.apiCalls.find((c) => c.path === '/v1/feedback')?.body as { seen: { summary: string } };
    expect(sent.seen.summary).toBe('Lock 5 USDC for a contact (DV3B…L7Qp)');
    expect(JSON.stringify(server.apiCalls)).not.toContain('Bob');
});
