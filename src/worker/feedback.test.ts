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
        { message_hash: A, rating: 'wrong', comment: 'What is this?', transaction: 'AQID' },
        { message_hash: B, rating: 'wrong', comment: 'What is this?', transaction: null },
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
        records.map((r) => r.message_hash),
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

const PROGRAM = 'DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH';
const TABLE_ADDRESS = 'So11111111111111111111111111111111111111112';
const SEEN = {
    verdict: 'block',
    summary: 'Swap ≤ 1 USDC for ≥ 2 SOL via DFlow',
    findings: [{ code: 'DFLOW_INPUT_UNNAMED', severity: 'critical', instruction: 3 }],
    instructions: [{ program: PROGRAM, title: 'Swap' }],
};

test('a record carries the site, the method, the version and what the window showed', () => {
    const [record] = feedbackRecords(
        {
            rating: 'unclear',
            comment: '',
            origin: 'https://kamino.com',
            method: 'solana:signTransaction',
            records: [{ digest: A, transaction: 'AQID', seen: SEEN, loaded_writable: [TABLE_ADDRESS], loaded_readonly: [] }],
        },
        '0.4.0',
    );
    assert.deepEqual(record, {
        message_hash: A,
        rating: 'unclear',
        comment: '',
        transaction: 'AQID',
        origin: 'kamino.com',
        method: 'solana:signTransaction',
        extension: '0.4.0',
        seen: SEEN,
        loaded_writable: [TABLE_ADDRESS],
        loaded_readonly: [],
    });
});

test('the tables go only with the transaction, and what is not as described is left out', () => {
    const [record] = feedbackRecords({
        rating: 'wrong',
        origin: 'not a url',
        method: 'sign transaction',
        records: [
            {
                digest: A,
                transaction: null,
                seen: {
                    ...SEEN,
                    summary: `x\u0000${'y'.repeat(2_000)}`,
                    findings: [...SEEN.findings, { code: 'lower', severity: 'info' }, { code: 'OK', severity: 'fatal' }],
                    instructions: [...SEEN.instructions, { program: 'not an address', title: 'Bad' }],
                },
                loaded_writable: [TABLE_ADDRESS],
                loaded_readonly: [],
            },
        ],
    });
    assert.equal(record?.origin, undefined);
    assert.equal(record?.method, undefined);
    assert.equal(record?.extension, undefined);
    assert.equal(record?.loaded_writable, undefined);
    assert.equal(record?.seen?.summary.length, 1_000);
    assert.deepEqual(record?.seen?.findings, SEEN.findings);
    assert.deepEqual(record?.seen?.instructions, SEEN.instructions);
    // A verdict the engine does not give drops what was seen altogether.
    const [other] = feedbackRecords({
        rating: 'clear',
        records: [{ digest: B, transaction: null, seen: { ...SEEN, verdict: 'blocked' } }],
    });
    assert.equal(other?.seen, undefined);
    // Tables with a bad address in them are left out, the transaction kept.
    const [tables] = feedbackRecords({
        rating: 'clear',
        records: [{ digest: B, transaction: 'AQID', loaded_writable: ['nope'], loaded_readonly: [] }],
    });
    assert.equal(tables?.loaded_writable, undefined);
    assert.equal(tables?.transaction, 'AQID');
});
