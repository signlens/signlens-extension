// The verdicts: one ranking for the badge and the window, the engine's
// verdicts in the window's words, and a row that explains nothing never
// reads as a message to pass on.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type ExplainedRow, failure, type Row, type TransactionVerdict } from './model.ts';
import type { Explanation } from './types.ts';
import { rowVerdictWord, summaryOf, verdictOf, worse, worstVerdict } from './verdict.ts';

function explained(verdict: TransactionVerdict): ExplainedRow {
    return {
        kind: 'explained',
        verdict,
        summary: `A ${verdict} transaction`,
        findings: [],
        effects: [],
        sections: [],
        text: '',
        tables: 'none',
        simulation: 'off',
        hints: [],
        capture: '',
        digest: null,
        transaction: 'AQ==',
    };
}

const failed: Row = { kind: 'failed', error: 'down' };

test('the worst verdict wins, and a failed row is an error', () => {
    assert.equal(worstVerdict([explained('ok'), explained('warning')]), 'warning');
    assert.equal(worstVerdict([explained('ok'), failed, explained('blocked')]), 'blocked');
    assert.equal(worstVerdict([explained('ok'), failed]), 'error');
    assert.equal(worstVerdict([]), 'message');
    assert.equal(worstVerdict(failure('down').rows), 'error');
});

test('blocked outranks error in either order, for the badge as for the band', () => {
    assert.equal(worse('error', 'blocked'), 'blocked');
    assert.equal(worse('blocked', 'error'), 'blocked');
    assert.equal(worstVerdict([explained('blocked'), failed]), 'blocked');
    assert.equal(worstVerdict([failed, explained('blocked')]), 'blocked');
});

test('a message and a site asking to see the address have no verdict; each row sums itself up in a line', () => {
    assert.equal(rowVerdictWord({ kind: 'message', text: 'hello' }), 'message');
    assert.equal(rowVerdictWord({ kind: 'consent', address: 'A' }), 'message');
    assert.equal(summaryOf(explained('ok')), 'A ok transaction');
    assert.equal(summaryOf(failed), 'down');
    assert.equal(summaryOf({ kind: 'message', text: 'hello' }), 'A message, shown as it is');
    assert.equal(summaryOf({ kind: 'consent', address: 'A' }), 'Asked to see the watched address A');
});

test("the engine's verdicts are the window's ok, warning and blocked", () => {
    const of = (verdict: Explanation['verdict']) => verdictOf({ verdict } as Explanation);
    assert.deepEqual([of('Ok'), of('Warn'), of('Block')], ['ok', 'warning', 'blocked']);
});
