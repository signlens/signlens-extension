// The language chosen in the settings (language.ts): the popup's settings
// and the setup page offer the browser's languages, the default, and each
// language the interface is worded in, named in itself; a choice rewords
// the page at once, and every page and every explanation after it, in
// place of the browser's languages.

import type { BrowserContext, Page } from '@playwright/test';
import { fixture } from '../test/server.ts';
import { clickToClose, expect, liveGate, test } from './support/extension.ts';
import { CHINESE, carriesChinese, eachPage, englishLeft } from './support/words.ts';

const WALLET = 'SignLens';

/** Starts a signing request and returns it with the window the gate opened. */
async function askToSign(context: BrowserContext, dapp: Page, base64: string) {
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64,
    });
    const gate = await liveGate(context);
    return { signing, gate };
}

/** The choices `page`'s select offers, as it shows them and as it saves them. */
async function choices(page: Page): Promise<{ text: string; value: string }[]> {
    return page
        .locator('#language option')
        .evaluateAll((options) =>
            options.map((option) => ({ text: option.textContent ?? '', value: (option as HTMLOptionElement).value })),
        );
}

test("the popup offers the browser's languages, then each language in itself, and words itself at once in the one chosen", async ({
    context,
    extensionId,
    popup,
    worker,
}) => {
    await popup.locator('#tab-settings').click();
    expect(await choices(popup)).toEqual([
        { text: "Your browser's languages (English)", value: '' },
        { text: 'English', value: 'en' },
        { text: '简体中文', value: 'zh-Hans' },
    ]);
    await expect(popup.locator('#language')).toHaveValue('');

    await popup.locator('#language').selectOption('zh-Hans');
    await expect(popup.locator('html')).toHaveAttribute('lang', 'zh-Hans');
    await expect(popup.locator('#language')).toHaveValue('zh-Hans');
    expect(await worker.evaluate(() => chrome.storage.local.get('language'))).toEqual({ language: 'zh-Hans' });

    // The setup page has the same choice, and the browser's languages back.
    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${extensionId}/welcome.html`);
    await expect(setup.locator('html')).toHaveAttribute('lang', 'zh-Hans');
    await expect(setup.locator('#language')).toHaveValue('zh-Hans');
    await setup.locator('#language').selectOption('');
    await expect(setup.locator('html')).toHaveAttribute('lang', 'en');
    await expect(setup.locator('#language')).toHaveValue('');
    expect(await worker.evaluate(() => chrome.storage.local.get('language'))).toEqual({ language: '' });
});

test("a language chosen words every page in it, whatever the browser's", async ({ context, extensionId, popup, worker }) => {
    await worker.evaluate(() => chrome.storage.local.set({ language: 'zh-Hans' }));
    await eachPage({ context, extensionId, popup, worker }, async (page, state) => {
        await expect(page.locator('html'), state).toHaveAttribute('lang', 'zh-Hans');
        expect(await englishLeft(page, 'zh-Hans', CHINESE), state).toEqual([]);
    });
});

test('a reader who chooses Simplified Chinese in an English browser is explained to in it, and can read the English', async ({
    configure,
    context,
    dapp,
    server,
}) => {
    test.skip(!(await carriesChinese(server.api)), 'the API carries no Simplified Chinese pack');
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet', language: 'zh-Hans' });

    const { signing, gate } = await askToSign(context, dapp, transfer.base64);
    await expect(gate.locator('html')).toHaveAttribute('lang', 'zh-Hans');
    await expect(gate.locator('.summary-line')).toContainText('转账 0.996423 USDC');
    await gate.getByRole('button', { name: '显示英文原文' }).click();
    await expect(gate.locator('.summary-line')).toContainText('Transfer 0.996423 USDC from');
    // The language chosen is the reader's own, which the window offers back.
    await expect(gate.getByRole('button', { name: '以您的语言显示' })).toBeVisible();
    await clickToClose(gate.getByRole('button', { name: '拒绝', exact: true }));
    expect((await signing).error).toContain('User rejected the request in SignLens');
});

test.describe('a reader whose browser asks for Chinese', () => {
    test.use({ browserLocale: 'zh-CN' });

    test('who chooses English is explained to in English, with no other language to switch to', async ({ configure, context, dapp }) => {
        const transfer = fixture('legacy_durable_nonce_token_transfer');
        await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet', language: 'en' });

        const { signing, gate } = await askToSign(context, dapp, transfer.base64);
        await expect(gate.locator('html')).toHaveAttribute('lang', 'en');
        await expect(gate.locator('.summary-line')).toContainText('Transfer 0.996423 USDC from');
        await expect(gate.getByRole('button', { name: /Show in/ })).toHaveCount(0);
        await clickToClose(gate.getByRole('button', { name: 'Reject', exact: true }));
        expect((await signing).error).toContain('User rejected the request in SignLens');
    });
});

test.describe('a reader whose browser asks for Traditional Chinese', () => {
    test.use({ browserLocale: 'zh-TW' });

    test("reads English, which the browser's languages give, until choosing Simplified Chinese", async ({ popup }) => {
        await expect(popup.locator('html')).toHaveAttribute('lang', 'en');
        await popup.locator('#tab-settings').click();
        await expect(popup.locator('#language option').first()).toHaveText("Your browser's languages (English)");
        await popup.locator('#language').selectOption('zh-Hans');
        await expect(popup.locator('html')).toHaveAttribute('lang', 'zh-Hans');
    });
});
