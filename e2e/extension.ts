// Test fixtures: Chromium with the unpacked extension loaded, its background
// worker, and a local server that plays the dapp and the RPC and relays
// the API to a running SignLens API.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, test as base, chromium, expect, type Page, type Worker } from '@playwright/test';
import type { Settings } from '../src/settings.ts';
import { startTestServer, type TestServer } from './server.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const EXTENSION = join(HERE, '../extension');

interface Fixtures {
    worker: Worker;
    extensionId: string;
    server: TestServer;
    configure: (settings: Partial<Settings>) => Promise<void>;
    popup: Page;
    dapp: Page;
}

export const test = base.extend<Fixtures>({
    // The extension needs a persistent context; a fresh temporary profile
    // for each test keeps its settings and history from leaking across.
    // biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture signature
    context: async ({}, use) => {
        const context = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            headless: true,
            args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
        });
        await use(context);
        await context.close();
    },

    /** The extension's background worker. */
    worker: async ({ context }, use) => {
        let [worker] = context.serviceWorkers();
        worker ??= await context.waitForEvent('serviceworker');
        await use(worker);
    },

    extensionId: async ({ worker }, use) => {
        await use(new URL(worker.url()).host);
    },

    /** The local server: the dapp page at `/dapp.html`, the RPC at `/rpc`, the API relay at `/api`. */
    // biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture signature
    server: async ({}, use) => {
        const server = await startTestServer();
        await use(server);
        await server.close();
    },

    /** Writes the extension's settings as the popup would, pointing the API at the local server's relay. */
    configure: async ({ worker, server }, use) => {
        await use(async (settings) => {
            await worker.evaluate((s) => chrome.storage.local.set(s), { apiUrl: server.api, ...settings });
        });
    },

    /** The popup, open as a page. */
    popup: async ({ context, extensionId }, use) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/popup.html`);
        // The popup fills its form from storage after loading; typing before
        // that would be overwritten.
        await expect(page.locator('#engine-status')).toHaveClass(/\b(up|down)\b/);
        await use(page);
    },

    /** The dapp page, with "SignLens" registered in it. */
    dapp: async ({ context, server }, use) => {
        const page = await context.newPage();
        await page.goto(`${server.url}/dapp.html`);
        await expect.poll(() => page.evaluate(() => window.walletNames())).toContain('SignLens');
        await use(page);
    },
});

/**
 * The gate's window, once it is open and settled. Chrome may create the
 * page and then move it into its popup window, which Playwright reports as
 * one page closing and another opening, so the first page seen is not
 * trusted: this waits until exactly one live confirm page has stayed for
 * a moment and its buttons are visible.
 */
export async function liveGate(context: BrowserContext): Promise<Page> {
    let gate: Page | undefined;
    await expect
        .poll(
            async () => {
                const pages = context.pages().filter((p) => !p.isClosed() && p.url().includes('confirm.html'));
                if (pages.length !== 1) return pages.length;
                await new Promise((resolve) => setTimeout(resolve, 250));
                const [only] = pages;
                if (!only || only.isClosed()) return -1;
                gate = only;
                return 1;
            },
            { timeout: 15_000 },
        )
        .toBe(1);
    if (!gate) throw new Error('no gate window');
    await expect(gate.locator('#buttons button:visible').first()).toBeVisible();
    return gate;
}

export { expect };
