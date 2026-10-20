// The window and the consent window, opened as the gate opens them on a
// request written into storage, so a test can try any origin, wallet
// name or set of rows without a dapp, an RPC or the API.

import type { BrowserContext, Page, Worker } from '@playwright/test';
import type { ExplainedRow, HistoryEntry } from '../src/shared/model.ts';
import { type Pending, pendingKey } from '../src/shared/store.ts';
import type { Explanation } from '../src/shared/types.ts';
import { liveGate } from './extension.ts';
import { fixture, recorded } from './server.ts';

/** The recorded transfer as the worker keeps it: one row, with the terms and toggles the window shows. */
export function transferRow(): ExplainedRow {
    const document = recorded('legacy_durable_nonce_token_transfer') as Explanation;
    const transfer = fixture('legacy_durable_nonce_token_transfer');
    return {
        kind: 'explained',
        verdict: 'warning',
        text: document.text ?? '',
        summary: document.summary,
        findings: document.findings,
        effects: document.effects,
        sections: document.sections,
        digest: document.raw?.digest ?? null,
        transaction: transfer.base64,
        tables: null,
        simulation: null,
        hints: [],
        capture: `# Captured for the tests.\n${transfer.base64}\n`,
    };
}

/** A request as the history keeps it, with `changes`. */
export function request(changes: Partial<HistoryEntry> = {}): HistoryEntry {
    return {
        time: Date.parse('2026-10-19T12:00:00Z'),
        origin: 'https://jup.ag',
        method: 'solana:signTransaction',
        mode: 'passthrough',
        upstream: 'Fake Wallet',
        rows: [transferRow()],
        ...changes,
    };
}

/** Opens `page` (confirm.html or connect.html) as the gate does, on `pending`, or on nothing: a request no longer there. */
export async function windowFor(context: BrowserContext, worker: Worker, pending: object | null, page = 'confirm.html'): Promise<Page> {
    const id = `test-${Math.random().toString(36).slice(2)}`;
    const key = pendingKey(page as keyof Pending, id);
    if (pending) await worker.evaluate(([key, value]) => chrome.storage.session.set({ [key]: value }), [key, pending] as const);
    await worker.evaluate(
        (url) => chrome.windows.create({ url: chrome.runtime.getURL(url), type: 'popup', width: 520, height: 680 }),
        `${page}?id=${id}`,
    );
    return liveGate(context, `${page}?id=${id}`);
}
