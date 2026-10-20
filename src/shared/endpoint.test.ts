// How long a call to an endpoint may take: until its timeout, or until the
// request it is for stops, whichever comes first.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { within } from './endpoint.ts';

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
