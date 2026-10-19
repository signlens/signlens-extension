// The history and the badge, against a fake `chrome`: answers that arrive
// together are all kept and counted, the badge shows the worst of them, and
// the popup's "seen" clears it whatever came just before.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { type FakeChrome, installFakeChrome } from './chrome.fake.ts';
import { clearHistory, HISTORY_LENGTH, latest, markSeen, remember, showBadge } from './history.ts';
import type { HistoryEntry } from './render.ts';

let fake: FakeChrome;
beforeEach(() => {
    fake = installFakeChrome();
});

function entry(time: number): HistoryEntry {
    return { time, mode: 'passthrough', upstream: '', results: [{ verdict: 'ok', error: null }] };
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
