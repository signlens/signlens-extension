// The settings helpers the popup and the worker share.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installFakeChrome } from '../../test/chrome.fake.ts';
import { base58Encode } from './base58.ts';
import { endpointProblem } from './endpoint.ts';
import {
    addressBytes,
    DEFAULTS,
    ENDPOINTS,
    MAX_CONTACTS,
    MAX_OWN_KEYS,
    ownKeysFor,
    pageConfig,
    parseContacts,
    removeAddress,
    watched,
} from './settings.ts';

test('the address book keeps valid lines and names the others by number', () => {
    const { contacts, bad } = parseContacts(
        'Bob = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\n\nnot a line\nAlice=0OIl\n  Carol  =  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA  ',
    );
    assert.deepEqual(contacts, [
        { name: 'Bob', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
        { name: 'Carol', address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
    ]);
    assert.deepEqual(bad, [3, 4]);
});

test('the address book sends its first 64 contacts and names the lines past them', () => {
    const line = (i: number) => `Contact ${i} = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`;
    const text = ['nope', ...Array.from({ length: MAX_CONTACTS + 2 }, (_, i) => line(i))].join('\n');
    const { contacts, bad, over } = parseContacts(text);
    assert.equal(contacts.length, MAX_CONTACTS);
    assert.equal(contacts.at(-1)?.name, `Contact ${MAX_CONTACTS - 1}`);
    assert.deepEqual(bad, [1]);
    assert.deepEqual(over, [MAX_CONTACTS + 2, MAX_CONTACTS + 3]);
});

test('a request carries your addresses, eight at most, those the page names first past that', () => {
    assert.deepEqual(ownKeysFor(['mine1'], ['mine0', 'mine1', 'mine0']), ['mine0', 'mine1']);
    const mine = Array.from({ length: 10 }, (_, i) => `mine${i}`);
    assert.deepEqual(ownKeysFor([], mine), mine.slice(0, MAX_OWN_KEYS));
    const sent = ownKeysFor(['mine9', 'theirs'], mine);
    assert.equal(sent.length, MAX_OWN_KEYS);
    assert.deepEqual(sent.slice(0, 2), ['mine9', 'mine0']);
    assert.ok(!sent.includes('theirs'));
});

test('an address taken out of yours goes alone: the others stay, in their order', async () => {
    installFakeChrome();
    const key = (i: number) => base58Encode(new Uint8Array(32).fill(i));
    const [a, b, c] = [key(1), key(2), key(3)];
    await chrome.storage.local.set({ myAddresses: `${a}\n${b}\n${c}` });
    await removeAddress(b);
    assert.deepEqual(await chrome.storage.local.get('myAddresses'), { myAddresses: `${a}\n${c}` });
    await removeAddress(b);
    assert.deepEqual(await chrome.storage.local.get('myAddresses'), { myAddresses: `${a}\n${c}` });
});

test('every page gets the mode and the wallet to pass to, and never the watched address', () => {
    const config = { ...DEFAULTS, mode: 'watch' as const, address: ' EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v ', upstream: 'Phantom' };
    assert.deepEqual(pageConfig(config), { mode: 'watch', upstream: 'Phantom' });
    assert.deepEqual(pageConfig({ ...config, mode: 'passthrough' }), { mode: 'passthrough', upstream: 'Phantom' });
});

test('the watched address is the one set, with its key, while it is one', () => {
    const key = watched({ address: ' EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v ' });
    assert.equal(key?.address, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    assert.equal(key?.publicKey.length, 32);
    assert.equal(watched({ address: 'EPjF' }), null);
    assert.equal(watched({ address: '' }), null);
});

test('the decoder gives a plain array, which travels as JSON', () => {
    const bytes = addressBytes('11111111111111111111111111111111');
    assert.ok(Array.isArray(bytes));
    assert.equal(bytes?.length, 32);
    assert.equal(addressBytes(null), null);
});

test('an endpoint is https, or plain http to this machine only', () => {
    for (const url of ['https://api.signlens.dev', 'http://127.0.0.1:8787', 'http://localhost/api']) {
        assert.equal(endpointProblem(url), null, url);
    }
    assert.match(endpointProblem('http://api.signlens.dev') ?? '', /plain http is for this machine only/);
    assert.match(endpointProblem('http://127.0.0.1.evil.example') ?? '', /plain http/);
    // Loopback, but without a host permission for plain http (manifest.test.ts), or under another name.
    for (const url of ['http://[::1]:8899', 'http://localhost.:8899', 'http://[::ffff:127.0.0.1]:8899']) {
        assert.match(endpointProblem(url) ?? '', /plain http/, url);
    }
    assert.match(endpointProblem('ftp://x') ?? '', /not an http\(s\) URL/);
    assert.match(endpointProblem('api.signlens.dev') ?? '', /not a URL/);
    for (const name of ENDPOINTS) assert.equal(endpointProblem(DEFAULTS[name]), null, name);
});
