// The settings helpers the popup and the worker share.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base58Decode, DEFAULTS, ENDPOINTS, endpointProblem, pageConfig, parseContacts, watched } from './settings.ts';

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
    const bytes = base58Decode('11111111111111111111111111111111');
    assert.ok(Array.isArray(bytes));
    assert.equal(bytes?.length, 32);
    assert.equal(base58Decode(null), null);
});

test('an endpoint is https, or plain http to this machine only', () => {
    for (const url of ['https://api.signlens.dev', 'http://127.0.0.1:8787', 'http://localhost/api', 'http://[::1]:8899']) {
        assert.equal(endpointProblem(url), null, url);
    }
    assert.match(endpointProblem('http://api.signlens.dev') ?? '', /plain http is for this machine only/);
    assert.match(endpointProblem('http://127.0.0.1.evil.example') ?? '', /plain http/);
    assert.match(endpointProblem('ftp://x') ?? '', /not an http\(s\) URL/);
    assert.match(endpointProblem('api.signlens.dev') ?? '', /not a URL/);
    for (const name of ENDPOINTS) assert.equal(endpointProblem(DEFAULTS[name]), null, name);
});
