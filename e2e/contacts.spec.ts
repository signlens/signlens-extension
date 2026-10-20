// The address book: a named contact labels the recipient, and an address
// that merely resembles one, sharing the characters a shortened address
// shows, is flagged as a lookalike: a high finding, so a warning verdict.

import { base58Decode } from '../src/solana.ts';
import { expect, test } from './extension.ts';
import { feePayer, fixture } from './server.ts';

const WALLET = 'SignLens';
/** The nonce transfer's receiving token account. */
const RECIPIENT = 'DV3BDugD4uSbnFBwEzy6Lg4RksvPEtVCazWNwjzcL7Qp';
/** Same first and last four characters, different key. */
const LOOKALIKE = `${RECIPIENT.slice(0, 10)}1111111111${RECIPIENT.slice(20)}`;

test('a lookalike of a contact is flagged', async ({ configure, dapp, popup }) => {
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
});

test('the contact itself labels the recipient', async ({ configure, dapp, popup }) => {
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
});
