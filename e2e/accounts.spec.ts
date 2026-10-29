// Accounts the explanation names: approving a multisig proposal created in
// an earlier transaction signs a reference to it, and the transaction it
// runs is stored on chain. The worker reads the proposal and that stored
// transaction over the RPC, asks again, and the window shows the steps as
// the RPC's claim.

import type { Settings } from '../src/shared/settings.ts';
import { type Fixture, feePayer, fixture, type TestServer } from '../test/server.ts';
import { expect, test } from './support/extension.ts';

const WALLET = 'SignLens';
/** The second signature of the Drift takeover on 2026-04-01: approves and executes proposal #7 of Drift's multisig. */
const DRIFT = 'legacy_squads_drift_approve_execute';
const PROPOSAL = 'J1w1U5BB9W4Tnf2NhrcnTmV5t6iZugXSkujYKadwxti8';
const STORED = '2QmMUBZYv2Ssm6ED73Gapt8cgn9u1HQbPaJtfYdDDAwc';

function settings(drift: Fixture, server: TestServer, extra: Partial<Settings> = {}): Partial<Settings> {
    return {
        askFirst: false,
        lookupTokens: false,
        simulate: false,
        mode: 'watch',
        address: feePayer(drift.bytes),
        rpcUrl: server.rpc,
        ...extra,
    };
}

test("an approval shows the transaction it approves, read from the RPC and said to be the RPC's", async ({
    configure,
    dapp,
    popup,
    server,
}) => {
    const drift = fixture(DRIFT);
    server.know(drift);
    // On by default.
    await configure(settings(drift, server));

    const answer = await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: drift.base64,
    });
    expect(answer.error).toContain('holds no keys');
    // Both at once: the execute names the stored transaction, so its address needs no proposal first.
    expect(server.calls.map((c) => c.params?.[0])).toEqual([[PROPOSAL, STORED]]);
    expect(server.apiCalls.map((c) => (c.body as { accounts?: unknown[] }).accounts?.length)).toEqual([undefined, 2]);

    await popup.reload();
    const row = popup.locator('#history li').first();
    await expect(row.locator('.verdict')).toHaveText('warning');
    await row.locator('summary').click();
    await expect(row.locator('ol.actions')).toContainText(
        'Approve proposal #7 (Hand the admin of Drift to H7PiGqqUaanBovwKgEtreJbKmQe6dbq6VTrw6guy7ZgL, per your RPC)',
    );
    await expect(row.locator('.findings')).toContainText('its steps are shown from the transaction account as your RPC returned it');
    // The stored steps are explained as a proposal's are, with their own findings.
    await expect(row.locator('.findings')).toContainText('Proposal step 1: Hands the admin of the whole Drift protocol');
    await expect(row.locator('.tables')).toHaveText([`Accounts read from the RPC, unverified: ${PROPOSAL}, ${STORED}`]);
    await expect(row.locator('pre')).toContainText('from its account as your RPC returned it at slot 461256036');
});

test('with account lookup off, nothing is read and the approval says its content is not shown', async ({
    configure,
    dapp,
    popup,
    server,
}) => {
    const drift = fixture(DRIFT);
    server.know(drift);
    await configure(settings(drift, server, { lookupAccounts: false }));

    await dapp.evaluate(({ wallet, base64 }: { wallet: string; base64: string }) => window.sign(wallet, base64), {
        wallet: WALLET,
        base64: drift.base64,
    });
    expect(server.calls).toEqual([]);
    expect(server.apiCalls).toHaveLength(1);

    await popup.reload();
    const row = popup.locator('#history li').first();
    await row.locator('summary').click();
    await expect(row.locator('ol.actions')).not.toContainText('per your RPC');
    await expect(row.locator('.tables')).toHaveCount(0);
    // The engine still says what it would have read.
    await expect(row.locator('pre')).toContainText(`Would read, to explain more:\n  - ${PROPOSAL}:`);
});
