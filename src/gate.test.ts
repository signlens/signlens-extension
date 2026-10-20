// The gate, against a fake `chrome`: a request goes on only on "continue",
// and every other way a window can end (closed, its page gone, its page no
// longer waiting, never opened) is a refusal that leaves nothing behind,
// with the reason when it was not the user's.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { type FakeChrome, installFakeChrome, until } from './chrome.fake.ts';
import { abandon, askUser, begin, DECISION_TIMEOUT_MS, decide, end, type InFlight, mustAsk } from './gate.ts';
import type { HistoryEntry } from './model.ts';
import { pendingKey } from './store.ts';

/** A refusal that never comes fails the test rather than hang the run. */
const BOUNDED = { timeout: 10_000 };

let fake: FakeChrome;
beforeEach(() => {
    fake = installFakeChrome();
});

const ENTRY: HistoryEntry = { time: 1, mode: 'passthrough', upstream: 'Phantom', rows: [{ kind: 'message', text: 'Sign in' }] };

/** The window that is open, and the id its request goes by. */
async function openWindow(): Promise<{ windowId: number; id: string }> {
    await until(() => fake.windows.size === 1);
    const [[windowId, url]] = [...fake.windows] as [[number, string]];
    const id = new URL(url).searchParams.get('id') ?? '';
    return { windowId, id };
}

/** Nothing of a request is left: no window, nothing pending in storage. */
function nothingLeft(): void {
    assert.equal(fake.windows.size, 0);
    assert.deepEqual(
        Object.keys(fake.session).filter((key) => key.startsWith('pending:')),
        [],
    );
}

function flight(deadline = Date.now() + 5_000): InFlight {
    return { deadline, abandoned: false, signal: new AbortController().signal };
}

test('one request per tab is in flight at a time, with the deadline the page keeps', () => {
    const first = begin(1, 1_000);
    assert.ok(first);
    assert.equal(first.deadline, 1_000 + DECISION_TIMEOUT_MS);
    assert.equal(begin(1), null);
    const second = begin(2);
    assert.ok(second);
    end(1, first);
    const again = begin(1);
    assert.ok(again);
    end(1, again);
    end(2, second);
});

test('what is under way for a request stops when its page goes, or when the page stops waiting, saying which', BOUNDED, async () => {
    const closed = begin(21);
    assert.ok(closed);
    assert.equal(closed.signal.aborted, false);
    abandon(21);
    assert.equal(closed.signal.reason, 'the page closed or reloaded');
    end(21, closed);

    const late = begin(22, Date.now() - DECISION_TIMEOUT_MS + 20);
    assert.ok(late);
    await until(() => late.signal.aborted);
    assert.equal(late.signal.reason, 'the page stopped waiting');
    end(22, late);
});

test("a tab whose page went is free at once for its next request, which the old one's end leaves alone", () => {
    const old = begin(5);
    assert.ok(old);
    abandon(5);
    assert.equal(old.abandoned, true);
    const next = begin(5);
    assert.ok(next, 'the reloaded page asks while the old request is still being explained');
    // The old request finishes explaining, finds itself abandoned, and ends.
    end(5, old);
    assert.equal(begin(5), null, 'the new request is still in flight');
    end(5, next);
    const last = begin(5);
    assert.ok(last);
    end(5, last);
});

test('the decision in the window ends the wait, and the window and the pending request go', BOUNDED, async () => {
    const asking = askUser(ENTRY, flight());
    const { id } = await openWindow();
    assert.deepEqual(fake.session[pendingKey('confirm.html', id)], ENTRY);
    assert.equal(decide(id, 'continue'), true);
    assert.deepEqual(await asking, { decision: 'continue' });
    nothingLeft();
    // A decision for a request no longer waiting is taken by nothing, and says so.
    assert.equal(decide(id, 'continue'), false);
});

test("closing the window is the user's refusal", BOUNDED, async () => {
    const asking = askUser(ENTRY, flight());
    const { windowId } = await openWindow();
    fake.closeWindow(windowId);
    assert.deepEqual(await asking, { decision: 'reject' });
    nothingLeft();
});

test("closing one window is a refusal of that window's request only", BOUNDED, async () => {
    const first = askUser(ENTRY, flight());
    const { windowId, id } = await openWindow();
    const second = askUser(ENTRY, flight());
    await until(() => fake.windows.size === 2);
    fake.closeWindow(Math.max(...fake.windows.keys()));
    assert.deepEqual(await second, { decision: 'reject' });
    assert.ok(fake.windows.has(windowId));
    assert.equal(decide(id, 'continue'), true);
    assert.deepEqual(await first, { decision: 'continue' });
    nothingLeft();
});

test("the page's tab closing is a refusal, with the window open or before it opens", BOUNDED, async () => {
    const open = begin(7);
    assert.ok(open);
    const asking = askUser(ENTRY, open);
    await openWindow();
    abandon(7);
    assert.deepEqual(await asking, { decision: 'reject', refused: 'the page closed or reloaded' });
    nothingLeft();
    end(7, open);

    const gone = begin(8);
    assert.ok(gone);
    abandon(8);
    assert.deepEqual(await askUser(ENTRY, gone), { decision: 'reject', refused: 'the page closed or reloaded' });
    nothingLeft();
    end(8, gone);
});

test('a tab closed while its request is being stored gets no window', BOUNDED, async () => {
    const racing = begin(11);
    assert.ok(racing);
    // The ask runs up to its first write; the tab closes while it waits on it.
    const asking = askUser(ENTRY, racing);
    abandon(11);
    assert.deepEqual(await asking, { decision: 'reject', refused: 'the page closed or reloaded' });
    assert.equal(fake.opened, 0);
    nothingLeft();
    end(11, racing);
});

test('when the page stops waiting, so does the window; a page already gone gets none', BOUNDED, async () => {
    const asking = askUser(ENTRY, flight(Date.now() + 30));
    await openWindow();
    assert.deepEqual(await asking, { decision: 'reject', refused: 'no decision in time' });
    nothingLeft();
    assert.deepEqual(await askUser(ENTRY, flight(Date.now() - 1)), { decision: 'reject', refused: 'the page stopped waiting' });
    nothingLeft();
});

test('a window that cannot open is a refusal', BOUNDED, async () => {
    fake.failNextWindow();
    const { decision, refused } = await askUser(ENTRY, flight());
    assert.equal(decision, 'reject');
    assert.equal(refused, 'the SignLens window could not open: no display');
    nothingLeft();
});

test('with the window off, what SignLens would refuse still waits for the user, in pass-through mode', () => {
    for (const worst of ['ok', 'warning', 'blocked', 'error', 'message'] as const) {
        assert.equal(mustAsk(true, 'passthrough', worst), true, worst);
        assert.equal(mustAsk(true, 'watch', worst), true, worst);
        // Watch mode passes nothing on: with the window off, nothing waits.
        assert.equal(mustAsk(false, 'watch', worst), false, worst);
    }
    assert.equal(mustAsk(false, 'passthrough', 'blocked'), true);
    assert.equal(mustAsk(false, 'passthrough', 'error'), true);
    assert.equal(mustAsk(false, 'passthrough', 'ok'), false);
    assert.equal(mustAsk(false, 'passthrough', 'warning'), false);
    assert.equal(mustAsk(false, 'passthrough', 'message'), false);
});
