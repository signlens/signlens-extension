// Storage against a fake `chrome`: a request waiting in a window comes
// before the history when the browser runs out of room, and what a worker
// that stopped left waiting goes when the next one starts.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { type FakeChrome, installFakeChrome } from '../../test/chrome.fake.ts';
import type { HistoryEntry } from './model.ts';
import { dropStalePending, getPending, pendingKey, putPending, session } from './store.ts';

let fake: FakeChrome;
beforeEach(() => {
    fake = installFakeChrome();
});

/** An answer of one message `size` characters long. */
function answer(time: number, size = 100_000): HistoryEntry {
    return { time, mode: 'passthrough', upstream: '', rows: [{ kind: 'message', text: 'x'.repeat(size) }] };
}

test('a request refused for room has the oldest answers make way for it, as few as it takes', async () => {
    await session.set({ history: [answer(4), answer(3), answer(2), answer(1)] });
    fake.sessionQuota = 350_000;
    await putPending('confirm.html', 'a', answer(5));
    assert.equal((await getPending('confirm.html', 'a'))?.time, 5);
    assert.deepEqual(
        (fake.session.history as HistoryEntry[]).map((e) => e.time),
        [4, 3],
    );
});

test('with no answer left to make way, the request fails as the browser failed it', async () => {
    fake.sessionQuota = 50_000;
    await assert.rejects(putPending('confirm.html', 'a', answer(1)), /quota bytes exceeded/);
    assert.equal(fake.session[pendingKey('confirm.html', 'a')], undefined);
});

test('the requests a stopped worker left waiting are dropped when the next one starts, and nothing else', async () => {
    await session.set({ 'pending:1': answer(1, 10), 'pending:2': answer(2, 10), history: [answer(3, 10)], view: 'settings' });
    await dropStalePending();
    assert.deepEqual(Object.keys(fake.session).sort(), ['history', 'view']);
});

test('a request is read back only by the window it was kept for, never as another kind', async () => {
    await putPending('confirm.html', 'a', answer(1, 10));
    assert.equal((await getPending('confirm.html', 'a'))?.time, 1);
    assert.equal(await getPending('connect.html', 'a'), undefined);
    assert.equal(await getPending('address.html', 'a'), undefined);
});
