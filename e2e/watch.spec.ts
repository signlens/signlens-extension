// Watch mode's consent: no wallet stands behind SignLens to ask the user
// before a site learns the address, so SignLens asks, once per site and
// address, and the popup takes it back.

import { clickToClose, expect, liveGate, test } from './support/extension.ts';

const WALLET = 'SignLens';
const WATCHED = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';

test('a site sees the watched address only once allowed, and is not asked again', async ({ configure, context, dapp }) => {
    await configure({ mode: 'watch', address: WATCHED, askFirst: false }, { allowed: false });
    const connecting = dapp.evaluate((wallet: string) => window.connect(wallet), WALLET);
    const ask = await liveGate(context, 'connect.html');
    await expect(ask.locator('#where .host')).toContainText('localhost');
    await expect(ask.locator('#where')).toContainText('wants to see the address SignLens watches');
    await expect(ask.locator('#address')).toHaveText(WATCHED);
    await expect(ask.getByRole('heading', { level: 1 })).toHaveText('Connect watch-only');
    await expect(ask.locator('.aside')).toContainText('Deny refuses this time only: the site asks again the next time it connects.');
    // Denying is where the focus is: Enter cannot allow.
    await expect(ask.getByRole('button', { name: 'Deny' })).toBeFocused();
    await clickToClose(ask.getByRole('button', { name: 'Allow' }));
    expect(await connecting).toBe(WATCHED);
    // The window closes once it has answered, which may be just after the page has its address.
    await expect.poll(() => ask.isClosed()).toBe(true);

    // Asked again, the site gets it at once: a window would hold the connect until answered.
    expect(await dapp.evaluate((wallet: string) => window.connect(wallet), WALLET)).toBe(WATCHED);
    expect(context.pages().filter((page) => !page.isClosed() && page.url().includes('connect.html'))).toEqual([]);
});

test('denying, or closing the window, refuses the connect, allows nothing, and the requests say so', async ({
    configure,
    context,
    dapp,
    popup,
    worker,
}) => {
    await configure({ mode: 'watch', address: WATCHED, askFirst: false }, { allowed: false });
    const connect = () => dapp.evaluate((wallet: string) => window.connect(wallet).catch((error: Error) => error.message), WALLET);

    let connecting = connect();
    await clickToClose((await liveGate(context, 'connect.html')).getByRole('button', { name: 'Deny' }));
    expect(await connecting).toContain('the connection was refused in SignLens');

    connecting = connect();
    await (await liveGate(context, 'connect.html')).close();
    expect(await connecting).toContain('the connection was refused in SignLens');
    expect(await worker.evaluate(() => chrome.storage.local.get('watchSites'))).toEqual({ watchSites: [] });
    expect(await dapp.evaluate((wallet: string) => window.accountsOf(wallet), WALLET)).toEqual([]);

    // Both are in the requests: which site asked, and that it was denied.
    await popup.reload();
    await popup.getByRole('tab', { name: /^Requests/ }).click();
    const rows = popup.locator('#history > li');
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
        await expect(row.locator('.verdict')).toHaveText('connect');
        await expect(row.locator('.decision')).toHaveText('denied');
        await expect(row.locator('.where')).toHaveText(/^localhost:\d+ · connect$/);
        await expect(row.locator('.lead')).toHaveText(`Asked to see the watched address ${WATCHED}`);
    }
});

test('a silent connect never opens a window: it gets the address only where allowed before', async ({ configure, context, dapp }) => {
    await configure({ mode: 'watch', address: WATCHED, askFirst: false }, { allowed: false });
    expect(await dapp.evaluate((wallet: string) => window.connectSilently(wallet), WALLET)).toEqual([]);
    expect(context.pages().filter((page) => page.url().includes('connect.html'))).toEqual([]);

    await configure({ mode: 'watch', address: WATCHED });
    expect(await dapp.evaluate((wallet: string) => window.connectSilently(wallet), WALLET)).toEqual([WATCHED]);
});

test('the popup lists the sites allowed, and revoking one disconnects it', async ({ configure, dapp, popup }) => {
    await configure({ mode: 'watch', address: WATCHED, askFirst: false });
    expect(await dapp.evaluate((wallet: string) => window.connect(wallet), WALLET)).toBe(WATCHED);

    await popup.reload();
    await popup.getByRole('tab', { name: 'Settings' }).click();
    const sites = popup.getByRole('list', { name: 'Sites that may see it' });
    await expect(sites.getByRole('listitem')).toHaveCount(1);
    await expect(sites.getByRole('listitem')).toContainText('localhost');
    await expect(sites.getByRole('listitem')).toContainText('Ffz5…piwg');
    await sites.getByRole('button', { name: /^Revoke localhost/ }).click();
    await expect(sites.getByRole('listitem')).toHaveCount(0);
    await expect(popup.locator('#sites-empty')).toBeVisible();

    // The page that had it loses it, and the next connect asks again.
    await expect.poll(() => dapp.evaluate((wallet: string) => window.accountsOf(wallet), WALLET)).toEqual([]);
    expect(await dapp.evaluate((wallet: string) => window.connectSilently(wallet), WALLET)).toEqual([]);
});
