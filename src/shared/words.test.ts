// The interface's words for what is kept: a reason as a message (`said`),
// worded when it is shown (`spoken`), and the same in English (`english`,
// `inEnglish`), which is what a page is told.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Row, refusal, type Said } from './model.ts';
import { summaryOf } from './verdict.ts';
import { english, type Id, inEnglish, said, spoken } from './words.ts';

test('a reason kept as a message is worded when shown, and is in English what its page is told', () => {
    const reason = said('worker-refused-window-not-open', { error: 'no display' });
    assert.deepEqual(reason, { id: 'worker-refused-window-not-open', args: { error: 'no display' } });
    assert.deepEqual(said('worker-refused-no-decision'), { id: 'worker-refused-no-decision' });
    assert.equal(spoken(reason), 'the SignLens window could not open: no display');
    assert.equal(inEnglish(reason), english('worker-refused-window-not-open', { error: 'no display' }));
    assert.deepEqual(refusal('worker-refused-window-not-open', { error: 'no display' }), {
        decision: 'reject',
        refused: 'the SignLens window could not open: no display',
        said: reason,
    });
});

test('a message this version does not have is shown as its identifier, never as nothing', () => {
    assert.equal(spoken({ id: 'worker-refused-long-gone' as Id }), 'worker-refused-long-gone');
});

test("a request's line is its reason as the interface words it where there is one, else as its page was told", () => {
    const row = (said?: Said): Row => ({
        kind: 'failed',
        scope: 'request',
        error: 'not explained: the page closed or reloaded',
        ...(said ? { said } : {}),
    });
    assert.equal(summaryOf(row({ id: 'worker-failed-page-gone' })), 'Not explained: the page closed or reloaded');
    assert.equal(summaryOf(row()), 'Not explained: the page closed or reloaded');
});
