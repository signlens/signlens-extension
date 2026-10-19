// The parts of the renderer that need no DOM: quantities, and the help for a label.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { helpFor, quantity } from './render.ts';
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

test('a label gets the help written for it, and no other, whatever the engine calls it', () => {
    assert.match(helpFor('Fee payer') ?? '', /pays the fee/);
    assert.match(helpFor('Create token account if missing: Mint') ?? '', /identifies the token/);
    for (const label of ['constructor', 'toString', '__proto__', 'Create token account if missing: hasOwnProperty']) {
        assert.equal(helpFor(label), undefined, label);
    }
});
