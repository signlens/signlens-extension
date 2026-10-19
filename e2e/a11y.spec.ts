// The pages to the keyboard and the screen reader, and at the width WCAG
// asks a page to reflow to: where focus goes when what had it goes away,
// what Escape does, what each control is called, and nothing wider than
// the window. The window is opened on a request written into storage, so
// any origin or wallet name can be tried.

import type { Page } from '@playwright/test';
import { expect, test } from './extension.ts';
import { request, windowFor } from './windows.ts';

const SELF = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';
const OTHER = 'DV3BDugD4uSbnFBwEzy6Lg4RksvPEtVCazWNwjzcL7Qp';
const LONG_ORIGIN = 'https://app.this-is-a-very-long-subdomain-for-review.staking-and-swaps-aggregator-example.com';
const UNBROKEN_ORIGIN = `https://${'a'.repeat(60)}.example`;
const LONG_WALLET = 'Solflare Wallet Extension With A Long Display Name (Beta)';

/** Records the messages `page` sends the worker from now on, by type. */
async function recordMessages(page: Page): Promise<() => Promise<string[]>> {
    await page.evaluate(() => {
        const send = chrome.runtime.sendMessage.bind(chrome.runtime);
        const sent: string[] = [];
        (window as unknown as { sent: string[] }).sent = sent;
        chrome.runtime.sendMessage = ((message: { type: string }) => {
            sent.push(message.type);
            return send(message);
        }) as typeof chrome.runtime.sendMessage;
    });
    return () => page.evaluate(() => (window as unknown as { sent: string[] }).sent);
}

