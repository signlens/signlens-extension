// The setup page: a new install opens it, and an address added there is
// yours, so the address window has nothing to ask. It says how to use
// SignLens and to pin it, and Done closes it.

import type { BrowserContext, Page } from '@playwright/test';
import { explanation, fixture } from '../test/server.ts';
import { closing, expect, FAKE_ACCOUNT, liveGate, test } from './support/extension.ts';

const OTHER = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** The setup page the install opened: one, and only one, its list read from storage. */
async function setupPage(context: BrowserContext): Promise<Page> {
    const open = () => context.pages().filter((page) => !page.isClosed() && page.url().endsWith('/welcome.html'));
    await expect.poll(() => open().length).toBe(1);
    const [page] = open();
    if (!page) throw new Error('no setup page');
    await expect(page.locator('#my-addresses')).toHaveAttribute('data-ready', 'true');
    return page;
}

test('a new install opens the setup page; an address added there is yours, so a site signing with it is not asked about', async ({
    configure,
    context,
    dapp,
    server,
    worker,
}) => {
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet', myAddresses: '' });
    const setup = await setupPage(context);
    const mine = setup.getByRole('list', { name: 'Your addresses' });
    const add = setup.getByRole('textbox', { name: 'Add an address' });
    const status = setup.locator('#my-addresses .yours-status');
    await expect(setup.locator('#my-addresses')).toContainText('None yet.');

    // Only an address gets in: what is not one stays in the field, said so.
    await add.fill('nope');
    await add.press('Enter');
    await expect(status).toHaveText('Not a Solana address: nope.');
    await expect(add).toHaveAttribute('aria-invalid', 'true');
    await expect(add).toHaveValue('nope');
    await expect(mine.getByRole('listitem')).toHaveCount(0);

    // Added by the button or by Enter, one row each, in full; several pasted at once are each added.
    await add.fill(FAKE_ACCOUNT);
    await setup.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(status).toHaveText(`Added ${FAKE_ACCOUNT.slice(0, 4)}…${FAKE_ACCOUNT.slice(-4)}.`);
    await expect(add).toHaveValue('');
    await expect(add).toHaveAttribute('aria-invalid', 'false');
    await expect(add).toBeFocused();
    await add.fill(`${FAKE_ACCOUNT}\n${OTHER}`);
    await add.press('Enter');
    await expect(mine.getByRole('listitem')).toHaveText([`${FAKE_ACCOUNT}Remove`, `${OTHER}Remove`]);
    await add.fill(OTHER);
    await add.press('Enter');
    await expect(status).toHaveText('Already in your list.');
    await expect
        .poll(() => worker.evaluate(() => chrome.storage.local.get('myAddresses')))
        .toEqual({
            myAddresses: `${FAKE_ACCOUNT}\n${OTHER}`,
        });

    // Chromium grants the manifest's access at install: nothing to ask for here.
    await expect(setup.locator('#access')).toBeHidden();
    // Not pinned, in a fresh profile: it says how.
    await expect(setup.locator('#pin-status')).toContainText('pin SignLens');

    // A request signed with the address goes straight to the explanation.
    server.answerApi(explanation('ok'));
    const signing = dapp.evaluate(({ base64 }: { base64: string }) => window.sign('SignLens', base64), {
        base64: fixture('legacy_durable_nonce_token_transfer').base64,
    });
    const gate = await liveGate(context);
    expect(context.pages().filter((page) => page.url().includes('address.html'))).toEqual([]);
    await closing(gate, () => gate.getByRole('button', { name: 'Reject' }).click());
    expect((await signing).error).toContain('User rejected the request in SignLens');

    // Remove takes one out, and the focus goes on to the next row.
    await setup.getByRole('button', { name: `Remove ${FAKE_ACCOUNT}` }).click();
    await expect(mine.getByRole('listitem')).toHaveText([`${OTHER}Remove`]);
    await expect(setup.getByRole('button', { name: `Remove ${OTHER}` })).toBeFocused();
    await expect.poll(() => worker.evaluate(() => chrome.storage.local.get('myAddresses'))).toEqual({ myAddresses: OTHER });

    // Done closes it.
    await closing(setup, () => setup.getByRole('button', { name: 'Done' }).click());
});
