// The popup's settings: saved as typed, shown again, and only valid
// addresses reach the wallet.

import { expect, test } from './extension.ts';

const ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

test('settings survive closing the popup', async ({ popup, worker }) => {
    await popup.getByText('Refuse it', { exact: false }).click();
    await popup.getByLabel('Address to connect as').fill(ADDRESS);
    await popup.getByLabel('RPC for lookup tables').fill('http://127.0.0.1:1/rpc');
    await popup.getByLabel('SignLens API').fill('http://127.0.0.1:2');

    await popup.reload();
    await expect(popup.getByLabel('Address to connect as')).toHaveValue(ADDRESS);
    await expect(popup.getByLabel('SignLens API')).toHaveValue('http://127.0.0.1:2');
    await expect(popup.locator('#engine-status')).toHaveText(/SignLens API not reachable: the API at http:\/\/127\.0\.0\.1:2/);

    const stored = await worker.evaluate(() => chrome.storage.local.get(null));
    expect(stored).toMatchObject({ mode: 'watch', address: ADDRESS, apiUrl: 'http://127.0.0.1:2', rpcUrl: 'http://127.0.0.1:1/rpc' });
});

test('the API that answers is reported with its engine and packs', async ({ configure, popup, server }) => {
    await configure({ apiUrl: server.api });
    await popup.reload();
    await expect(popup.locator('#engine-status')).toHaveText(/SignLens API ready: engine [\d.]+, \d+ programs, [\d,]+ verified tokens/);
    await expect(popup.locator('#engine-status')).toHaveClass(/\bup\b/);
});

test('a half-typed address is flagged and not saved', async ({ popup, worker }) => {
    await popup.getByText('Refuse it', { exact: false }).click();
    await popup.getByLabel('Address to connect as').fill('0OIl');
    await expect(popup.locator('#address-hint')).toHaveText(/Not a Solana address/);
    const stored = await worker.evaluate(() => chrome.storage.local.get('address'));
    expect(stored.address ?? '').toBe('');
});

test('connecting in watch mode needs an address', async ({ configure, dapp }) => {
    await configure({ mode: 'watch' });
    const answer = await dapp.evaluate((wallet: string) => window.sign(wallet, 'AQ==').catch((e) => ({ error: e.message })), 'SignLens');
    expect(answer.error).toContain("enter the address to watch in the extension's popup");
});

test('the pass-through wallet is picked from the wallets the page has', async ({ configure, dapp, popup, worker }) => {
    await configure({ mode: 'passthrough' });
    // The dapp registered its wallet as it loaded; the popup, opened as a
    // page here, lists the wallets of the active tab, so the dapp goes in
    // front before the popup loads.
    await dapp.bringToFront();
    await popup.reload();
    const select = popup.getByLabel('Wallet to pass requests to');
    await expect(select.locator('option')).toHaveText(['First one found', 'Fake Wallet']);
    await expect(popup.locator('#upstream-hint')).toHaveText(/Found on localhost:\d+: Fake Wallet\./);
    await select.selectOption('Fake Wallet');
    await expect.poll(() => worker.evaluate(() => chrome.storage.local.get('upstream'))).toEqual({ upstream: 'Fake Wallet' });

    // A saved choice the page does not have stays listed, marked.
    await configure({ upstream: 'Solflare' });
    await popup.reload();
    await expect(select).toHaveValue('Solflare');
    await expect(select.locator('option', { hasText: 'Solflare' })).toHaveText('Solflare (not on this page)');

    // Over a tab with no content script (here: the popup's own) the hint
    // says to reload it, and the choice stays.
    await popup.bringToFront();
    await popup.reload();
    await expect(popup.locator('#upstream-hint')).toHaveText(/SignLens is not running in this tab yet/);
    await expect(select).toHaveValue('Solflare');
});

test('a named wallet the page does not have refuses the connect and says so in the popup', async ({
    configure,
    context,
    dapp,
    extensionId,
}) => {
    await configure({ mode: 'passthrough', upstream: 'Solflare' });
    const answer = await dapp.evaluate((wallet: string) => window.sign(wallet, 'AQ==').catch((e) => ({ error: e.message })), 'SignLens');
    expect(answer.error).toBe('SignLens: no wallet named "Solflare" to pass requests to (found: Fake Wallet)');

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('#view-requests')).toBeVisible();
    await expect(popup.locator('#history > li')).toHaveCount(1);
    await expect(popup.locator('#history > li').first()).toContainText(
        'SignLens could not connect: no wallet named "Solflare" to pass requests to (found: Fake Wallet). Choose a wallet in the extension\'s settings.',
    );
    await expect(popup.locator('#history > li').first().locator('.where')).toHaveText(/^localhost:\d+ · connect$/);

    // The same failure again and again is one row, not a flood.
    for (let i = 0; i < 5; i += 1) await dapp.evaluate((wallet: string) => window.sign(wallet, 'AQ==').catch(() => null), 'SignLens');
    await popup.reload();
    await expect(popup.locator('#history > li')).toHaveCount(1);
    await expect(popup.locator('#unseen')).toBeHidden();
});
