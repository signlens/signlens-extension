// What the window and the popup tell the user beyond the explanation
// itself: every transaction of a request, the verdict where the window
// is listed, the wallet a request goes to, the sites asked about, and
// what to do on a page SignLens does not run on.

import type { ExplainedRow } from '../src/shared/model.ts';
import { fixture } from '../test/server.ts';
import { clickToClose, expect, liveGate, test } from './support/extension.ts';
import { request, transferRow, windowFor } from './support/windows.ts';

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
    await clickToClose(gate.getByRole('button', { name: 'Continue to your wallet', exact: true }));
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
    const field = { label: 'Amount', value: { type: 'text', value: '1 SOL' }, trust: 'fact', help: null } as const;
    const row: ExplainedRow = {
        ...transferRow(),
        sections: [
            { kind: { type: 'instruction', value: { index: 0 } }, title: 'Transfer', subtitle: null, fields: [field], collapsed: false },
            {
                kind: { type: 'nested', value: { parent: 0, index: 1 } },
                title: 'Inner transfer',
                subtitle: null,
                fields: [field],
                collapsed: false,
            },
            {
                kind: { type: 'nested', value: { parent: 7, index: 2 } },
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
    // Nor a toggle with nothing behind it: the instructions went with the text.
    await expect(rows.nth(0).getByRole('button', { name: /^(Details|Instruction)/ })).toHaveCount(0);
    await expect(rows.nth(1).getByRole('button', { name: /^(Details|Instruction)/ })).toHaveCount(1);
    await expect(rows.nth(1).getByRole('link', { name: 'Save the transaction' })).toHaveCount(1);
});

test('a transaction SignLens could not explain says that nothing is known of it, why, what was read, and can be saved', async ({
    context,
    worker,
}) => {
    const failed = {
        kind: 'failed' as const,
        scope: 'transaction' as const,
        error: 'the SignLens API answered HTTP 503 with something that is not an explanation',
        tables: '1 loaded (2 accounts)',
        chain: 'solana:devnet',
        capture: '# Captured for the tests.\nAQ==\n',
    };
    const gate = await windowFor(context, worker, request({ rows: [failed] }));
    await expect(gate.locator('#band-summary')).toHaveText(
        'Not explained: the SignLens API answered HTTP 503 with something that is not an explanation',
    );
    const row = gate.locator('#rows .explanation');
    await expect(row.locator('p, pre')).toHaveText([
        'SignLens could not explain this transaction: nothing is known of what it does.',
        'the SignLens API answered HTTP 503 with something that is not an explanation',
        'Chain: the page says solana:devnet; read and simulated on the RPC in the settings all the same',
        'Lookup tables: 1 loaded (2 accounts)',
    ]);
    // The window asks again itself, rather than send the user back to the site; only the first failure holds the button.
    await expect(row.getByRole('button', { name: 'Try again' })).toBeVisible();
    const several = await windowFor(context, worker, request({ rows: [failed, failed] }));
    await expect(several.getByRole('button', { name: 'Try again' })).toHaveCount(1);
    // A request that was refused as a whole, as too long a list, say, would be refused again: no button.
    const whole = await windowFor(
        context,
        worker,
        request({ rows: [{ kind: 'failed', scope: 'request', error: '33 transactions in one request; SignLens explains at most 32' }] }),
    );
    await expect(whole.locator('#rows pre')).toHaveText('33 transactions in one request; SignLens explains at most 32');
    await expect(whole.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    const save = row.getByRole('link', { name: 'Save the transaction' });
    await expect(save).toHaveAttribute('download', /^20261019T120000-jup\.ag\.b64$/);
    await expect(save).toHaveAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(failed.capture)}`);
});

test('each request says what became of it, asked or not', async ({ popup, worker }) => {
    const history = [
        request({ time: 6, decision: 'continue', unasked: true }),
        request({ time: 5, decision: 'continue' }),
        request({ time: 4, decision: 'reject' }),
        request({ time: 3, decision: 'reject', refused: 'no decision in time' }),
        request({ time: 2, mode: 'watch', decision: 'reject' }),
        request({ time: 1, mode: 'watch', decision: 'reject', refused: 'the page closed or reloaded' }),
    ];
    await worker.evaluate((history) => chrome.storage.session.set({ history }), history);
    await popup.reload();
    await popup.getByRole('tab', { name: /^Requests/ }).click();
    await expect(popup.locator('#history > li .decision')).toHaveText([
        'passed on, not asked',
        'passed on',
        'rejected',
        'refused',
        'watch-only',
        'refused',
    ]);
});

test('a yes that no request waits for any more says what did not happen, and what to do', async ({ context, worker }) => {
    // Opened as the gate opens them, but no request waits behind them: the worker takes no decision for them.
    for (const [page, pending, yes, note] of [
        [
            'confirm.html',
            request(),
            'Continue to Fake Wallet',
            'Nothing was passed on: this request was no longer pending. Ask the site again if you still mean to sign.',
        ],
        [
            'connect.html',
            { origin: 'https://jup.ag', address: 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg' },
            'Allow',
            'The site was not allowed: this request was no longer pending. Connect again from the site if you still mean to.',
        ],
        [
            'address.html',
            { origin: 'https://jup.ag', address: 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg', mine: [] },
            "It's mine, add it",
            'The address was not added: this request was no longer pending. Ask the site again if you still mean to sign.',
        ],
    ] as const) {
        const window = await windowFor(context, worker, pending, page);
        await window.getByRole('button', { name: yes }).click();
        await expect(window.locator('#note'), page).toHaveText(note);
        await expect(window.getByRole('button', { name: 'Close' }), page).toBeFocused();
        await window.close();
    }
});

test('several transactions are each saved under a name of their own, and offered in the plural', async ({ context, worker }) => {
    const rows: ExplainedRow[] = [
        { ...transferRow(), verdict: 'warning' },
        { ...transferRow(), verdict: 'blocked' },
    ];
    const gate = await windowFor(context, worker, request({ rows }));
    const saves = gate.getByRole('link', { name: /^Save transaction \d$/ });
    await expect(saves).toHaveText(['Save transaction 1', 'Save transaction 2']);
    await expect(saves.nth(0)).toHaveAttribute('download', '20261019T120000-jup.ag-1.b64');
    await expect(saves.nth(1)).toHaveAttribute('download', '20261019T120000-jup.ag-2.b64');
    await gate.getByRole('button', { name: 'Unclear' }).click();
    await expect(gate.getByRole('checkbox')).toHaveAccessibleName('Send these transactions to SignLens so they can be looked into');
});

test('a finding wraps under its own text, not under its severity', async ({ context, worker }) => {
    const long =
        'This signature never expires; anyone holding the signed transaction can submit it at any later time until the nonce is advanced';
    const gate = await windowFor(
        context,
        worker,
        request({ rows: [{ ...transferRow(), findings: [{ severity: 'high', code: 'x', message: long, instruction: null }] }] }),
    );
    await gate.setViewportSize({ width: 360, height: 680 });
    const lefts = await gate
        .locator('.findings li')
        .first()
        .evaluate((item) => {
            const range = document.createRange();
            range.selectNodeContents(item.lastChild as Node);
            return {
                label: (item.querySelector('.severity') as HTMLElement).getBoundingClientRect().right,
                lines: [...range.getClientRects()].map((r) => Math.round(r.left)),
            };
        });
    expect(lefts.lines.length).toBeGreaterThan(1);
    for (const left of lefts.lines) expect(left).toBeGreaterThan(lefts.label);
});

test('a message is shown with a word that SignLens did not check it', async ({ context, worker }) => {
    const message = await windowFor(
        context,
        worker,
        request({ method: 'solana:signMessage', rows: [{ kind: 'message', text: 'Sign in' }] }),
    );
    await expect(message.locator('#rows')).toContainText(
        'SignLens does not check messages: this one is shown as it is. Sign it only if you mean what it says.',
    );
});

test('a request from another day says which day, and a site that asked to see the address says where to take it back', async ({
    popup,
    worker,
}) => {
    const now = Date.now();
    const before = now - 2 * 24 * 60 * 60 * 1000;
    const consent = request({
        time: before,
        method: 'standard:connect',
        mode: 'watch',
        decision: 'continue',
        rows: [{ kind: 'consent', address: 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg' }],
    });
    await worker.evaluate((history) => chrome.storage.session.set({ history }), [request({ time: now }), consent]);
    await popup.reload();
    await popup.getByRole('tab', { name: /^Requests/ }).click();
    const times = popup.locator('#history > li time');
    await expect(times.nth(0)).not.toContainText(String(new Date(now).getFullYear()));
    await expect(times.nth(1)).toContainText(String(new Date(before).getFullYear()));
    await expect(times.nth(1)).toHaveAttribute('datetime', new Date(before).toISOString());
    const row = popup.locator('#history > li').nth(1);
    await row.locator('summary').click();
    await expect(row.locator('.explanation')).toHaveText(
        'The sites allowed to see the watched address are listed in the settings, where Revoke takes one back.',
    );
});

test('a Revoke or a Clear the worker could not do says so, and changes nothing', async ({ popup, worker }) => {
    const address = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';
    await worker.evaluate(
        ([address, history]) =>
            Promise.all([
                chrome.storage.local.set({ mode: 'watch', address, watchSites: [{ origin: 'https://jup.ag', address, at: 1 }] }),
                chrome.storage.session.set({ history }),
            ]),
        [address, [request()]] as const,
    );
    await popup.reload();
    // The worker answers that it could not.
    await popup.evaluate(() => {
        const real = chrome.runtime.sendMessage.bind(chrome.runtime);
        (chrome.runtime as { sendMessage: unknown }).sendMessage = (message: { type: string }) =>
            message.type === 'revoke' || message.type === 'clear' ? Promise.resolve(false) : real(message);
    });
    await popup.getByRole('tab', { name: 'Settings' }).click();
    await popup.getByRole('button', { name: /^Revoke jup\.ag/ }).click();
    await expect(popup.locator('#save-status')).toHaveText('jup.ag could not be revoked; try again.');
    await expect(popup.getByRole('button', { name: /^Revoke jup\.ag/ })).toBeVisible();
    await popup.getByRole('tab', { name: /^Requests/ }).click();
    await popup.getByRole('button', { name: 'Clear requests' }).click();
    await expect(popup.locator('#clear-status')).toHaveText('The requests could not be cleared; try again.');
    await expect(popup.locator('#history > li')).toHaveCount(1);
});

test('a yes whose answer never came back says it is not known what came of it, and where to look', async ({ context, worker }) => {
    const lost = "SignLens did not answer, so it is not known whether this went through: the popup's requests say what came of it.";
    for (const [page, pending, yes] of [
        ['confirm.html', request(), 'Continue to Fake Wallet'],
        ['connect.html', { origin: 'https://jup.ag', address: 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg' }, 'Allow'],
        [
            'address.html',
            { origin: 'https://jup.ag', address: 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg', mine: [] },
            "It's mine, add it",
        ],
    ] as const) {
        const window = await windowFor(context, worker, pending, page);
        // The decision is sent, and its answer is lost.
        await window.evaluate(() => {
            const real = chrome.runtime.sendMessage.bind(chrome.runtime);
            (chrome.runtime as { sendMessage: unknown }).sendMessage = (message: { type: string }) =>
                message.type === 'decision'
                    ? Promise.reject(new Error('The message port closed before a response was received.'))
                    : real(message);
        });
        await window.getByRole('button', { name: yes }).click();
        await expect(window.locator('#note'), page).toHaveText(lost);
        await expect(window.getByRole('button', { name: 'Close' }), page).toBeFocused();
        await window.close();
    }
});
