// The parts of the renderer that need no DOM: quantities and verdicts.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quantity, rows, worstVerdict } from './render.ts';
import type { Amount } from './types.ts';

function amount(units: string, decimals: number | null): Amount {
    return { units, asset: { id: 'x', symbol: null, decimals, trust: 'Fact' }, bound: 'Exact', note: null };
}

test('a quantity is scaled by its decimals, grouped by thousands, and signed', () => {
    assert.equal(quantity(amount('996423', 6)), '0.996423');
    assert.equal(quantity(amount('12417300000', 9)), '12.4173');
    assert.equal(quantity(amount('1234567000000', 6)), '1,234,567');
    assert.equal(quantity(amount('-1500', 3)), '-1.5');
    assert.equal(quantity(amount('-1', 0)), '-1');
    assert.equal(quantity(amount('42', null)), '42 raw units');
    assert.equal(quantity(amount('not a number', 2)), 'not a number raw units');
});

test('the worst verdict wins, and a failed answer is one row', () => {
    assert.equal(worstVerdict([{ verdict: 'ok' }, { verdict: 'warning' }]), 'warning');
    assert.equal(worstVerdict([{ verdict: 'ok' }, { error: 'x' }, { verdict: 'blocked' }]), 'blocked');
    assert.equal(worstVerdict([{ verdict: 'ok' }, { error: 'x' }]), 'error');
    assert.equal(worstVerdict([]), 'message');
    assert.deepEqual(rows({ error: 'down' }), [{ error: 'down' }]);
    assert.deepEqual(rows({ text: 'hello' }), [{ error: null, text: 'hello' }]);
});
