// The verdicts: one ranking for the badge and the window, and an answer
// that explains nothing never reads as a message to pass on.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rows, rowVerdictWord, worse, worstVerdict } from './verdict.ts';

test('the worst verdict wins, and a failed answer is one row', () => {
    assert.equal(worstVerdict([{ verdict: 'ok' }, { verdict: 'warning' }]), 'warning');
    assert.equal(worstVerdict([{ verdict: 'ok' }, { error: 'x' }, { verdict: 'blocked' }]), 'blocked');
    assert.equal(worstVerdict([{ verdict: 'ok' }, { error: 'x' }]), 'error');
    assert.equal(worstVerdict([]), 'message');
    assert.deepEqual(rows({ error: 'down' }), [{ error: 'down' }]);
    assert.deepEqual(rows({ text: 'hello' }), [{ error: null, text: 'hello' }]);
});

test('blocked outranks error in either order, for the badge as for the band', () => {
    assert.equal(worse('error', 'blocked'), 'blocked');
    assert.equal(worse('blocked', 'error'), 'blocked');
    assert.equal(worstVerdict([{ verdict: 'blocked' }, { error: 'x' }]), 'blocked');
    assert.equal(worstVerdict([{ error: 'x' }, { verdict: 'blocked' }]), 'blocked');
});

test('a failed answer is an error and a message is a message', () => {
    assert.equal(rowVerdictWord(rows({ error: 'down' })[0] ?? {}), 'error');
    assert.equal(rowVerdictWord(rows({ text: 'hello' })[0] ?? {}), 'message');
    assert.equal(worstVerdict(rows({ error: 'down' })), 'error');
});
