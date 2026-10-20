// The content script against a fake window and `chrome`: it takes the
// page's port once and lets no later listener see it, relays what a page
// may ask with the page's own origin, what waits over a port of its own,
// and tells the wallet in the page of the settings it acts on, its own
// site's approvals among them, and of nothing else.

import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';
import type { Approval } from '../shared/model.ts';
import type { LocalItems } from '../shared/store.ts';

type Listener = (...args: never[]) => unknown;

const page = new EventTarget() as EventTarget & Record<string, unknown>;
page.location = { origin: 'https://dapp.example' };
(globalThis as Record<string, unknown>).window = page;

/** What the content script sent the worker: by message, or over a port of its own. */
const sent: { how: 'message' | 'port'; message: { type: string; payload?: { origin?: string } } }[] = [];
/** How the worker answers a message; a port is answered with `{ answered: type }`. */
let answer: (message: { type: string }) => Promise<unknown> = async (message) => ({ answered: message.type });
let storageListener: Listener | undefined;

(globalThis as Record<string, unknown>).chrome = {
    runtime: {
        lastError: undefined,
        sendMessage: (message: { type: string }) => {
            sent.push({ how: 'message', message });
            return answer(message);
        },
        connect: () => {
            const onMessage: Listener[] = [];
            return {
                onMessage: { addListener: (listener: Listener) => onMessage.push(listener) },
                onDisconnect: { addListener: () => {} },
                postMessage: (message: { type: string }) => {
                    sent.push({ how: 'port', message });
                    void answer(message).then((reply) => {
                        for (const listener of onMessage) (listener as (reply: unknown) => void)(reply);
                    });
                },
                disconnect: () => {},
            };
        },
        onMessage: { addListener: () => {} },
    },
    storage: {
        onChanged: {
            addListener: (listener: Listener) => {
                storageListener = listener;
            },
        },
    },
};

/** Dispatches the window message that offers `port`, as the wallet in the page does. */
function offer(port: MessagePort): void {
    const event = new Event('message');
    Object.defineProperties(event, {
        source: { value: page },
        data: { value: { channel: 'signlens', to: 'extension', type: 'port' } },
        ports: { value: [port] },
    });
    page.dispatchEvent(event);
}

let wallet: MessagePort;
const received: Record<string, unknown>[] = [];

/** The next message the wallet's end of the port receives. */
async function nextReceived(): Promise<Record<string, unknown>> {
    const end = Date.now() + 1_000;
    while (received.length === 0) {
        if (Date.now() > end) throw new Error('nothing received');
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    return received.shift() ?? {};
}

/** Whether the wallet receives anything within a few turns. */
async function receivesNothing(): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return received.length === 0;
}

before(async () => {
    // A classic script, not a module: imported for what it does when it runs.
    await import(new URL('./content.ts', import.meta.url).href);
    const channel = new MessageChannel();
    wallet = channel.port1;
    wallet.onmessage = (event) => received.push(event.data as Record<string, unknown>);
    offer(channel.port2);
    assert.deepEqual(await nextReceived(), { type: 'connected' });
});

beforeEach(() => {
    sent.length = 0;
    received.length = 0;
    answer = async (message) => ({ answered: message.type });
});

test('the port is taken once, and the event that carries it reaches no listener after this one', async () => {
    const seen: Event[] = [];
    page.addEventListener('message', (event) => seen.push(event));
    const other = new MessageChannel();
    offer(other.port2);
    assert.deepEqual(seen, []);
    // A second port offered is not taken: nothing comes over it.
    const late: unknown[] = [];
    other.port1.onmessage = (event) => late.push(event.data);
    other.port1.postMessage({ id: 1, type: 'config' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(late, []);
    assert.deepEqual(sent, []);
    other.port1.close();
});

test("a request goes to the worker with the page's own origin, whatever the page says it is", async () => {
    wallet.postMessage({ id: 7, type: 'wallets', payload: { origin: 'https://evil.example', wallets: ['Phantom'] } });
    assert.deepEqual(await nextReceived(), { id: 7, result: { answered: 'wallets' } });
    assert.deepEqual(sent, [
        { how: 'message', message: { type: 'wallets', payload: { origin: 'https://dapp.example', wallets: ['Phantom'] } } },
    ]);
});

test('what may wait on the user goes over a port of its own; the settings by message', async () => {
    for (const [id, type] of [
        [1, 'connect'],
        [2, 'explain'],
        [3, 'message'],
        [4, 'config'],
    ] as const) {
        wallet.postMessage({ id, type, payload: {} });
        assert.deepEqual(await nextReceived(), { id, result: { answered: type } });
    }
    assert.deepEqual(
        sent.map(({ how, message }) => [message.type, how]),
        [
            ['connect', 'port'],
            ['explain', 'port'],
            ['message', 'port'],
            ['config', 'message'],
        ],
    );
});

test('what a page may not ask goes nowhere, and a notice gets no answer', async () => {
    wallet.postMessage({ id: 9, type: 'decision', payload: { id: 'x', decision: 'continue' } });
    assert.deepEqual(await nextReceived(), { id: 9, error: "unknown request 'decision'" });
    wallet.postMessage({ type: 'connect-failed', payload: { wallets: [] } });
    assert.ok(await receivesNothing());
    assert.deepEqual(
        sent.map(({ message }) => message.type),
        ['connect-failed'],
    );
});

test('an extension reloaded under the page says to reload the page', async () => {
    answer = async () => {
        throw new Error('Extension context invalidated.');
    };
    wallet.postMessage({ id: 11, type: 'config' });
    assert.deepEqual(await nextReceived(), { id: 11, error: 'the extension was reloaded; reload this page' });
});

/** Tells the content script of a change to the local `key`. */
function change(key: keyof LocalItems, oldValue: unknown, newValue: unknown, area = 'local'): void {
    (storageListener as (changes: Record<string, unknown>, area: string) => void)({ [key]: { oldValue, newValue } }, area);
}

const approval = (origin: string): Approval => ({ origin, address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', at: 1 });

test('the wallet hears of a change to what it acts on, its own site allowed or not among it, and of nothing else', async () => {
    answer = async () => ({ mode: 'watch', upstream: '' });
    for (const key of ['mode', 'address', 'upstream'] as const) {
        change(key, 'a', 'b');
        assert.deepEqual(await nextReceived(), { type: 'config-changed', config: { mode: 'watch', upstream: '' } }, key);
    }
    change('watchSites', [], [approval('https://dapp.example')]);
    assert.equal((await nextReceived()).type, 'config-changed');
    change('watchSites', [approval('https://dapp.example')], []);
    assert.equal((await nextReceived()).type, 'config-changed');
    // Another site allowed or revoked is none of this page's business; nor are the other settings, or session storage.
    change('watchSites', [approval('https://dapp.example')], [approval('https://dapp.example'), approval('https://other.example')]);
    change('contacts', '', 'Bob = x');
    change('mode', 'a', 'b', 'session');
    assert.ok(await receivesNothing());
});
