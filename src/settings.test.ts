// The settings helpers the popup and the worker share.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base58Decode, DEFAULTS, pageConfig, parseContacts } from './settings.ts';

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

test('the page gets the mode, the wallet to pass to, and the watch address only when it is one', () => {
    const config = { ...DEFAULTS, mode: 'watch' as const, address: ' EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v ', upstream: 'Phantom' };
    const page = pageConfig(config);
    assert.equal(page.mode, 'watch');
    assert.equal(page.address, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    assert.equal(page.publicKey?.length, 32);
    assert.equal(page.upstream, 'Phantom');
    const half = pageConfig({ ...DEFAULTS, address: 'EPjF' });
    assert.deepEqual([half.address, half.publicKey], ['', null]);
});

test('the decoder gives a plain array, which travels as JSON', () => {
    const bytes = base58Decode('11111111111111111111111111111111');
    assert.ok(Array.isArray(bytes));
    assert.equal(bytes?.length, 32);
    assert.equal(base58Decode(null), null);
});
