// The worker is kept up while it holds a request, and only then: Chrome
// stops an idle worker after 30 seconds, and the requests in it with it.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installFakeChrome } from '../testing/chrome.fake.ts';
import { keepingAlive } from './alive.ts';

/** Work that ends when `finish` is called. */
function held(): { done: Promise<void>; finish: () => void; fail: () => void } {
    let finish = () => {};
    let fail = () => {};
    const done = new Promise<void>((resolve, reject) => {
        finish = resolve;
        fail = () => reject(new Error('failed'));
    });
    return { done, finish, fail };
}

test('the worker is kept up while any request is held, and left to idle once none is', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const fake = installFakeChrome();
    const first = held();
    const second = held();
    const firstDone = keepingAlive(() => first.done);
    t.mock.timers.tick(20_000);
    assert.equal(fake.pings, 1);
    const secondDone = keepingAlive(() => second.done);
    t.mock.timers.tick(20_000);
    // One timer for both.
    assert.equal(fake.pings, 2);
    first.finish();
    await firstDone;
    t.mock.timers.tick(20_000);
    assert.equal(fake.pings, 3);
    // A request that fails lets go all the same.
    second.fail();
    await assert.rejects(secondDone, /failed/);
    t.mock.timers.tick(60_000);
    assert.equal(fake.pings, 3);
});
