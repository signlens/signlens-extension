// Your addresses in the popup: a list in the settings, one row each, kept
// as storage changes; and while pass-through mode has none, the requests
// ask for one inline.

import { expect, FAKE_ACCOUNT, test } from './support/extension.ts';

const OTHER = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

test('while your addresses are missing, the popup asks for one inline, and its settings list what you have', async ({
    configure,
    popup,
    worker,
}) => {
    await configure({ mode: 'passthrough', myAddresses: '' });
    await popup.getByRole('tab', { name: 'Requests' }).click();
    const hint = popup.locator('#setup');
    await expect(hint).toContainText('Add the address your wallet shows');
    await hint.getByRole('textbox', { name: 'Add an address' }).fill(FAKE_ACCOUNT);
    await hint.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(() => worker.evaluate(() => chrome.storage.local.get('myAddresses'))).toEqual({ myAddresses: FAKE_ACCOUNT });
    // Said where it was added, then out of the way.
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Added');
    await expect(hint.getByRole('textbox')).toBeHidden();
    // The settings list it, and the address window's additions show at once.
    await popup.getByRole('tab', { name: 'Settings' }).click();
    await expect(hint).toBeHidden();
    const mine = popup.getByRole('list', { name: 'Your addresses' });
    await expect(mine.getByRole('listitem')).toHaveText([`${FAKE_ACCOUNT}Remove`]);
    await configure({ myAddresses: `${FAKE_ACCOUNT}\n${OTHER}` });
    await expect(mine.getByRole('listitem')).toHaveText([`${FAKE_ACCOUNT}Remove`, `${OTHER}Remove`]);
    // In watch mode "you" is the watched address: no list, and nothing asked.
    await configure({ mode: 'watch', address: FAKE_ACCOUNT, myAddresses: '' });
    await popup.getByRole('tab', { name: 'Requests' }).click();
    await expect(hint).toBeHidden();
});