/** Whether `page` is wider than its window. */
function overflows(page: Page): Promise<boolean> {
    return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

test('a window whose request is gone has its Close button focused, and Escape closes it', async ({ context, worker }) => {
    const stale = await windowFor(context, worker, null);
    await expect(stale.getByRole('button', { name: 'Close' })).toBeFocused();
    // The window may close before the key is let go.
    await stale.keyboard.press('Escape').catch(() => {});
    await expect.poll(() => stale.isClosed()).toBe(true);
});

test('Escape in the comment box, or on an open help term, leaves the request waiting; on its own it rejects', async ({
    context,
    worker,
}) => {
    const gate = await windowFor(context, worker, request());
    const sent = await recordMessages(gate);
    await gate.getByRole('button', { name: 'Unclear' }).click();
    const comment = gate.getByRole('textbox', { name: 'What was unclear or wrong? (optional)' });
    await comment.fill('Which nonce?');
    await comment.press('Escape');
    const term = gate.locator('#rows .term').first();
    await term.click();
    await expect(term).toHaveAttribute('aria-expanded', 'true');
    await term.press('Escape');
    await expect(term).toHaveAttribute('aria-expanded', 'false');
    expect(await sent()).toEqual([]);
    await expect(comment).toHaveValue('Which nonce?');
    // With nothing open, Escape is Reject.
    await term.press('Escape');
    await expect.poll(() => gate.isClosed()).toBe(true);
});

test('a help term names the note it opens, and is described by it while open', async ({ context, worker }) => {
    const gate = await windowFor(context, worker, request());
    const term = gate.locator('#rows .term').first();
    await term.click();
    const id = await term.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    const note = gate.locator(`[id="${id}"]`);
    await expect(note).toBeVisible();
    await expect(note).toHaveText(
        'This name comes from SignLens or from you: its reviewed descriptors, its verified token list, the accounts your wallet connected with, or your address book. The site could not have supplied it.',
    );
    await expect(term).toHaveAccessibleDescription(/^This name comes from SignLens or from you/);
    await term.click();
    await expect(note).toBeHidden();
    await expect(term).toHaveAttribute('aria-expanded', 'false');
    await expect(term).toHaveAccessibleDescription('');
});

test('the rating buttons keep the focus once a rating is sent', async ({ context, worker }) => {
    const gate = await windowFor(context, worker, request());
    const clear = gate.getByRole('button', { name: 'Clear', exact: true });
    await clear.focus();
    await gate.keyboard.press('Enter');
    await expect(gate.locator('#feedback-note')).not.toBeEmpty();
    await expect(clear).toBeFocused();
    await expect(clear).toHaveAttribute('aria-disabled', 'true');
});

test('each control is called by its label alone, words apart, and like controls are told apart', async ({ context, popup, worker }) => {
    await worker.evaluate(
        (history) => chrome.storage.session.set({ history, unseen: 3 }),
        [request({ decision: 'reject', time: Date.parse('2026-10-19T12:00:03Z') }), request(), request({ time: 1 })],
    );
    await worker.evaluate(
        ([self, other]) =>
            chrome.storage.local.set({
                mode: 'watch',
                address: self,
                watchSites: [
                    { origin: 'https://jup.ag', address: self, at: 1 },
                    { origin: 'https://jup.ag', address: other, at: 2 },
                ],
            }),
        [SELF, OTHER] as const,
    );
    await popup.reload();
    await expect(popup.getByRole('tab', { name: 'Requests 3 new', exact: true })).toBeVisible();
    await expect(popup.getByRole('tabpanel', { name: 'Requests', exact: true })).toBeVisible();
    await expect(popup.getByRole('heading', { name: 'Newest first', exact: true, level: 2 })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Clear requests' })).toBeVisible();
    // A row's parts are words apart, not run together.
    await expect(popup.locator('#history summary').first()).toHaveText(/^warning rejected jup\.ag · signTransaction \S/);

    await popup.getByRole('tab', { name: 'Settings' }).click();
    const ask = popup.getByRole('checkbox', { name: 'Show the explanation and ask first', exact: true });
    await expect(ask).toHaveAccessibleDescription(/^before refusing or passing a request on/);
    await expect(popup.getByRole('checkbox', { name: 'Simulate over the RPC', exact: true })).toHaveAccessibleDescription(/^and hold/);
    await expect(popup.getByRole('checkbox', { name: 'Name unlisted tokens', exact: true })).toHaveAccessibleDescription(/^from the RPC/);
    await expect(popup.getByRole('textbox', { name: 'Address to connect as', exact: true })).toBeVisible();
    await expect(popup.getByRole('textbox', { name: 'SignLens API', exact: true })).toHaveAccessibleDescription(/^Beta: every transaction/);
    await expect(popup.getByRole('textbox', { name: 'Token list (symbols)', exact: true })).toHaveAccessibleDescription(
        /mints of unlisted tokens are sent/,
    );
    await expect(popup.getByRole('button', { name: 'Revoke jup.ag for Ffz5…piwg', exact: true })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Revoke jup.ag for DV3B…L7Qp', exact: true })).toBeVisible();
    await popup.getByRole('radio', { name: /^Pass it to your wallet/ }).check();
    await expect(popup.getByRole('combobox', { name: 'Wallet to pass requests to', exact: true })).toBeVisible();

    // The window's band: the verdict, then the summary, apart.
    const gate = await windowFor(context, worker, request());
    await expect(gate.locator('#band')).toHaveText(/^warning Transfer 0\.996423 USDC/);
});

test('the keyboard keeps its place when the lists in the popup change under it', async ({ popup, worker }) => {
    const first = request();
    await worker.evaluate((history) => chrome.storage.session.set({ history }), [first]);
    await worker.evaluate(
        (self) =>
            chrome.storage.local.set({
                mode: 'watch',
                address: self,
                watchSites: [
                    { origin: 'https://jup.ag', address: self, at: 1 },
                    { origin: 'https://raydium.io', address: self, at: 2 },
                ],
            }),
        SELF,
    );
    await popup.reload();
    await popup.getByRole('tab', { name: /^Requests/ }).click();
    // A request arrives while a row is open and focused: it stays both.
    const row = popup.locator('#history summary').first();
    await row.focus();
    await popup.keyboard.press('Enter');
    await worker.evaluate((history) => chrome.storage.session.set({ history }), [request({ time: Date.now() }), first]);
    await expect(popup.locator('#history > li')).toHaveCount(2);
    await expect(popup.locator('#history > li').nth(1).locator('summary')).toBeFocused();
    await expect(popup.locator('#history > li').nth(1).locator('details')).toHaveAttribute('open', '');
    // Clear: the focus goes to the line that says the list is empty.
    await popup.getByRole('button', { name: 'Clear requests' }).focus();
    await popup.keyboard.press('Enter');
    await expect(popup.locator('#empty')).toBeFocused();

    // Revoke: the focus goes to the next site, then to the line that says there is none.
    await popup.getByRole('tab', { name: 'Settings' }).click();
    await popup.getByRole('button', { name: /^Revoke jup\.ag/ }).focus();
    await popup.keyboard.press('Enter');
    await expect(popup.getByRole('button', { name: /^Revoke raydium\.io/ })).toBeFocused();
    await popup.keyboard.press('Enter');
    await expect(popup.locator('#sites-empty')).toBeFocused();
});

test('at 320 pixels the window and the consent window reflow, whatever the origin or the wallet, and no focus ring is cut off', async ({
    context,
    worker,
}) => {
    for (const origin of [LONG_ORIGIN, UNBROKEN_ORIGIN]) {
        const gate = await windowFor(context, worker, request({ origin, upstream: LONG_WALLET }));
        await gate.setViewportSize({ width: 320, height: 640 });
        expect(await overflows(gate), origin).toBe(false);
        await expect(gate.getByRole('button', { name: `Continue to ${LONG_WALLET}` })).toBeInViewport();
        // Every focusable thing in the explanation shows its whole focus ring: nothing between it and the scrolling pane clips.
        const clipped = await gate.evaluate(
            () =>
                [...document.querySelectorAll<HTMLElement>('main button, main a')].filter((control) => {
                    for (let node = control.parentElement; node && node.tagName !== 'MAIN'; node = node.parentElement) {
                        if (getComputedStyle(node).overflow !== 'visible') return true;
                    }
                    return false;
                }).length,
        );
        expect(clipped, origin).toBe(0);
        await gate.close();

        const consent = await windowFor(context, worker, { origin, address: SELF }, 'connect.html');
        await consent.setViewportSize({ width: 320, height: 640 });
        expect(await overflows(consent), origin).toBe(false);
        await consent.close();
    }
});
