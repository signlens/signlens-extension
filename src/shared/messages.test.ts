// Who the worker takes what from, and what it makes of what arrives: a
// page, through the content script, may only ask; deciding, rating,
// clearing and the API's status are for the extension's own pages; and a
// message is read into one the worker knows, or none.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accepts, MESSAGE_TYPES, readMessage } from './messages.ts';

const SELF = { id: 'abcdefghijklmnop', root: 'chrome-extension://abcdefghijklmnop/' };
const PAGE = { id: SELF.id, url: 'https://dapp.example/swap' };
const WINDOW = { id: SELF.id, url: 'chrome-extension://abcdefghijklmnop/confirm.html?id=1-1' };

test('a page may ask, and nothing else, whatever the worker takes', () => {
    const asks = ['config', 'connect', 'explain', 'message', 'wallets', 'connect-failed'];
    for (const type of MESSAGE_TYPES) assert.equal(accepts(type, PAGE, SELF), asks.includes(type), type);
    assert.ok(MESSAGE_TYPES.includes('decision') && MESSAGE_TYPES.includes('revoke'));
});

test("the extension's own pages may send anything the worker takes", () => {
    for (const type of MESSAGE_TYPES) assert.equal(accepts(type, WINDOW, SELF), true, type);
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
    // A type the worker does not know is no message, however close: a ping is the popup asking a tab's content script, never the worker.
    const types = ['unknown', 'Explain', '', 'ping', 7, {}, 'toString', '__proto__'].map((type) => ({ type }));
    for (const odd of [null, 'explain', 7, [], {}, ...types, { type: 'decision' }, { type: 'decision', id: '' }]) {
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

test("a page's origin is the browser's word for it where it gives one, never what the message says", () => {
    const sent = { type: 'explain', payload: { origin: 'https://evil.example', transactions: [] } };
    const read = (sender?: { origin?: string }) => {
        const message = readMessage(sent, sender);
        return message?.type === 'explain' ? message.payload.origin : undefined;
    };
    assert.equal(read({ origin: 'https://dapp.example' }), 'https://dapp.example');
    // A sandboxed frame has an origin of its own, "null", and is no one's.
    assert.equal(read({ origin: 'null' }), 'null');
    // Without it (Firefox), what the content script stamped, from the page's location in its own world.
    assert.equal(read({}), 'https://evil.example');
    assert.equal(read(), 'https://evil.example');
});
