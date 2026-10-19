// The simulation as a cross-check: the worker simulates over the RPC and
// the engine holds the balance changes against the decoded effects.

import type { Settings } from '../src/settings.ts';
import { expect, liveGate, test } from './extension.ts';
import { type Fixture, feePayer, fixture, type RpcCall, type TestServer } from './server.ts';

const WALLET = 'SignLens';
/** The nonce transfer: 0.996423 USDC from the payer's account. */
const SOURCE = 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const UNITS = 996_423;
const FEE = 12_218;

function settings(transfer: Fixture, server: TestServer, extra: Partial<Settings> = {}): Partial<Settings> {
    return {
        gate: false,
        lookupTokens: false,
        simulate: true,
        mode: 'watch',
        address: feePayer(transfer.bytes),
        rpcUrl: server.rpc,
        ...extra,
    };
}

/** The addresses a `simulateTransaction` call watched, or the list a `getMultipleAccounts` call asked for. */
function addressesOf(call: RpcCall | undefined): string[] {
    const params = call?.params as [string[], { accounts?: { addresses?: string[] } }?] | undefined;
    return call?.method === 'simulateTransaction' ? (params?.[1]?.accounts?.addresses ?? []) : (params?.[0] ?? []);
}

test('a simulation within the effects is shown as a claim and agrees quietly', async ({ configure, dapp, popup, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    const payer = feePayer(transfer.bytes);
    server.tokenAccount(SOURCE, payer, USDC, 5_000_000, 5_000_000 - UNITS);
    server.wallet(payer, 1_000_000_000, 1_000_000_000 - FEE);
    await configure(settings(transfer, server));

    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    expect(answer.error).toContain('holds no keys');
    expect(server.calls.map((c) => c.method)).toEqual(['getMultipleAccounts', 'simulateTransaction']);
    expect(addressesOf(server.calls[1])).toContain(payer);

    await popup.reload();
    const row = popup.locator('#history li').first();
    await expect(row.locator('.verdict')).toHaveText('warning');
    await row.locator('summary').click();
    await expect(row.locator('.tables')).toContainText('Simulation: 2 balance change(s), unverified');
    await expect(row.locator('.findings')).toContainText('simulation agrees');
    await expect(row.locator('pre')).toContainText("== Simulated outcome | the host's simulation (claimed, unverified)");
    await expect(row.locator('pre')).toContainText('Result: would succeed');
    await expect(row.locator('pre')).toContainText('Your USDC: −0.996423 USDC (verified)\n');
    await expect(row.locator('pre')).toContainText('Compute units: 4200\n');
    // The outcome sits under the simulation line, outside the instructions
    // and the details, open. Its head carries the one marker, its rows
    // none, and its labels explain themselves.
    const outcome = row.locator('.disclosure.section', { hasText: 'Simulated outcome' });
    await expect(outcome.locator('dl.fields')).toBeVisible();
    await expect(row.locator('.disclosure.instructions > .disclosure-body')).toBeHidden();
    expect(
        await row
            .locator('.tables')
            .last()
            .evaluate((p, o) => p.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING, await outcome.elementHandle()),
    ).toBeTruthy();
    await expect(row.locator('.disclosure.more .toggle').first()).not.toContainText('simulated outcome');
    const head = outcome.locator(':scope > .disclosure-head');
    await expect(head.locator('.term')).toHaveText('(claimed, unverified)');
    // The marker in the head is its own control, beside the toggle and not in it: it opens its help there, not the section.
    await expect(head.locator('.toggle .term')).toHaveCount(0);
    await head.locator('.term').click();
    await expect(head.locator('.help-note')).toHaveText(/Everything in this section came from the RPC/);
    await expect(outcome.locator('dl.fields')).toBeVisible();
    await head.locator('.term').press('Enter');
    await expect(head.locator('.help-note')).toHaveCount(0);
    await expect(outcome.locator('dl.fields')).toBeVisible();
    await expect(outcome.locator('.claimed')).toHaveCount(0);
    await outcome.locator('dt .term', { hasText: 'Compute units' }).click();
    await expect(outcome.locator('.help-note')).toHaveText(/paid per unit/);
});

test('an RPC that refuses the simulation is named with its answer', async ({ configure, dapp, popup, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    server.refuse('simulateTransaction', 403, '<html><body>Forbidden: method not allowed on this plan</body></html>');
    await configure(settings(transfer, server));

    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    expect(answer.error).toContain('holds no keys');

    await popup.reload();
    const row = popup.locator('#history li').first();
    await expect(row.locator('.verdict')).toHaveText('warning');
    await row.locator('summary').click();
    await expect(row.locator('.tables')).toContainText(
        'Simulation: not run (127.0.0.1 answered HTTP 403: <html><body>Forbidden: method not allowed on this plan</body></html>)',
    );
});

test('the simulation reads balances ten at a time and watches at most 18 accounts, the signer first', async ({
    configure,
    dapp,
    server,
}) => {
    // An OKX swap with 35 writable accounts from its lookup tables.
    const swap = fixture('swap_tob_enhanced__source_sa_absent.b64');
    const payer = feePayer(swap.bytes);
    server.know(swap);
    const theirs = swap.writable[0] ?? '';
    const mine = swap.writable[1] ?? '';
    server.tokenAccount(theirs, 'DV3BrLwGVnpBh8T6Ry8cKvwQSmeLdZxGKBaGbyKQJwNq', 'So11111111111111111111111111111111111111112', 1, 1);
    server.tokenAccount(mine, payer, 'So11111111111111111111111111111111111111112', 1, 1);
    await configure(settings(swap, server));

    await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: swap.base64,
    });
    // The balances are read ten accounts at a time, as public RPCs allow.
    const reads = server.calls.filter((c) => c.method === 'getMultipleAccounts');
    expect(reads.length).toBeGreaterThan(1);
    for (const read of reads) expect(addressesOf(read).length).toBeLessThanOrEqual(10);
    expect(reads.flatMap(addressesOf).length).toBeGreaterThan(18);
    const watched = addressesOf(server.calls.find((c) => c.method === 'simulateTransaction'));
    expect(watched).toHaveLength(18);
    expect(watched[0]).toBe(payer);
    expect(watched[1]).toBe(mine);
});

