// Who the worker takes what from, and what it makes of what arrives: a
// page, through the content script, may only ask; deciding, rating,
// clearing and the API's status are for the extension's own pages; and a
// message is read into one the worker knows, or none.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accepts, readMessage } from './messages.ts';

const SELF = { id: 'abcdefghijklmnop', root: 'chrome-extension://abcdefghijklmnop/' };
const PAGE = { id: SELF.id, url: 'https://dapp.example/swap' };
const WINDOW = { id: SELF.id, url: 'chrome-extension://abcdefghijklmnop/confirm.html?id=1-1' };

test('a page may ask, and nothing else', () => {
    for (const type of ['config', 'connect', 'explain', 'message', 'wallets', 'connect-failed'])
        assert.equal(accepts(type, PAGE, SELF), true, type);
    // A ping is the popup asking a tab's content script, never the worker.
    for (const type of ['ping', 'decision', 'feedback', 'clear', 'seen', 'status', 'wallet-list', 'Explain', '', undefined, 7, {}]) {
        assert.equal(accepts(type, PAGE, SELF), false, String(type));
    }
});

test("the extension's own pages may send anything", () => {
    for (const type of ['decision', 'feedback', 'clear', 'seen', 'status', 'wallet-list', 'explain'])
        assert.equal(accepts(type, WINDOW, SELF), true, type);
});

test('another extension, or a page that only looks like ours, is a page or nothing', () => {
    assert.equal(accepts('explain', { ...PAGE, id: 'zzzzzzzzzzzzzzzz' }, SELF), false);
    assert.equal(accepts('decision', { ...WINDOW, id: 'zzzzzzzzzzzzzzzz' }, SELF), false);
    // The root ends in a slash, so a longer id with ours as its prefix is not ours.
    assert.equal(accepts('decision', { id: SELF.id, url: 'chrome-extension://abcdefghijklmnopq/confirm.html' }, SELF), false);
    assert.equal(accepts('decision', { id: SELF.id, url: 'https://evil.example/chrome-extension://abcdefghijklmnop/' }, SELF), false);
    assert.equal(accepts('decision', { id: SELF.id }, SELF), false);
});

test('a message is read into one the worker knows, or none: a page payload with the origin as text, a decision either way', () => {
    for (const odd of [null, 'explain', 7, [], {}, { type: 'unknown' }, { type: 'decision' }, { type: 'decision', id: '' }]) {
        assert.equal(readMessage(odd), null, JSON.stringify(odd));
    }
    assert.deepEqual(readMessage({ type: 'status', payload: 'ignored' }), { type: 'status' });
    assert.deepEqual(readMessage({ type: 'explain', payload: { transactions: ['AQ=='], origin: 'https://dapp.example\u0000' } }), {
        type: 'explain',
        payload: { transactions: ['AQ=='], origin: 'https://dapp.example?' },
    });
    // A payload that is not an object is an empty one, with an empty origin.
    assert.deepEqual(readMessage({ type: 'connect', payload: 'x' }), { type: 'connect', payload: { origin: '' } });
    assert.deepEqual(readMessage({ type: 'decision', id: '1-1', decision: 'continue' }), {
        type: 'decision',
        id: '1-1',
        decision: 'continue',
    });
    assert.deepEqual(readMessage({ type: 'decision', id: '1-1', decision: 'yes please' }), {
        type: 'decision',
        id: '1-1',
        decision: 'reject',
    });
    assert.deepEqual(readMessage({ type: 'wallet-list', tabId: '3' }), { type: 'wallet-list', tabId: null });
    assert.deepEqual(readMessage({ type: 'wallet-list', tabId: 3 }), { type: 'wallet-list', tabId: 3 });
});
