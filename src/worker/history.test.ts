// The history and the badge, against a fake `chrome`: answers that arrive
// together are all kept and counted, the badge shows the worst of them, and
// the popup's "seen" clears it whatever came just before.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { type FakeChrome, installFakeChrome } from '../../test/chrome.fake.ts';
import type { HistoryEntry } from '../shared/model.ts';
import { inTurn } from '../shared/store.ts';
import type { Message } from '../shared/types.ts';
import {
    clearHistory,
    ENTRY_BYTES,
    forgetEarlierAnswers,
    HISTORY_BYTES,
    HISTORY_LENGTH,
    markSeen,
    remember,
    showBadge,
} from './history.ts';

/** `text` as the engine's words, with no identifier. */
const words = (text: string): Message => ({ id: null, parts: [{ text }], text });

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
});

test('the history keeps the newest answers only', async () => {
    await Promise.all(Array.from({ length: HISTORY_LENGTH + 5 }, (_, i) => remember(entry(i))));
    const kept = fake.session.history as HistoryEntry[];
    assert.equal(kept.length, HISTORY_LENGTH);
    assert.equal(kept[0]?.time, HISTORY_LENGTH + 4);
    await clearHistory();
    assert.deepEqual(fake.session.history, []);
});

test('an update forgets the answers the version before kept, and their count on the badge', async () => {
    await Promise.all([remember(entry(1)), remember(entry(2)), showBadge('blocked')]);
    await forgetEarlierAnswers();
    assert.deepEqual(fake.session.history, []);
    assert.equal(fake.session.unseen, 0);
    assert.equal(fake.session.unseenWorst, null);
    assert.equal(fake.badge, '');
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
                summary: words('Send 1 SOL'),
                findings: [],
                effects: [],
                sections: [],
                text: 'x'.repeat(size),
                tables: null,
                simulation: null,
                hints: [],
                capture: 'AQ==',
                digest: null,
                reportedSummary: 'Send 1 SOL',
                transaction: 'AQ==',
            },
        ],
    };
}

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

const SLIMMED = 'The full text was too long to keep in the history.';
const textOf = (kept: HistoryEntry) => {
    const [row] = kept.rows;
    return row?.kind === 'explained' ? row.text : undefined;
};

test('the history keeps within its share of session storage: the oldest go first', async () => {
    for (let i = 0; i < 9; i += 1) await remember(large(i, 400_000));
    const kept = fake.session.history as HistoryEntry[];
    assert.ok(bytes(kept) <= HISTORY_BYTES);
    assert.deepEqual(
        kept.map((e) => e.time),
        [8, 7, 6, 5, 4],
    );
});

test('an answer over its share is slimmed, and pushes none of the others out', async () => {
    for (let i = 0; i < 3; i += 1) await remember(large(i, 100_000));
    await remember(large(3, ENTRY_BYTES));
    await remember(large(4, HISTORY_BYTES + 1));
    const kept = fake.session.history as HistoryEntry[];
    assert.deepEqual(
        kept.map((e) => e.time),
        [4, 3, 2, 1, 0],
    );
    assert.deepEqual(kept.map(textOf).slice(0, 2), [SLIMMED, SLIMMED]);
    // Without its text each fits its share, and keeps its bytes to save.
    const captures = kept.slice(0, 2).map((e) => (e.rows[0]?.kind === 'explained' ? e.rows[0].capture : undefined));
    assert.deepEqual(captures, ['AQ==', 'AQ==']);
    assert.equal(textOf(kept[2] as HistoryEntry)?.length, 100_000);
    assert.equal(kept[0]?.rows[0]?.kind === 'explained' && kept[0].rows[0].summary.text, 'Send 1 SOL');
});

test('a write the browser refuses for room drops the oldest answers until it fits, and the newest last of all', async () => {
    for (let i = 0; i < 6; i += 1) await remember(large(i, 100_000));
    fake.sessionQuota = 350_000;
    await remember(large(6, 100_000));
    let kept = fake.session.history as HistoryEntry[];
    assert.deepEqual(
        kept.map((e) => e.time),
        [6, 5, 4],
    );
    assert.equal(fake.session.unseen, 7);
    fake.sessionQuota = 50_000;
    await remember(large(7, 100_000));
    kept = fake.session.history as HistoryEntry[];
    assert.deepEqual(
        kept.map((e) => [e.time, textOf(e)]),
        [[7, SLIMMED]],
    );
});

test('a write too large for the browser even alone and slimmed fails, as the browser failed it', async () => {
    fake.sessionQuota = 10;
    await assert.rejects(remember(entry(1)), /quota bytes exceeded/);
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
