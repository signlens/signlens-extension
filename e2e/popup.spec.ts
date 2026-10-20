// The popup's two views: the requests, with what arrived since it was last
// open, and the settings.

import { feePayer, fixture } from '../test/server.ts';
import { expect, test } from './support/extension.ts';
import { request } from './support/windows.ts';

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

test("a row's call is never broken inside a word, whatever the length of its date and outcome", async ({ popup, worker }) => {
    // The longest outcome and call there are, today and in another year, whose date is the longest a row shows.
    const longest = { method: 'solana:signAndSendTransaction', decision: 'continue', unasked: true } as const;
    const lastYear = new Date(new Date().getFullYear() - 1, 2, 4, 12, 0).getTime();
    await worker.evaluate(
        (history) => chrome.storage.session.set({ history, unseen: 0 }),
        [request({ ...longest, time: Date.now() }), request({ ...longest, time: lastYear }), request({ time: lastYear - 60_000 })],
    );
    await popup.reload();
    await popup.getByRole('tab', { name: /^Requests/ }).click();
    const rows = popup.locator('#history > li');
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
        const where = rows.nth(i).locator('.where');
        // The lines the call's text lands on, measured on the text itself.
        const lines = await where.evaluate((node) => {
            const text = node.textContent ?? '';
            const call = text.slice(text.lastIndexOf(' ') + 1);
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            for (let at = walker.nextNode(); at; at = walker.nextNode()) {
                const start = (at.textContent ?? '').indexOf(call);
                if (start < 0) continue;
                const range = document.createRange();
                range.setStart(at, start);
                range.setEnd(at, start + call.length);
                return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
            }
            return 0;
        });
        expect(lines, (await where.textContent()) ?? '').toBe(1);
        // And nothing in the row reaches past it.
        const line = rows.nth(i).locator('.row-line');
        expect(await line.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    // Today's by the time; another day's by the date and the minute; each in full on hover.
    await expect(rows.nth(0).locator('time')).toHaveText(/^\d{1,2}:\d{2}:\d{2}\s[AP]M$/);
    await expect(rows.nth(1).locator('time')).toHaveText(/^Mar 4, \d{4}, 12:00\s[AP]M$/);
    await expect(rows.nth(1).locator('time')).toHaveAttribute('title', /March 4, \d{4}/);
});
