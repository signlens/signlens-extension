// Which wallet signs, asked once: with several wallets in the page and none
// chosen, a connect the user makes opens a window that lists them, with
// their icons. The one chosen is kept in the settings, and the next connect
// asks nothing; closing the window chooses none, and the connect is refused.

import { clickToClose, closing, expect, FAKE_ACCOUNT, liveGate, test } from './support/extension.ts';

/** The test dapp's wallet's icon (test/dapp.html). */
const FAKE_ICON = 'data:image/svg+xml;base64,PHN2Zy8+';

test('with several wallets and none chosen, a connect asks which; the one chosen is kept, and not asked about again', async ({
    configure,
    context,
    dapp,
    worker,
}) => {
    await configure({ mode: 'passthrough', upstream: '' });
    // Its icon an address to fetch, which the window never shows.
    await dapp.evaluate(() => window.addWallet('Other Wallet', 'https://wallet.example/icon.png'));
    const connecting = dapp.evaluate(() => window.connect('SignLens'));
    const chooser = await liveGate(context, 'wallet.html');
    // The page's wallets, by the names and icons they gave themselves; never SignLens.
    const wallets = chooser.getByRole('list', { name: 'Wallets on this page' }).getByRole('button');
    await expect(wallets).toHaveCount(2);
    await expect(wallets.nth(0)).toHaveAccessibleName('Fake Wallet');
    await expect(wallets.nth(1)).toHaveAccessibleName('Other Wallet');
    await expect(wallets.nth(0).locator('img')).toHaveAttribute('src', FAKE_ICON);
    // In place of the icon not shown, the initial.
    await expect(wallets.nth(1).locator('img')).toHaveCount(0);
    await expect(wallets.nth(1).locator('.wallet-icon')).toHaveText('O');
    await expect(chooser.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await clickToClose(chooser.getByRole('button', { name: 'Fake Wallet' }));
    expect(await connecting).toBe(FAKE_ACCOUNT);
    await expect.poll(() => worker.evaluate(() => chrome.storage.local.get('upstream'))).toEqual({ upstream: 'Fake Wallet' });
    // Kept: the next connect goes straight to it.
    expect(await dapp.evaluate(() => window.connect('SignLens'))).toBe(FAKE_ACCOUNT);
    expect(context.pages().filter((page) => !page.isClosed() && page.url().includes('wallet.html'))).toEqual([]);
});

test('closing the window chooses no wallet: the connect is refused, saying so', async ({ configure, context, dapp, worker }) => {
    await configure({ mode: 'passthrough', upstream: '' });
    await dapp.evaluate(() => window.addWallet('Other Wallet'));
    const connecting = dapp.evaluate(() =>
        window.connect('SignLens').then(
            () => 'connected',
            (error: Error) => error.message,
        ),
    );
    const chooser = await liveGate(context, 'wallet.html');
    await closing(chooser, () => chooser.keyboard.press('Escape'));
    expect(await connecting).toBe('SignLens: no wallet was chosen');
    expect(await worker.evaluate(() => chrome.storage.local.get('upstream'))).toEqual({ upstream: '' });
});
