// Every page in the pseudo-locale (en-XA, ADR-0015 decision 11), in the
// states axe.spec.ts checks: each of the extension's own words comes out
// accented and bracketed, so a visible text or a worded attribute that
// does not was left in code. What a page shows of data (addresses, sites,
// names, numbers, times) is not the interface's words, nor are the
// engine's, which carry the explanation's language.

import type { Page } from '@playwright/test';
import type { ExplainedRow } from '../src/shared/model.ts';
import { expect, test } from './support/extension.ts';
import { request, transferRow, windowFor } from './support/windows.ts';

test.use({ browserLocale: 'en-XA' });

const WATCHED = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';

/** The words `page` shows, or puts in an attribute, in plain English: the interface's words left in code. */
async function englishLeft(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const PSEUDO = /[[\]áéíóúýñçÁÉÍÓÚÝÑÇ·]/;
        const DATA = [
            /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, // an address
            /^[1-9A-HJ-NP-Za-km-z]{4}…[1-9A-HJ-NP-Za-km-z]{4}$/, // an address, shortened
            /^(?:https?:\/\/)?[\w.-]+\.[a-z]{2,}(?::\d+)?\/?$|^localhost(?::\d+)?$|^https?:\/\/$/, // a site, or its scheme
            /^[a-z]+:[A-Za-z]+$|^[a-z]+[A-Z][A-Za-z]*$/, // a method, solana:signTransaction
            /^(?:SignLens|Phantom|Backpack|MetaMask|Solflare|Fake Wallet|Solana|USDC)$/, // a name
            /^[\d\s.,:%/+()-]+$/, // a number, a time
        ];
        const left = new Set<string>();
        const check = (text: string, where: Element): void => {
            const value = text.replace(/\s+/g, ' ').trim();
            if (!/[A-Za-z]{2,}/.test(value) || PSEUDO.test(value) || DATA.some((data) => data.test(value))) return;
            // The engine's words, marked with the explanation's language, and what is data by its element.
            if ((where.closest('[lang]')?.getAttribute('lang') ?? 'en-XA') !== 'en-XA') return;
            if (where.closest('script, style, code, kbd, time, .key, input, textarea, option')) return;
            const name = `${where.tagName.toLowerCase()}${where.id ? `#${where.id}` : ''}${where.classList.length ? `.${[...where.classList].join('.')}` : ''}`;
            left.add(`${name}: ${value.slice(0, 90)}`);
        };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode())
            if (node.parentElement) check(node.textContent ?? '', node.parentElement);
        for (const element of document.querySelectorAll('[title], [aria-label], [placeholder], [alt]'))
            for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) check(element.getAttribute(attribute) ?? '', element);
        check(document.title, document.documentElement);
        return [...left];
    });
}

test('the setup page', async ({ context, extensionId }) => {
    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${extensionId}/welcome.html`);
    await expect(setup.locator('#my-addresses')).toHaveAttribute('data-ready', 'true');
    await expect(setup.locator('html')).toHaveAttribute('lang', 'en-XA');
    const add = setup.locator('#my-addresses input');
    await add.fill('nope');
    await add.press('Enter');
    expect(await englishLeft(setup)).toEqual([]);
});

test('the popup, its requests and its settings', async ({ popup, worker }) => {
    await worker.evaluate(
        (history) => chrome.storage.session.set({ history, unseen: 2 }),
        [
            request({ decision: 'reject', refused: 'the page closed or reloaded', said: { id: 'worker-refused-page-gone' } }),
            request({ time: 1 }),
        ],
    );
    await worker.evaluate(
        (address) =>
            chrome.storage.local.set({
                mode: 'watch',
                address,
                watchSites: [{ origin: 'https://jup.ag', address, at: 1 }],
                apiUrl: 'http://10.0.0.1',
            }),
        WATCHED,
    );
    await popup.reload();
    await popup.locator('#history summary').first().click();
    expect(await englishLeft(popup)).toEqual([]);
    await popup.locator('#tab-settings').click();
    expect(await englishLeft(popup)).toEqual([]);
    await worker.evaluate((address) => chrome.storage.local.set({ mode: 'passthrough', myAddresses: address }), WATCHED);
    await popup.reload();
    await popup.locator('#tab-settings').click();
    expect(await englishLeft(popup)).toEqual([]);
    await worker.evaluate(() => chrome.storage.local.set({ myAddresses: '' }));
    await popup.locator('#tab-requests').click();
    await expect(popup.locator('#setup')).toBeVisible();
    expect(await englishLeft(popup)).toEqual([]);
});

test('the window, with what a reader opens in it', async ({ context, worker }) => {
    const gate = await windowFor(context, worker, request());
    await gate.locator('#rows .term:visible').first().click();
    expect(await englishLeft(gate)).toEqual([]);
});

test('the window for several transactions, the question before continuing, and a request gone', async ({ context, worker }) => {
    const rows: ExplainedRow[] = [transferRow(), { ...transferRow(), verdict: 'blocked' }, { ...transferRow(), verdict: 'ok' }];
    const several = await windowFor(context, worker, request({ rows }));
    expect(await englishLeft(several)).toEqual([]);
    const stale = await windowFor(context, worker, null);
    expect(await englishLeft(stale)).toEqual([]);
});

test('the consent window, the address window and the wallet window', async ({ context, worker }) => {
    const consent = await windowFor(context, worker, { origin: 'https://jup.ag', address: WATCHED }, 'connect.html');
    expect(await englishLeft(consent)).toEqual([]);
    const address = await windowFor(
        context,
        worker,
        { origin: 'https://jup.ag', address: 'EXkwQoWHvDj7gdLdba4zWo3ktJNocyjT9DDQAryU7Tqa', mine: [WATCHED] },
        'address.html',
    );
    expect(await englishLeft(address)).toEqual([]);
    const wallets = await windowFor(
        context,
        worker,
        {
            origin: 'https://jup.ag',
            wallets: [{ name: 'Phantom', icon: 'data:image/svg+xml;base64,PHN2Zy8+' }, { name: 'Backpack' }, { name: 'MetaMask' }],
        },
        'wallet.html',
    );
    expect(await englishLeft(wallets)).toEqual([]);
});
