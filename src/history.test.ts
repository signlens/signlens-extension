// The history and the badge, against a fake `chrome`: answers that arrive
// together are all kept and counted, the badge shows the worst of them, and
// the popup's "seen" clears it whatever came just before.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { type FakeChrome, installFakeChrome } from './chrome.fake.ts';
import { clearHistory, HISTORY_BYTES, HISTORY_LENGTH, latest, markSeen, remember, showBadge } from './history.ts';
import type { HistoryEntry } from './model.ts';
import { inTurn } from './store.ts';

let fake: FakeChrome;
beforeEach(() => {
    fake = installFakeChrome();
});

function entry(time: number): HistoryEntry {
    return { time, mode: 'passthrough', upstream: '', rows: [{ kind: 'message', text: `request ${time}` }] };
}

test('answers that arrive together are all kept and counted, and the badge shows the worst', async () => {
    await Promise.all([showBadge('blocked'), remember(entry(1)), showBadge('ok'), remember(entry(2)), showBadge('warning')]);
    assert.deepEqual(
        (fake.session.history as HistoryEntry[]).map((e) => e.time),
        [2, 1],
    );
    assert.equal(fake.session.unseen, 2);
    assert.equal(fake.badge, 'BLOCK');
    assert.equal((await latest())?.time, 2);
});

test('the history keeps the newest answers only', async () => {
    await Promise.all(Array.from({ length: HISTORY_LENGTH + 5 }, (_, i) => remember(entry(i))));
    const kept = fake.session.history as HistoryEntry[];
    assert.equal(kept.length, HISTORY_LENGTH);
    assert.equal(kept[0]?.time, HISTORY_LENGTH + 4);
    await clearHistory();
    assert.deepEqual(fake.session.history, []);
});

test('"seen" clears the badge even right after an answer, and the next answer starts afresh', async () => {
    await Promise.all([remember(entry(1)), showBadge('blocked'), markSeen()]);
    assert.equal(fake.badge, '');
    assert.equal(fake.session.unseen, 0);
    await showBadge('ok');
    assert.equal(fake.badge, 'OK');
});

/** An answer of one explained transaction whose full text is `size` characters. */
function large(time: number, size: number): HistoryEntry {
    return {
        time,
        mode: 'passthrough',
        upstream: '',
        rows: [
            {
                kind: 'explained',
                verdict: 'ok',
                summary: 'Send 1 SOL',
                findings: [],
                effects: [],
                sections: [],
                text: 'x'.repeat(size),
                tables: 'none',
                simulation: 'off',
                hints: [],
                capture: 'AQ==',
                digest: null,
                transaction: 'AQ==',
            },
        ],
    };
}

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

test('the history keeps within its share of session storage: the oldest go first, and one too large on its own is slimmed', async () => {
    for (let i = 0; i < 9; i += 1) await remember(large(i, 1_000_000));
    let kept = fake.session.history as HistoryEntry[];
    assert.ok(bytes(kept) <= HISTORY_BYTES);
    assert.equal(kept.length, 5);
    assert.deepEqual(
        kept.map((e) => e.time),
        [8, 7, 6, 5, 4],
    );
    await remember(large(100, HISTORY_BYTES + 1));
    kept = fake.session.history as HistoryEntry[];
    assert.equal(kept.length, 1);
    const row = kept[0]?.rows[0];
    assert.equal(row?.kind === 'explained' && row.text, 'The full text was too long to keep in the history.');
    assert.equal(row?.kind === 'explained' && row.summary, 'Send 1 SOL');
});

test("a write that fails is its caller's to handle, and the writes queued after it still run in turn", async () => {
    const failing = inTurn(async () => {
        throw new Error('quota exceeded');
    });
    const after = remember(entry(1));
    await assert.rejects(failing, /quota exceeded/);
    await after;
    assert.equal((fake.session.history as HistoryEntry[]).length, 1);
});
