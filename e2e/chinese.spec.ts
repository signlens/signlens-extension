// A reader whose browser asks for Chinese (ADR-0015, phase 4): the engine
// explains in Simplified Chinese, the window offers the English beside it,
// and the popup names the language and when it was reviewed.

import type { BrowserContext, Page } from '@playwright/test';
import { fixture } from '../test/server.ts';
import { clickToClose, expect, liveGate, test } from './support/extension.ts';

test.use({ browserLocale: 'zh-CN' });

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

/** Whether the API the suite talks to carries Simplified Chinese: recorded, it does; live, one deployed before phase 4 does not. */
async function carriesChinese(api: string): Promise<boolean> {
    const status = (await (await fetch(`${api}/v1/packs`)).json()) as { locales?: { locale: string }[] };
    return (status.locales ?? []).some(({ locale }) => locale === 'zh-Hans');
}

test('a reader asking for Chinese is answered in Chinese, and can read it in English', async ({ configure, context, dapp, server }) => {
    test.skip(!(await carriesChinese(server.api)), 'the API carries no Simplified Chinese pack');
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: 'Fake Wallet' });

    const { signing, gate } = await askToSign(context, dapp, transfer.base64);
    await expect(gate.locator('[lang="zh-Hans"]').first()).toBeVisible();
    await expect(gate.locator('.summary-line')).toContainText('转账 0.996423 USDC');
    await expect(gate.locator('.findings')).toContainText('此签名没有时间限制');

    // The English, explained anew, and the way back to the reader's language.
    await gate.getByRole('button', { name: 'Show in English' }).click();
    await expect(gate.locator('.summary-line')).toContainText('Transfer 0.996423 USDC from');
    await expect(gate.locator('[lang="zh-Hans"]')).toHaveCount(0);
    await expect(gate.getByRole('button', { name: 'Show in your language' })).toBeVisible();

    await clickToClose(gate.getByRole('button', { name: 'Reject' }));
    expect((await signing).error).toContain('User rejected the request in SignLens');
});

test('the popup names the languages the API explains in, and when they were reviewed', async ({ configure, popup, server }) => {
    test.skip(!(await carriesChinese(server.api)), 'the API carries no Simplified Chinese pack');
    await configure({ apiUrl: server.api });
    await popup.reload();
    await expect(popup.locator('#engine-status')).toContainText(
        'Explains in English, and in 简体中文 (zh-Hans), reviewed on 2026-10-31, when your browser asks for it.',
    );
});
