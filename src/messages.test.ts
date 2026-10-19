// Who the worker takes what from: a page, through the content script, may
// only ask; deciding, rating, clearing and the API's status are for the
// extension's own pages.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accepts } from './messages.ts';

const SELF = { id: 'abcdefghijklmnop', root: 'chrome-extension://abcdefghijklmnop/' };
const PAGE = { id: SELF.id, url: 'https://dapp.example/swap' };
const WINDOW = { id: SELF.id, url: 'chrome-extension://abcdefghijklmnop/confirm.html?id=1-1' };

test('a page may ask, and nothing else', () => {
    for (const type of ['ping', 'config', 'explain', 'message', 'wallets', 'connect-failed'])
        assert.equal(accepts(type, PAGE, SELF), true, type);
    for (const type of ['decision', 'feedback', 'clear', 'seen', 'status', 'wallet-list', 'Explain', '', undefined, 7, {}]) {
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