test('a drain the instructions do not state is a high finding in the gate', async ({ configure, context, dapp, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    const payer = feePayer(transfer.bytes);
    server.tokenAccount(SOURCE, payer, USDC, 5_000_000, 5_000_000 - UNITS);
    // Five SOL leave the wallet that no instruction accounts for.
    server.wallet(payer, 10_000_000_000, 5_000_000_000 - FEE);
    // Watch mode: the payer is the signer, so its wallet is "yours".
    await configure(settings(transfer, server, { gate: true }));

    const signing = dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const gate = await liveGate(context);
    await expect(gate.locator('.findings')).toContainText('The simulation shows 5.000012218 SOL leaving your accounts, more than the');
    await expect(gate.locator('.severity').first()).toHaveText('High');
    await gate.getByRole('button', { name: 'Close' }).click();
    expect((await signing).error).toContain('holds no keys');
});

test('a failed simulation is a warning that quotes the program', async ({ configure, dapp, popup, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    server.failSimulation({ InstructionError: [1, { Custom: 6001 }] }, [
        'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]',
        'Program log: Instruction: TransferChecked',
        'Program log: Error: insufficient funds',
        'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA failed: custom program error: 0x1771',
    ]);
    await configure(settings(transfer, server));

    await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    await popup.reload();
    const row = popup.locator('#history li').first();
    await row.locator('summary').click();
    await expect(row.locator('.tables')).toContainText('Simulation: failed');
    await expect(row.locator('pre')).toContainText('Result: would fail: {"InstructionError":[1,{"Custom":6001}]}');
    await expect(row.locator('.findings')).toContainText('simulation of this transaction failed');
    await expect(row.locator('.findings')).toContainText('6001');
    await expect(row.locator('.findings')).toContainText('the program said: Error: insufficient funds');
});

test('the blockhash is kept as signed and replaced only once the chain forgot it', async ({ configure, dapp, popup, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    const payer = feePayer(transfer.bytes);
    server.tokenAccount(SOURCE, payer, USDC, 5_000_000, 5_000_000 - UNITS);
    server.wallet(payer, 1_000_000_000, 1_000_000_000 - FEE);
    server.expireBlockhash();
    await configure(settings(transfer, server));

    await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    const simulations = server.calls.filter((c) => c.method === 'simulateTransaction');
    expect(simulations.map((c) => (c.params?.[1] as { replaceRecentBlockhash?: boolean } | undefined)?.replaceRecentBlockhash)).toEqual([
        false,
        true,
    ]);

    await popup.reload();
    const row = popup.locator('#history li').first();
    await row.locator('summary').click();
    await expect(row.locator('.findings')).toContainText('simulation agrees');
});

test('with the simulation off the transaction never leaves for the RPC', async ({ configure, dapp, server }) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure(settings(transfer, server, { simulate: false }));
    await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: transfer.base64,
    });
    expect(server.calls.map((c) => c.method)).toEqual([]);
});

test('a page naming another chain does not switch the simulation off, and the window says what it named', async ({
    configure,
    dapp,
    popup,
    server,
}) => {
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    await configure(settings(transfer, server));
    await dapp.evaluate(
        ({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64, 'solana:signTransaction', 'solana:devnet'),
        { wallet: WALLET, base64: transfer.base64 },
    );
    expect(server.calls.map((c) => c.method)).toEqual(['getMultipleAccounts', 'simulateTransaction']);

    await popup.reload();
    const row = popup.locator('#history li').first();
    await row.locator('summary').click();
    await expect(row.locator('.tables').first()).toHaveText(
        'Chain: the page says solana:devnet; read and simulated on the RPC in the settings all the same',
    );
});
