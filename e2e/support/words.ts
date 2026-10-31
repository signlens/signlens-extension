// The interface's words left in code, found on every page worded in a
// locale other than English (ADR-0015, decision 11): a visible text or a
// worded attribute is the interface's when it carries the locale's mark
// (the pseudo-locale's accents and brackets, Chinese characters); one in
// plain English without it was left in code. Data (addresses, sites,
// names, numbers, times) and the engine's words, which carry the
// explanation's language, are not the interface's.

import type { BrowserContext, Page, Worker } from '@playwright/test';
import type { ExplainedRow } from '../../src/shared/model.ts';
import { expect } from './extension.ts';
import { request, transferRow, windowFor } from './windows.ts';

const WATCHED = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';

/** The words `page` shows, or puts in an attribute, in plain English, the interface's being worded in `locale` and marked by `mark`. */
export async function englishLeft(page: Page, locale: string, mark: RegExp): Promise<string[]> {
    return page.evaluate(
        ([locale, source, flags]) => {
            const MARK = new RegExp(source, flags);
            const DATA = [
                /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, // an address
                /^[1-9A-HJ-NP-Za-km-z]{4}…[1-9A-HJ-NP-Za-km-z]{4}$/, // an address, shortened
                /^(?:https?:\/\/)?[\w.-]+\.[a-z]{2,}(?::\d+)?\/?(?: ·)?$|^localhost(?::\d+)?$|^https?:\/\/$/, // a site, or its scheme, before a separator
                /^[a-z]+:[A-Za-z]+$|^[a-z]+[A-Z][A-Za-z]*$/, // a method, solana:signTransaction
                /^(?:SignLens|SignLens API|RPC|API|Phantom|Backpack|MetaMask|Solflare|Fake Wallet|Solana|USDC)$/, // a name
                /^[\d\s.,:%/+()-]+$/, // a number, a time
            ];
            const left = new Set<string>();
            const check = (text: string, where: Element): void => {
                const value = text.replace(/\s+/g, ' ').trim();
                if (!/[A-Za-z]{2,}/.test(value) || MARK.test(value) || DATA.some((data) => data.test(value))) return;
                // The engine's words, marked with the explanation's language, and what is data by its element.
                if ((where.closest('[lang]')?.getAttribute('lang') ?? locale) !== locale) return;
                if (where.closest('script, style, code, kbd, time, .key, input, textarea, option')) return;
                const name = `${where.tagName.toLowerCase()}${where.id ? `#${where.id}` : ''}${where.classList.length ? `.${[...where.classList].join('.')}` : ''}`;
                left.add(`${name}: ${value.slice(0, 90)}`);
            };
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode())
                if (node.parentElement) check(node.textContent ?? '', node.parentElement);
            for (const element of document.querySelectorAll('[title], [aria-label], [placeholder], [alt]'))
                for (const attribute of ['title', 'aria-label', 'placeholder', 'alt'])
                    check(element.getAttribute(attribute) ?? '', element);
            check(document.title, document.documentElement);
            return [...left];
        },
        [locale, mark.source, mark.flags] as const,
    );
}

/**
 * Every page, in the states axe.spec.ts checks, each handed to `visit`
 * once it shows: the setup page, the popup's requests and its settings in
 * watch mode and in pass-through, the requests with no address yet, the
 * window for one transaction and for three, a request gone, and the
 * consent, address and wallet windows.
 */
export async function eachPage(
    fixtures: { context: BrowserContext; extensionId: string; popup: Page; worker: Worker },
    visit: (page: Page, state: string) => Promise<void>,
): Promise<void> {
    const { context, extensionId, popup, worker } = fixtures;
    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${extensionId}/welcome.html`);
    await expect(setup.locator('#my-addresses')).toHaveAttribute('data-ready', 'true');
    const add = setup.locator('#my-addresses input');
    await add.fill('nope');
    await add.press('Enter');
    await visit(setup, 'the setup page');

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
    await visit(popup, "the popup's requests");
    await popup.locator('#tab-settings').click();
    await visit(popup, "the popup's settings, in watch mode");
    await worker.evaluate((address) => chrome.storage.local.set({ mode: 'passthrough', myAddresses: address }), WATCHED);
    await popup.reload();
    await popup.locator('#tab-settings').click();
    await visit(popup, "the popup's settings, in pass-through");
    await worker.evaluate(() => chrome.storage.local.set({ myAddresses: '' }));
    await popup.locator('#tab-requests').click();
    await expect(popup.locator('#setup')).toBeVisible();
    await visit(popup, "the popup's requests, no address yet");

    const gate = await windowFor(context, worker, request());
    await gate.locator('#rows .term:visible').first().click();
    await visit(gate, 'the window, a term opened');
    const rows: ExplainedRow[] = [transferRow(), { ...transferRow(), verdict: 'blocked' }, { ...transferRow(), verdict: 'ok' }];
    await visit(await windowFor(context, worker, request({ rows })), 'the window for three transactions');
    await visit(await windowFor(context, worker, null), 'the window for a request gone');

    await visit(await windowFor(context, worker, { origin: 'https://jup.ag', address: WATCHED }, 'connect.html'), 'the consent window');
    await visit(
        await windowFor(
            context,
            worker,
            { origin: 'https://jup.ag', address: 'EXkwQoWHvDj7gdLdba4zWo3ktJNocyjT9DDQAryU7Tqa', mine: [WATCHED] },
            'address.html',
        ),
        'the address window',
    );
    await visit(
        await windowFor(
            context,
            worker,
            {
                origin: 'https://jup.ag',
                wallets: [{ name: 'Phantom', icon: 'data:image/svg+xml;base64,PHN2Zy8+' }, { name: 'Backpack' }, { name: 'MetaMask' }],
            },
            'wallet.html',
        ),
        'the wallet window',
    );
}
