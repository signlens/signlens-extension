// What the feedback strip may send: one record per explained transaction,
// each with its own digest and its bytes or none, and nothing for a rating
// that is not one.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_TRANSACTION_BASE64, MAX_TRANSACTIONS } from '../shared/messages.ts';
import { feedbackRecords } from './feedback.ts';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

test('each record keeps its own digest and its own bytes', () => {
    const records = feedbackRecords({
        rating: 'wrong',
        comment: 'What is this?',
        records: [
            { digest: A, transaction: 'AQID' },
            { digest: B, transaction: null },
        ],
    });
    assert.deepEqual(records, [
        { messageHash: A, rating: 'wrong', comment: 'What is this?', transaction: 'AQID' },
        { messageHash: B, rating: 'wrong', comment: 'What is this?', transaction: null },
    ]);
});

test('a rating that is not one sends nothing', () => {
    for (const rating of [undefined, 'great', 'Clear', 1, null]) {
        assert.deepEqual(feedbackRecords({ rating, records: [{ digest: A, transaction: null }] }), [], String(rating));
    }
});

test('a record that is not one is dropped, and the rest are bounded', () => {
    const records = feedbackRecords({
        rating: 'clear',
        comment: `line\u0000one${'x'.repeat(3_000)}`,
        records: [
            { digest: A.toUpperCase(), transaction: null },
            { digest: 'ab', transaction: null },
            { digest: A, transaction: 7 },
            { digest: A, transaction: 'A'.repeat(MAX_TRANSACTION_BASE64 + 4) },
            null,
            'x',
            { digest: B, transaction: null },
        ],
    });
    assert.deepEqual(
        records.map((r) => r.messageHash),
        [B],
    );
    assert.equal(records[0]?.comment?.length, 2_000);
    assert.ok(records[0]?.comment?.startsWith('line?one'));
    assert.equal(
        feedbackRecords({ rating: 'clear', records: Array(MAX_TRANSACTIONS + 5).fill({ digest: A, transaction: null }) }).length,
        MAX_TRANSACTIONS,
    );
    assert.deepEqual(feedbackRecords({ rating: 'clear', records: 'all' }), []);
});
