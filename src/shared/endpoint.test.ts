// How long a call to an endpoint may take: until its timeout, or until the
// request it is for stops, whichever comes first.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HTTPS_HOSTS, hostsNeeded, within } from './endpoint.ts';

test('a call stops at its timeout, or when the request it is for stops, with why', async () => {
    const timed = within(10);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(timed.aborted, true);

    const request = new AbortController();
    const call = within(60_000, request.signal);
    assert.equal(call.aborted, false);
    request.abort('the page closed or reloaded');
    assert.equal(call.aborted, true);
    assert.equal(call.reason, 'the page closed or reloaded');

    const stopped = new AbortController();
    stopped.abort('the page stopped waiting');
    assert.equal(within(60_000, stopped.signal).reason, 'the page stopped waiting');
});

test('the hosts asked for are every https site, and this machine only for an endpoint on it', () => {
    const DEFAULTS = ['https://api.signlens.dev', 'https://solana-rpc.publicnode.com', 'https://lite-api.jup.ag/tokens/v2/search'];
    assert.deepEqual(hostsNeeded(DEFAULTS), [HTTPS_HOSTS]);
    assert.deepEqual(hostsNeeded(['http://127.0.0.1:8787', 'http://localhost:8899', ' http://127.0.0.1:9000/ ']), [
        HTTPS_HOSTS,
        'http://127.0.0.1/*',
        'http://localhost/*',
    ]);
    // Anything else needs nothing more: it is refused as an endpoint.
    assert.deepEqual(hostsNeeded(['http://192.168.1.2:8787', 'ftp://localhost', 'not a URL', '']), [HTTPS_HOSTS]);
});
