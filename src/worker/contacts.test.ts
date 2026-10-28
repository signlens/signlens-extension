// Your address book as the API sees it: addresses with stand-ins for the
// names, and the names put back in what it answers, only where a stand-in
// of the same request stands.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eachString, randomTag, standIns } from './contacts.ts';

const BOB = { name: 'Bob', address: 'DV3BDugD4uSbnFBwEzy6Lg4RksvPEtVCazWNwjzcL7Qp' };
const ALICE = { name: 'Alice $& Co', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' };
const TAG = '0123456789abcdef';

test('the API is sent each address with a stand-in, and no name', () => {
    const { sent } = standIns([BOB, ALICE], TAG);
    assert.deepEqual(sent, [
        { name: `[[contact-1-${TAG}]]`, address: BOB.address },
        { name: `[[contact-2-${TAG}]]`, address: ALICE.address },
    ]);
    assert.ok(!JSON.stringify(sent).includes('Bob') && !JSON.stringify(sent).includes('Alice'));
});

test("the request's stand-ins become the names, as written; a rating's become “a contact”", () => {
    const book = standIns([BOB, ALICE], TAG);
    const said = `[[contact-2-${TAG}]]'s USDC account looks like [[contact-1-${TAG}]] (DV3B…L7Qp)`;
    // Taken as written: a name is never read as a pattern.
    assert.equal(book.named(said), "Alice $& Co's USDC account looks like Bob (DV3B…L7Qp)");
    assert.equal(book.unnamed(said), "a contact's USDC account looks like a contact (DV3B…L7Qp)");
});

test("what is not one of the request's stand-ins stays as it is: another request's, another place, a lookalike", () => {
    const book = standIns([BOB], TAG);
    for (const text of [
        '[[contact-1-ffffffffffffffff]]',
        `[[contact-2-${TAG}]]`,
        `[[contact-0-${TAG}]]`,
        `[[contact-1-${TAG.toUpperCase()}]]`,
        `[contact-1-${TAG}]`,
        'Bob',
    ]) {
        assert.equal(book.named(text), text);
        assert.equal(book.unnamed(text), text);
    }
});

test('a tag is new for each request: 64 random bits, in hex', () => {
    const tags = new Set(Array.from({ length: 100 }, () => randomTag()));
    assert.equal(tags.size, 100);
    for (const tag of tags) assert.match(tag, /^[0-9a-f]{16}$/);
    assert.notEqual(standIns([BOB]).sent[0]?.name, standIns([BOB]).sent[0]?.name);
});

test('each string of an answer is swapped, however deep, and nothing else is changed', () => {
    const book = standIns([BOB], TAG);
    const answer = {
        summary: `Send 1 SOL to [[contact-1-${TAG}]] (DV3B…L7Qp)`,
        verdict: 'ok',
        findings: [{ code: 'X', message: `[[contact-1-${TAG}]]`, instruction: null }],
        effects: [{ type: 'transfer', value: { to: { label: `[[contact-1-${TAG}]]`, is_self: false, amount: 3 } } }],
    };
    assert.deepEqual(eachString(answer, book.named), {
        summary: 'Send 1 SOL to Bob (DV3B…L7Qp)',
        verdict: 'ok',
        findings: [{ code: 'X', message: 'Bob', instruction: null }],
        effects: [{ type: 'transfer', value: { to: { label: 'Bob', is_self: false, amount: 3 } } }],
    });
});
