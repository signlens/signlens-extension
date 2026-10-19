// What the window and the popup tell the user beyond the explanation
// itself: every transaction of a request, the verdict where the window
// is listed, the wallet a request goes to, the sites asked about, and
// what to do on a page SignLens does not run on.

import type { ExplainedRow } from '../src/model.ts';
import { expect, liveGate, test } from './extension.ts';
import { fixture } from './server.ts';
import { request, transferRow, windowFor } from './windows.ts';

const WALLET = 'SignLens';

test('each transaction of a request has its heading and summary, and the band names the most serious', async ({ context, worker }) => {
    const rows: ExplainedRow[] = [
        { ...transferRow(), verdict: 'ok', summary: 'First, harmless' },
        { ...transferRow(), verdict: 'blocked', summary: 'Second, drains the wallet' },
        { ...transferRow(), verdict: 'warning', summary: 'Third, a warning' },
    ];
    const gate = await windowFor(context, worker, request({ rows }));
    await expect(gate.locator('#title')).toHaveText('Sign 3 transactions');
    await expect(gate.locator('#band')).toHaveText('blocked Second, drains the wallet (transaction 2 of 3; each is below)');
    await expect(gate.getByRole('heading', { level: 2 })).toHaveText([
        'Transaction 1 of 3 ok',
        'Transaction 2 of 3 blocked',
        'Transaction 3 of 3 warning',
    ]);
    const summaries = gate.locator('#rows .summary-line');
    await expect(summaries).toHaveText(['First, harmless', 'Second, drains the wallet', 'Third, a warning']);
    for (const summary of await summaries.all()) await expect(summary).toBeVisible();
    // Each transaction's effects sit under its own heading.
    await expect(gate.getByRole('heading', { level: 3, name: 'What this does' })).toHaveCount(3);
});

test('the window is listed by its verdict, what it asks and for which site', async ({ context, worker }) => {
    const one = await windowFor(context, worker, request());
    await expect(one).toHaveTitle('Warning: Sign a transaction for jup.ag · SignLens');
    // A single transaction's summary is in the band, not again under it.
    await expect(one.locator('#rows .summary-line')).toBeHidden();
    await one.close();
    const message = await windowFor(
        context,
        worker,
        request({ method: 'solana:signMessage', rows: [{ kind: 'message', text: 'Sign in' }] }),
    );
    await expect(message).toHaveTitle('Sign a message for jup.ag · SignLens');
    await message.close();
    const stale = await windowFor(context, worker, null);
    await expect(stale).toHaveTitle('No longer pending · SignLens');
    await stale.close();
    const consent = await windowFor(
        context,
        worker,
        { origin: 'https://jup.ag', address: 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg' },
        'connect.html',
    );
    await expect(consent).toHaveTitle('jup.ag asks to see the watched address · SignLens');
});

test("with no wallet named in the settings, the window says which the page hands the request to, as the page's word, never on the button", async ({
    configure,
    context,
    dapp,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure({ lookupTokens: false, simulate: false, mode: 'passthrough', upstream: '' });
    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('#note')).toHaveText(
        'Continue hands the request unchanged to the first wallet the page has, which it calls “Fake Wallet”, and which asks for its own approval.',
    );
    // A page names its wallet as it likes: the button says only what SignLens knows.
    await gate.getByRole('button', { name: 'Continue to your wallet', exact: true }).click();
    expect((await signing).signed).toBe(1);
});

test('a wallet named in the settings is named by the settings, whatever the page calls it', async ({ context, worker }) => {
    const gate = await windowFor(context, worker, request({ upstream: 'Phantom', wallet: 'Phantom — verified safe by SignLens' }));
    await expect(gate.getByRole('button', { name: 'Continue to Phantom', exact: true })).toBeVisible();
    await expect(gate.locator('body')).not.toContainText('verified safe');
});

test('the sites allowed for the address in the settings come first; those for another address say so', async ({ popup, worker }) => {
    const [current, other] = ['Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg', 'DV3BDugD4uSbnFBwEzy6Lg4RksvPEtVCazWNwjzcL7Qp'];
    await worker.evaluate(
        ([current, other]) =>
            chrome.storage.local.set({
                mode: 'watch',
                address: current,
                watchSites: [
                    { origin: 'https://raydium.io', address: other, at: 1 },
                    { origin: 'https://jup.ag', address: current, at: 2 },
                ],
            }),
        [current, other] as const,
    );
    await popup.reload();
    await popup.getByRole('tab', { name: 'Settings' }).click();
    const sites = popup.getByRole('list', { name: 'Sites that may see it' }).getByRole('listitem');
    await expect(sites).toHaveText([/^jup\.ag Ffz5…piwg Revoke$/, /^raydium\.io DV3B…L7Qp another address Revoke$/]);
    // Another address in the settings: the list follows it.
    await worker.evaluate((other) => chrome.storage.local.set({ address: other }), other);
    await expect(sites).toHaveText([/^raydium\.io DV3B…L7Qp Revoke$/, /^jup\.ag Ffz5…piwg another address Revoke$/]);
});

test('over a page SignLens does not run on, the popup says so rather than to reload it', async ({ popup }) => {
    // The popup opened as a page is its own tab: an extension page, where no dapp can be.
    await popup.getByRole('tab', { name: 'Settings' }).click();
    await expect(popup.locator('#upstream-hint')).toHaveText(
        'SignLens does not run on this page. Open a dapp (an https page), then open this popup again.',
    );
});

test('a step whose instruction is not in the explanation is shown all the same, not left out', async ({ context, worker }) => {
    const field = { label: 'Amount', value: { type: 'Text', value: '1 SOL' }, trust: 'Fact', help: null } as const;
    const row: ExplainedRow = {
        ...transferRow(),
        sections: [
            { kind: { type: 'Instruction', value: { index: 0 } }, title: 'Transfer', subtitle: null, fields: [field], collapsed: false },
            {
                kind: { type: 'Nested', value: { parent: 0, index: 1 } },
                title: 'Inner transfer',
                subtitle: null,
                fields: [field],
                collapsed: false,
            },
            {
                kind: { type: 'Nested', value: { parent: 7, index: 2 } },
                title: 'Stray step',
                subtitle: null,
                fields: [field],
                collapsed: false,
            },
        ],
    };
    const gate = await windowFor(context, worker, request({ rows: [row] }));
    await gate.getByRole('button', { name: /and details$/ }).click();
    await expect(gate.locator('.section-title')).toHaveText(['Transfer', 'Step 2: Inner transfer', 'Step 3: Stray step']);
    await expect(gate.locator('.section-title', { hasText: 'Stray step' })).toBeVisible();
});

test('an answer slimmed to fit the history offers no file to save, as there are no bytes left to save', async ({ popup, worker }) => {
    const slimmed = request({
        rows: [{ ...transferRow(), text: 'The full text was too long to keep in the history.', sections: [], capture: '' }],
    });
    await worker.evaluate((history) => chrome.storage.session.set({ history }), [slimmed, request({ time: 1 })]);
    await popup.reload();
    await popup.getByRole('tab', { name: /^Requests/ }).click();
    const rows = popup.locator('#history > li');
    await rows.nth(0).locator('summary').click();
    await rows.nth(1).locator('summary').click();
    await expect(rows.nth(0).getByRole('link', { name: 'Save the transaction' })).toHaveCount(0);
    await expect(rows.nth(1).getByRole('link', { name: 'Save the transaction' })).toHaveCount(1);
});
