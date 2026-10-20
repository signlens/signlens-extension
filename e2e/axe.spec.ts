// axe-core over every page in the states a user meets them in, light and
// dark: the popup's requests (a row open) and settings (watch mode, a site
// allowed, an address refused), the window (one transaction with its help,
// instructions and comment box open; three transactions; a request gone)
// and the consent window. WCAG 2.0 to 2.2, A and AA, and axe's best
// practices; none may fail. What axe cannot judge (focus, Escape, names
// read in order, reflow) is in a11y.spec.ts.

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { AxeResults } from 'axe-core';
import type { ExplainedRow } from '../src/shared/model.ts';
import { expect, test } from './support/extension.ts';
import { request, transferRow, windowFor } from './support/windows.ts';

const AXE = readFileSync(new URL(import.meta.resolve('axe-core/axe.min.js')), 'utf8');
const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const WATCHED = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';

/** What axe finds on `page` in each theme, as one line per rule broken, with where. */
async function violations(page: Page): Promise<string[]> {
    // Evaluated, not added as a script tag: the extension's pages allow no inline script.
    await page.evaluate(AXE);
    const found: string[] = [];
    for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        const results = await page.evaluate(
            (runOnly) =>
                (window as unknown as { axe: { run(context: Document, options: object): Promise<AxeResults> } }).axe.run(document, {
                    runOnly,
                }),
            RULES,
        );
        for (const v of results.violations) found.push(`${colorScheme} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    }
    return found;
}

test('the popup, its requests and its settings', async ({ popup, worker }) => {
    await worker.evaluate(
        (history) => chrome.storage.session.set({ history, unseen: 2 }),
        [request({ decision: 'reject', refused: 'the page closed or reloaded' }), request({ time: 1 })],
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
    await popup
        .getByRole('button', { name: /and details$/ })
        .first()
        .click();
    expect(await violations(popup)).toEqual([]);
    await popup.getByRole('tab', { name: 'Settings' }).click();
    await expect(popup.locator('#apiUrl-hint')).toHaveText(/^Not used/);
    expect(await violations(popup)).toEqual([]);
});

test('the window, with what a reader opens in it', async ({ context, worker }) => {
    const gate = await windowFor(context, worker, request());
    await gate.getByRole('button', { name: 'Unclear' }).click();
    await gate.locator('#rows .term').first().click();
    await gate.getByRole('button', { name: /and details$/ }).click();
    expect(await violations(gate)).toEqual([]);
});

test('the window for several transactions, and for a request gone', async ({ context, worker }) => {
    const rows: ExplainedRow[] = [transferRow(), { ...transferRow(), verdict: 'blocked' }, { ...transferRow(), verdict: 'ok' }];
    const several = await windowFor(context, worker, request({ rows }));
    expect(await violations(several)).toEqual([]);
    const stale = await windowFor(context, worker, null);
    expect(await violations(stale)).toEqual([]);
});

test('the consent window and the address window', async ({ context, worker }) => {
    const consent = await windowFor(context, worker, { origin: 'https://jup.ag', address: WATCHED }, 'connect.html');
    expect(await violations(consent)).toEqual([]);
    const address = await windowFor(
        context,
        worker,
        { origin: 'https://jup.ag', address: 'EXkwQoWHvDj7gdLdba4zWo3ktJNocyjT9DDQAryU7Tqa', mine: [WATCHED] },
        'address.html',
    );
    expect(await violations(address)).toEqual([]);
});
