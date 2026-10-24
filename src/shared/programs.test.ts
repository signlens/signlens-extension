// The programs a transaction's instructions call, read from legacy, v0 and
// v1 bytes built here, so each layout is pinned byte for byte.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base58Encode } from './base58.ts';
import { base64Bytes, instructionPrograms } from './programs.ts';

const key = (n: number) => new Uint8Array(32).fill(n);
const bytes = (...parts: (number | Uint8Array)[]) => Uint8Array.from(parts.flatMap((p) => (typeof p === 'number' ? [p] : [...p])));

// Three keys: a payer (1), a program (2), an account (3); two instructions,
// the program then the account's index as a program.
function legacy(prefix: number[]): Uint8Array {
    return bytes(
        1,
        new Uint8Array(64), // one signature
        ...prefix, // version byte, if any
        1,
        0,
        1, // header
        3,
        key(1),
        key(2),
        key(3), // keys
        new Uint8Array(32), // blockhash
        2, // instructions
        1,
        1,
        0,
        2,
        7,
        7, // program 1, one account, two bytes of data
        2,
        0,
        0, // program 2, no accounts, no data
    );
}

test('a legacy and a v0 transaction name their programs by index', () => {
    const want = [base58Encode(key(2)), base58Encode(key(3))];
    assert.deepEqual(instructionPrograms(legacy([])), want);
    // A v0 message has a version byte and lookups after the instructions.
    assert.deepEqual(instructionPrograms(bytes(...legacy([0x80]), 0)), want);
});

test('a v1 transaction puts the instruction headers before their payloads', () => {
    const v1 = bytes(
        0x81,
        1,
        0,
        1, // prefix and header
        0b01100,
        0,
        0,
        0, // the compute limit and the loaded data size: two values
        new Uint8Array(32), // lifetime
        2,
        3, // two instructions, three keys
        key(1),
        key(2),
        key(3),
        new Uint8Array(8), // two config values
        1,
        1,
        2,
        0, // program 1, one account, two bytes
        2,
        0,
        0,
        0, // program 2, none, none
        0,
        7,
        7, // the payloads
    );
    assert.deepEqual(instructionPrograms(v1), [base58Encode(key(2)), base58Encode(key(3))]);
});

test('a truncated transaction or an index past the keys is refused', () => {
    const whole = legacy([]);
    assert.throws(() => instructionPrograms(whole.subarray(0, whole.length - 3)));
    const outside = legacy([]);
    outside[outside.length - 9] = 9;
    assert.throws(() => instructionPrograms(outside));
    assert.throws(() => instructionPrograms(new Uint8Array()));
});

test('base64 is read, and text that is not base64 is not', () => {
    assert.deepEqual(base64Bytes('AQID'), Uint8Array.from([1, 2, 3]));
    assert.equal(base64Bytes('***'), null);
});
