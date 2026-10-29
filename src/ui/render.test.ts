// The parts of the renderer that need no DOM: quantities, and the help for a label.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Amount, Message } from '../shared/types.ts';
import { captureName, helpFor, quantity } from './render.ts';

function amount(units: string, decimals: number | null): Amount {
    return { units, asset: { id: 'x', symbol: null, decimals, trust: 'fact', description: null }, bound: 'exact', note: null };
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

/** A label as the engine sends it: its identifier and its English. */
const label = (id: string | null, text: string): Message => ({ id, parts: [{ text }], text });

test('a label gets the help written for it, by its identifier, and no other', () => {
    assert.match(helpFor(label('label-fee-payer', 'Fee payer')) ?? '', /pays the fee/);
    // Whatever the words: the identifier says which label it is.
    assert.match(helpFor(label('label-fee-payer', 'Payeur des frais')) ?? '', /pays the fee/);
    assert.match(helpFor(label('explain-housekeeping-label', 'Create token account if missing: Mint')) ?? '', /identifies the token/);
    assert.equal(helpFor(label(null, 'Fee payer')), undefined, "a descriptor's label carries its own help");
    for (const id of ['constructor', 'toString', '__proto__', 'label-unknown']) assert.equal(helpFor(label(id, 'x')), undefined, id);
    assert.equal(helpFor(label('explain-housekeeping-label', 'Create token account if missing: hasOwnProperty')), undefined);
});

test('a transaction is saved under its time and the site, with no character a file name could be steered by', () => {
    assert.equal(captureName('jup.ag', Date.UTC(2026, 9, 20, 8, 5, 9, 123)), '20261020T080509-jup.ag.b64');
    assert.equal(captureName('a/../b\\c d:\u202eexe', 0), '19700101T000000-a_.._b_c_d__exe.b64');
    assert.equal(captureName(undefined, 0), '19700101T000000-capture.b64');
    // One of several is numbered, so that none is saved over another.
    assert.equal(captureName('jup.ag', 0, 2), '19700101T000000-jup.ag-2.b64');
});
