// The popup's settings: saved as typed, shown again, and only valid
// addresses reach the wallet.

import { expect, test } from './extension.ts';

const ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

test('settings survive closing the popup', async ({ popup, worker }) => {
    await popup.getByText('Refuse it', { exact: false }).click();
    await popup.getByLabel('Address to connect as').fill(ADDRESS);
    await popup.getByLabel('RPC for lookup tables').fill('http://127.0.0.1:1/rpc');
    await popup.getByLabel('SignLens API').fill('http://127.0.0.1:2');
    // An address is saved once its field is left, not at each key.
    await popup.getByLabel('SignLens API').press('Tab');
    await expect.poll(() => worker.evaluate(() => chrome.storage.local.get('apiUrl'))).toEqual({ apiUrl: 'http://127.0.0.1:2' });

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

test('an address in plain http to another machine is flagged and not saved, and the default is not stored', async ({ popup, worker }) => {
    await popup.getByLabel('SignLens API').fill('http://api.example.com');
    await popup.getByLabel('SignLens API').press('Tab');
    // One word for it, typed now or kept from before: the address is not used; and what is used instead.
    await expect(popup.locator('#apiUrl-hint')).toHaveText(
        'Not used: plain http is for this machine only (localhost, 127.0.0.1); use https. SignLens keeps using https://api.signlens.dev.',
    );
    // The field says it is wrong, and why, to whoever cannot see the red line under it.
    await expect(popup.getByLabel('SignLens API')).toHaveAttribute('aria-invalid', 'true');
    await expect(popup.getByLabel('SignLens API')).toHaveAccessibleDescription(/Not used: plain http is for this machine only/);
    await popup.getByLabel('RPC for lookup tables').fill('https://rpc.example.com');
    await popup.getByLabel('RPC for lookup tables').press('Tab');
    await expect(popup.getByLabel('RPC for lookup tables')).toHaveAttribute('aria-invalid', 'false');
    await expect.poll(() => worker.evaluate(() => chrome.storage.local.get('rpcUrl'))).toEqual({ rpcUrl: 'https://rpc.example.com' });
    expect(await worker.evaluate(() => chrome.storage.local.get('apiUrl'))).toEqual({});

    // Set back to the default, the address is removed, so a later default reaches it.
    await popup.getByLabel('RPC for lookup tables').fill('https://solana-rpc.publicnode.com');
    await popup.getByLabel('RPC for lookup tables').press('Tab');
    await expect.poll(() => worker.evaluate(() => chrome.storage.local.get('rpcUrl'))).toEqual({});
});

test('an address pasted is kept even when the popup closes at once, with no field left', async ({ popup, worker }) => {
    await popup.getByLabel('SignLens API').fill('https://api.example.com');
    await popup.close();
    await expect.poll(() => worker.evaluate(() => chrome.storage.local.get('apiUrl'))).toEqual({ apiUrl: 'https://api.example.com' });
});

test('an address kept from before that is no longer taken is flagged when the popup opens', async ({ configure, popup }) => {
    // Plain http to a LAN host was taken before; now only this machine may be plain http.
    await configure({ apiUrl: 'http://192.168.1.10:8787' });
    await popup.reload();
    // Nothing else stands in for it: SignLens asks no API at all until it is fixed.
    await expect(popup.locator('#apiUrl-hint')).toHaveText(
        'Not used: plain http is for this machine only (localhost, 127.0.0.1); use https. SignLens asks no API until it is fixed.',
    );
    await expect(popup.getByLabel('SignLens API')).toHaveAttribute('aria-invalid', 'true');
    await expect(popup.getByLabel('RPC for lookup tables')).toHaveAttribute('aria-invalid', 'false');
    // The status line says so once, and points at the setting.
    await expect(popup.locator('#engine-status')).toHaveText(
        'SignLens API not used: its address in the settings is not one SignLens may call.',
    );
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

    // Over a page SignLens does not run on (here: the popup's own) the hint
    // says so, and the choice stays.
    await popup.bringToFront();
    await popup.reload();
    await expect(popup.locator('#upstream-hint')).toHaveText(/^SignLens does not run on this page/);
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
        'SignLens could not connect: no wallet named "Solflare" to pass requests to (found: "Fake Wallet"). Choose a wallet in the extension\'s settings.',
    );
    await expect(popup.locator('#history > li').first().locator('.where')).toHaveText(/^localhost:\d+ · connect$/);

    // The same failure again and again is one row, not a flood.
    for (let i = 0; i < 5; i += 1) await dapp.evaluate((wallet: string) => window.sign(wallet, 'AQ==').catch(() => null), 'SignLens');
    await popup.reload();
    await expect(popup.locator('#history > li')).toHaveCount(1);
    await expect(popup.locator('#unseen')).toBeHidden();
});
