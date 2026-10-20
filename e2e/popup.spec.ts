// The popup's two views: the requests, with what arrived since it was last
// open, and the settings.

import { expect, test } from './extension.ts';
import { feePayer, fixture } from './server.ts';

const WALLET = 'SignLens';

test('with nothing to show the popup opens on the settings', async ({ configure, popup }) => {
    await configure({ lookupTokens: false, simulate: false });
    await popup.reload();
    await expect(popup.locator('#view-settings')).toBeVisible();
    await expect(popup.locator('#view-requests')).toBeHidden();
    await expect(popup.locator('#tab-settings')).toHaveAttribute('aria-selected', 'true');
    await expect(popup.locator('#unseen')).toBeHidden();
});

test('the views are tabs: the arrow keys move between them, and only the chosen one takes Tab', async ({ popup }) => {
    const requests = popup.getByRole('tab', { name: 'Requests' });
    const settings = popup.getByRole('tab', { name: 'Settings' });
    await expect(popup.getByRole('tablist', { name: 'Views' })).toBeVisible();
    await expect(settings).toHaveAttribute('aria-selected', 'true');
    await expect(settings).toHaveAttribute('tabindex', '0');
    await expect(requests).toHaveAttribute('tabindex', '-1');
    await expect(popup.getByRole('tabpanel', { name: 'Settings' })).toBeVisible();

    await settings.focus();
    await popup.keyboard.press('ArrowLeft');
    await expect(requests).toBeFocused();
    await expect(requests).toHaveAttribute('aria-selected', 'true');
    await expect(requests).toHaveAttribute('tabindex', '0');
    await expect(popup.getByRole('tabpanel', { name: 'Requests' })).toBeVisible();
    await expect(popup.locator('#view-settings')).toBeHidden();
    // Past the first, the last; Home and End go to the ends.
    await popup.keyboard.press('ArrowLeft');
    await expect(settings).toBeFocused();
    await popup.keyboard.press('Home');
    await expect(requests).toBeFocused();
    await popup.keyboard.press('End');
    await expect(settings).toBeFocused();
    await expect(settings).toHaveAttribute('aria-selected', 'true');
});

test('new requests open the popup on them, counted until seen, each with its summary line', async ({
    configure,
    context,
    dapp,
    extensionId,
    worker,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ askFirst: false, lookupTokens: false, simulate: false, mode: 'watch', address: feePayer(transfer.bytes) });
    for (let i = 0; i < 2; i += 1) {
        await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
            wallet: WALLET,
            base64: transfer.base64,
        });
    }
    expect(await worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('WARN');

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('#view-requests')).toBeVisible();
    await expect(popup.locator('#view-settings')).toBeHidden();
    await expect(popup.locator('#unseen')).toHaveText('2 new');
    await expect(popup.locator('#history > li')).toHaveCount(2);
    await expect(popup.locator('#history li').first().locator('.lead')).toHaveText('Send 0.996423 USDC (verified) to DV3B…L7Qp');
    await expect(popup.locator('#history > li').first().locator('.where')).toHaveText(/^localhost:\d+ · signTransaction$/);
    await expect.poll(() => worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('');

    // Seen: the count goes, and the view last used comes back next time.
    await popup.locator('#tab-settings').click();
    await expect(popup.locator('#view-settings')).toBeVisible();
    await popup.reload();
    await expect(popup.locator('#engine-status')).toHaveClass(/\b(up|down)\b/);
    await expect(popup.locator('#unseen')).toBeHidden();
    await expect(popup.locator('#view-settings')).toBeVisible();

    // Until a request arrives.
    await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    await popup.reload();
    await expect(popup.locator('#view-requests')).toBeVisible();
    await expect(popup.locator('#unseen')).toHaveText('1 new');
});
