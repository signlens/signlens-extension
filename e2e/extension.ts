// Test fixtures: Chromium with the unpacked extension loaded, its background
// worker, and a local server that plays the dapp and the RPC, and the API
// from its answers recorded under e2e/fixtures/api/ (or relays it to a
// running SignLens API, when SIGNLENS_API_URL names one).

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, test as base, chromium, expect, type Locator, type Page, type Worker } from '@playwright/test';
import type { Settings } from '../src/shared/settings.ts';
import { noteDrift, STRICT } from './drift.ts';
import { startTestServer, type TestServer } from './server.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const EXTENSION = join(HERE, '../dist/chrome');
/** The account of the test dapp's own wallet (e2e/dapp.html). */
export const FAKE_ACCOUNT = 'FakeWa11et1111111111111111111111111111111111';

interface Fixtures {
    worker: Worker;
    extensionId: string;
    server: TestServer;
    configure: (settings: Partial<Settings>, options?: { allowed?: boolean }) => Promise<void>;
    popup: Page;
    dapp: Page;
}

export const test = base.extend<Fixtures>({
    // The extension needs a persistent context; a fresh temporary profile
    // for each test keeps its settings and history from leaking across.
    // The browser resolves no host but this machine: a default left in the
    // settings (the public RPC, the production API) fails rather than
    // reach the network, and makes no answer depend on the day.
    // biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture signature
    context: async ({}, use) => {
        const context = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            headless: true,
            // Numbers and times as the tests read them (4,003 tokens), whatever the machine's locale.
            locale: 'en-US',
            args: [
                `--disable-extensions-except=${EXTENSION}`,
                `--load-extension=${EXTENSION}`,
                '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
            ],
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

    /** The local server: the dapp page at `/dapp.html`, the RPC at `/rpc`, the API (recorded, or relayed) at `/api`. */
    // biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture signature
    server: async ({}, use) => {
        const server = await startTestServer();
        await use(server);
        await server.close();
        // A call nothing was recorded for got an error the test may have taken in its stride.
        if (server.apiMissed.length > 0) {
            throw new Error(`no recorded API answer for ${server.apiMissed.join(', ')}; record with \`npm run test:e2e:record\``);
        }
        // Live, an answer that departs from its recording means the recordings no longer hold: said at the end of the run (drift.ts).
        if (server.apiDrifted.length > 0) {
            if (STRICT) {
                throw new Error(
                    `the SignLens API ${server.apiDrifted.join('; ')}. If the API is right, record anew with \`npm run test:e2e:record\``,
                );
            }
            noteDrift(server.apiDrifted);
        }
    },

    /**
     * Writes the extension's settings as the popup would, pointing the API at
     * the local server's relay. The test dapp's wallet account is one of
     * "your addresses" unless `myAddresses` says otherwise: the address
     * window has tests of its own. Setting watch mode with an address also
     * lets the test dapp see it, as if the user had allowed it once, unless
     * `allowed` is false: watch.spec tests the asking itself.
     */
    configure: async ({ worker, server }, use) => {
        await use(async (settings, { allowed = true } = {}) => {
            const address = settings.mode === 'watch' ? settings.address?.trim() : undefined;
            const sites = address ? { watchSites: allowed ? [{ origin: new URL(server.url).origin, address, at: 0 }] : [] } : {};
            await worker.evaluate((s) => chrome.storage.local.set(s), {
                apiUrl: server.api,
                myAddresses: FAKE_ACCOUNT,
                ...sites,
                ...settings,
            });
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
 * The gate's window (or `page`, as connect.html for the consent window),
 * once it is open and settled. Chrome may create the
 * page and then move it into its popup window, which Playwright reports as
 * one page closing and another opening, so the first page seen is not
 * trusted: this waits until exactly one live window of that page has
 * stayed for a moment and its buttons are visible.
 */
export async function liveGate(context: BrowserContext, page = 'confirm.html'): Promise<Page> {
    let gate: Page | undefined;
    await expect
        .poll(
            async () => {
                const pages = context.pages().filter((p) => !p.isClosed() && p.url().includes(page));
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

/**
 * Does `action` on `page`, which closes it, and waits until it has closed.
 * The window can close before Playwright is done with the click or the
 * key, which it reports as an error; that is what the action was for, so
 * it is not one. Any other error is.
 */
export async function closing(page: Page, action: () => Promise<unknown>): Promise<void> {
    const closed = page.waitForEvent('close');
    await action().catch((error: unknown) => {
        if (!page.isClosed()) throw error;
    });
    await closed;
}

/** Clicks `button`, a decision that closes its window: see `closing`. */
export function clickToClose(button: Locator): Promise<void> {
    return closing(button.page(), () => button.click());
}

export { expect };
