// The gate, against a fake `chrome`: a request goes on only on "continue",
// and every other way a window can end (closed, its page gone, its page no
// longer waiting, never opened) is a refusal that leaves nothing behind.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { type FakeChrome, installFakeChrome, until } from './chrome.fake.ts';
import { abandon, askUser, begin, DECISION_TIMEOUT_MS, decide, end, type InFlight, mustAsk } from './gate.ts';
import type { HistoryEntry } from './render.ts';

/** A refusal that never comes fails the test rather than hang the run. */
const BOUNDED = { timeout: 2_000 };

let fake: FakeChrome;
beforeEach(() => {
    fake = installFakeChrome();
});

const ENTRY: HistoryEntry = { time: 1, mode: 'passthrough', upstream: 'Phantom', results: [{ verdict: 'warning', error: null }] };

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
    return { deadline, abandoned: false };
}

test('one request per tab is in flight at a time, with the deadline the page keeps', () => {
    const first = begin(1, 1_000);
    assert.equal(first?.deadline, 1_000 + DECISION_TIMEOUT_MS);
    assert.ok(DECISION_TIMEOUT_MS < 10 * 60_000, 'ends before the page gives up');
    assert.equal(begin(1), null);
    assert.ok(begin(2));
    end(1);
    assert.ok(begin(1));
    end(1);
    end(2);
});

test('the decision in the window ends the wait, and the window and the pending request go', BOUNDED, async () => {
    const asking = askUser(ENTRY, flight());
    const { id } = await openWindow();
    assert.deepEqual(fake.session[`pending:${id}`], ENTRY);
    assert.equal(decide(id, 'continue'), true);
    assert.deepEqual(await asking, { decision: 'continue' });
    nothingLeft();
    // A decision for a request no longer waiting is taken by nothing, and says so.
    assert.equal(decide(id, 'continue'), false);
});

test('closing the window is a refusal', BOUNDED, async () => {
    const asking = askUser(ENTRY, flight());
    const { windowId } = await openWindow();
    fake.closeWindow(windowId);
    assert.deepEqual(await asking, { decision: 'reject' });
    nothingLeft();
});

test("the page's tab closing is a refusal, with the window open or before it opens", BOUNDED, async () => {
    const open = begin(7);
    assert.ok(open);
    const asking = askUser(ENTRY, open);
    await openWindow();
    abandon(7);
    assert.deepEqual(await asking, { decision: 'reject' });
    nothingLeft();
    end(7);

    const gone = begin(8);
    assert.ok(gone);
    abandon(8);
    assert.deepEqual(await askUser(ENTRY, gone), { decision: 'reject', note: 'the page was closed' });
    nothingLeft();
    end(8);
});

test('a tab closed while its request is being stored gets no window', BOUNDED, async () => {
    const racing = begin(11);
    assert.ok(racing);
    // The ask runs up to its first write; the tab closes while it waits on it.
    const asking = askUser(ENTRY, racing);
    abandon(11);
    assert.deepEqual(await asking, { decision: 'reject', note: 'the page was closed' });
    assert.equal(fake.opened, 0);
    nothingLeft();
    end(11);
});

test('when the page stops waiting, so does the window; a page already gone gets none', BOUNDED, async () => {
    const asking = askUser(ENTRY, flight(Date.now() + 30));
    await openWindow();
    assert.deepEqual(await asking, { decision: 'reject' });
    nothingLeft();
    assert.deepEqual(await askUser(ENTRY, flight(Date.now() - 1)), { decision: 'reject', note: 'the page stopped waiting' });
    nothingLeft();
});

test('a window that cannot open is a refusal', BOUNDED, async () => {
    fake.failNextWindow();
    const { decision, note } = await askUser(ENTRY, flight());
    assert.equal(decision, 'reject');
    assert.match(note ?? '', /could not open \(no display\)/);
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
