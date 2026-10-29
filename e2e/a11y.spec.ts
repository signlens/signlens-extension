// The pages to the keyboard and the screen reader, and at the width WCAG
// asks a page to reflow to: where focus goes when what had it goes away,
// what Escape does, what each control is called, and nothing wider than
// the window. The window is opened on a request written into storage, so
// any origin or wallet name can be tried.

import type { Locator, Page } from '@playwright/test';
import { closing, expect, test } from './support/extension.ts';
import { request, transferRow, windowFor, words } from './support/windows.ts';

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
    await closing(stale, () => stale.keyboard.press('Escape'));
});

test('Escape in the comment box, or on an open help term or toggle, closes that and leaves the request waiting; on its own it rejects', async ({
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
    const toggle = gate.getByRole('button', { name: 'Full text, as the engine prints it' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    expect(await sent()).toEqual([]);
    await expect(comment).toHaveValue('Which nonce?');
    // With nothing open, Escape is Reject.
    await closing(gate, () => term.press('Escape'));
});

test("the focus ring on a button filled with the ring's own colour stands clear of it", async ({ context, worker }) => {
    const gate = await windowFor(context, worker, request());
    const proceed = gate.getByRole('button', { name: 'Continue to Fake Wallet' });
    await proceed.focus();
    await gate.keyboard.press('Shift+Tab');
    await gate.keyboard.press('Tab');
    await expect(proceed).toBeFocused();
    const ring = await proceed.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
            offset: Number.parseFloat(style.outlineOffset),
            width: Number.parseFloat(style.outlineWidth),
            same: style.outlineColor === style.backgroundColor,
        };
    });
    // The ring is the fill's colour: only a gap of the page between them sets it off.
    expect(ring.same).toBe(true);
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(ring.offset).toBeGreaterThanOrEqual(2);
});

test("the verdict describes the buttons, and a transaction's findings have a heading of their own", async ({ context, worker }) => {
    const gate = await windowFor(context, worker, request());
    // The window opens on Reject: what it would reject is heard with it, and what Continue does with Continue.
    await expect(gate.getByRole('button', { name: 'Reject' })).toHaveAccessibleDescription(/^warning Transfer 0\.996423 USDC/);
    await expect(gate.getByRole('button', { name: 'Continue to Fake Wallet' })).toHaveAccessibleDescription(
        /^warning Transfer 0\.996423 USDC.* Continue hands the request unchanged to Fake Wallet, which asks for its own approval\.$/,
    );
    await expect(gate.getByRole('heading', { level: 2 })).toHaveText(['What SignLens found', 'What this does']);
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
        'This name comes from SignLens or from you: its reviewed descriptors, its verified token list, your addresses in its settings, or your address book. The site could not have supplied it.',
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

/** Whether `locator`, scrolled to, is whole in the viewport and nothing lies over its middle. */
async function reachable(locator: Locator): Promise<boolean> {
    await locator.scrollIntoViewIfNeeded();
    return locator.evaluate((node) => {
        const box = node.getBoundingClientRect();
        if (box.height === 0 || box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) return false;
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return top !== null && (top === node || node.contains(top));
    });
}

/** Whether the explanation scrolls with the page, as one, or in its own pane, and that pane's share of the window. */
function explanationRoom(page: Page): Promise<{ withPage: boolean; share: number }> {
    return page.evaluate(() => {
        const main = document.querySelector('main') as HTMLElement;
        return { withPage: getComputedStyle(main).overflowY === 'visible', share: main.clientHeight / innerHeight };
    });
}

test('a window 256 pixels high (400% zoom) still shows every part of it, as the page scrolls', async ({ context, worker }) => {
    // The band carries the most serious summary, which can run to several lines.
    const summary =
        '3 actions: Transfer 0.0005 SOL from 8Aet...tiTo to 879A...MGsA; Wrap 0.0495 SOL into wrapped SOL account ' +
        '4hJnan1NC4BuwPSn41WAQ7yG3zMK5JfXzDiq8jw2VH6R via DFlow; DFlow swap whose route cannot be resolved';
    const rows = [transferRow(), { ...transferRow(), verdict: 'blocked' as const, summary: words(summary) }, transferRow()];
    const gate = await windowFor(context, worker, request({ rows, origin: LONG_ORIGIN, upstream: LONG_WALLET }));
    await gate.setViewportSize({ width: 320, height: 256 });
    for (const target of [
        gate.locator('#band-summary'),
        gate.locator('#rows > li').first().getByRole('heading', { level: 2 }),
        gate.locator('ul.effects li').first(),
        gate.locator('#rows > li').last().getByRole('link', { name: 'Save transaction 3' }),
        gate.getByRole('button', { name: 'Clear', exact: true }),
        gate.getByRole('button', { name: 'Reject' }),
        gate.getByRole('button', { name: `Continue anyway to ${LONG_WALLET}` }),
    ]) {
        expect(await reachable(target), String(target)).toBe(true);
    }
    expect(await overflows(gate)).toBe(false);
    // The question "Continue anyway" asks fits too, and each of its buttons can be reached.
    await gate.getByRole('button', { name: `Continue anyway to ${LONG_WALLET}` }).click();
    for (const button of await gate.getByRole('dialog').getByRole('button').all()) expect(await reachable(button), 'question').toBe(true);
    expect(await overflows(gate)).toBe(false);
    await gate.keyboard.press('Escape');
    await expect(gate.getByRole('dialog')).toBeHidden();
    // Zoomed less, the explanation still has room: at 200% (260 by 340), or 320 by 480, the page scrolls as one rather
    // than leave it a sliver between the header and the buttons; at the size it opens, it has its own pane, a fair share.
    for (const [width, height] of [
        [320, 256],
        [260, 340],
        [320, 480],
    ] as const) {
        await gate.setViewportSize({ width, height });
        // A resized window lays out again in its own time.
        await expect.poll(async () => (await explanationRoom(gate)).withPage, { message: `${width} by ${height}` }).toBe(true);
    }
    await gate.setViewportSize({ width: 520, height: 680 });
    await expect.poll(async () => (await explanationRoom(gate)).withPage).toBe(false);
    expect((await explanationRoom(gate)).share).toBeGreaterThanOrEqual(1 / 3);
    for (const [page, pending] of [
        ['connect.html', { origin: LONG_ORIGIN, address: SELF }],
        ['address.html', { origin: LONG_ORIGIN, address: SELF, mine: [SELF, SELF, SELF] }],
    ] as const) {
        const small = await windowFor(context, worker, pending, page);
        await small.setViewportSize({ width: 320, height: 256 });
        for (const button of await small.locator('footer button').all()) expect(await reachable(button), page).toBe(true);
        expect(await overflows(small), page).toBe(false);
        await small.close();
    }
});

test('at 320 pixels the window, the consent and the address windows reflow, whatever the origin or the wallet, and no focus ring is cut off', async ({
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

        const address = await windowFor(context, worker, { origin, address: SELF, mine: [SELF, SELF] }, 'address.html');
        await address.setViewportSize({ width: 320, height: 640 });
        expect(await overflows(address), origin).toBe(false);
        await expect(address.getByRole('button', { name: "It's mine, add it" })).toBeInViewport();
        await address.close();
    }
});
