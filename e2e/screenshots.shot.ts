// The README's screenshots, of the real window and popup on explanations
// the API gave for mainnet transactions: `npm run screenshots` writes them
// to docs/images/. Not part of the suite: playwright.screenshots.config.ts
// runs the *.shot.ts files alone, so a test run never writes an image.

import { fileURLToPath } from 'node:url';
import type { ExplainedRow, HistoryEntry } from '../src/shared/model.ts';
import type { Explanation } from '../src/shared/types.ts';
import { verdictOf } from '../src/shared/verdict.ts';
import { fixture, recorded } from '../test/server.ts';
import { test } from './support/extension.ts';
import { request, windowFor } from './support/windows.ts';

const IMAGES = fileURLToPath(new URL('../docs/images/', import.meta.url));
const SITE = 'https://dapp.example';

/** The row the worker keeps for `transaction`, explained as recorded in `explanation`. */
function row(transaction: string, explanation: string, simulation: string | null): ExplainedRow {
    const document = recorded(explanation) as Explanation;
    const bytes = fixture(transaction).base64;
    return {
        kind: 'explained',
        verdict: verdictOf(document),
        text: document.text ?? '',
        summary: document.summary,
        findings: document.findings,
        effects: document.effects,
        sections: document.sections,
        digest: document.raw?.digest ?? null,
        transaction: bytes,
        tables: null,
        simulation,
        hints: [],
        capture: `${bytes}\n`,
    };
}

const TRANSFER = () =>
    row('legacy_durable_nonce_token_transfer', 'legacy_durable_nonce_token_transfer.simulated_to_contact', '2 balance changes, unverified');
const SWAP = () => row('swap__sol_from_wallet', 'swap__sol_from_wallet.tables_read', '4 balance changes, unverified');
const UNRESOLVED = () => row('swap__both_mints_named', 'swap__both_mints_named', null);

test('the window, on a transfer that is valid until its nonce is used', async ({ context, worker }) => {
    const gate = await windowFor(context, worker, request({ origin: SITE, upstream: 'Phantom', rows: [TRANSFER()] }));
    // The size the gate opens it at (src/worker/gate.ts).
    await gate.setViewportSize({ width: 520, height: 680 });
    await gate.emulateMedia({ colorScheme: 'light' });
    await gate.screenshot({ path: `${IMAGES}window.png` });
});

test('the popup, with the requests of the last minutes', async ({ configure, popup, worker }) => {
    // The API the harness replays, so that the status line says what a working one says.
    await configure({});
    const at = Date.now();
    const history: HistoryEntry[] = [
        request({ time: at, origin: SITE, upstream: 'Phantom', rows: [TRANSFER()], decision: 'continue' }),
        request({ time: at - 60_000, origin: SITE, upstream: 'Phantom', rows: [SWAP()], decision: 'continue' }),
        request({ time: at - 180_000, origin: SITE, upstream: 'Phantom', rows: [UNRESOLVED()], decision: 'reject' }),
    ];
    await worker.evaluate((kept) => chrome.storage.session.set({ history: kept, unseen: 0 }), history);
    await popup.setViewportSize({ width: 480, height: 640 });
    await popup.emulateMedia({ colorScheme: 'light' });
    await popup.reload();
    await popup.getByRole('tab', { name: /^Requests/ }).click();
    await popup.locator('body').screenshot({ path: `${IMAGES}popup.png` });
});
