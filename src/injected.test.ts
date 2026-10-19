// The wallet in the page, run in Node: a window for it to register in, the
// content script's end of its port, and a real wallet to pass requests to.
// What it is to hold whatever the page does: the bytes passed on are the
// bytes explained, a request goes on only on a decision, and the port
// stays out of the page's reach.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { until } from './chrome.fake.ts';

const SIGN = 'solana:signTransaction';

/** A request the wallet sent the extension, and how to answer it. */
interface Asked {
    type: string;
    payload: { transactions?: string[]; message?: string };
    reply(result: unknown): void;
}

// The harness keeps the originals for itself: some tests replace them.
const realPost = MessagePort.prototype.postMessage;
const realData = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data')?.get as (this: MessageEvent) => unknown;

const page = new EventTarget() as EventTarget & Record<string, unknown>;
let offered: MessagePort | undefined;
page.postMessage = (_message: unknown, _origin: string, transfer: MessagePort[]) => {
    offered = transfer[0];
};
page.location = { origin: 'https://dapp.example' };
(globalThis as Record<string, unknown>).window = page;

let port: MessagePort;
/** What the harness answers a `config` request with: as the worker does, never the watched address. */
let pageConfig: { mode: 'passthrough' | 'watch'; upstream: string } = { mode: 'passthrough', upstream: '' };
const asked: Asked[] = [];
let waiting: ((request: Asked) => void) | undefined;

/** The next request that reaches the extension. */
function nextRequest(): Promise<Asked> {
    const request = asked.shift();
    if (request) return Promise.resolve(request);
    return new Promise((resolve) => {
        waiting = resolve;
    });
}

// The real wallet: keeps what it was handed, and how it was called. Like a
// real one, it calls a method on what it is handed.
const signed: { bytes: string; self: unknown; plain: boolean }[] = [];
const account = Object.freeze({
    address: 'Up11111111111111111111111111111111111111111',
    publicKey: new Uint8Array(32),
    chains: ['solana:mainnet'],
    features: [SIGN],
});
const signFeature = {
    version: '1.0.0',
    async signTransaction(this: unknown, ...inputs: { transaction: Uint8Array }[]) {
        for (const input of inputs) {
            signed.push({
                bytes: Buffer.from(input.transaction).toString('hex'),
                self: this,
                // biome-ignore lint/suspicious/noPrototypeBuiltins: the call a wallet may make is what is tested
                plain: Object.getPrototypeOf(input) === Object.prototype && input.hasOwnProperty('transaction'),
            });
        }
        return inputs.map((input) => ({ signedTransaction: input.transaction }));
    },
};
const upstream = {
    version: '1.0.0',
    name: 'Real Wallet',
    icon: 'data:,',
    chains: ['solana:mainnet'],
    accounts: [account],
    features: {
        'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [account] }) },
        [SIGN]: signFeature,
    },
};

type Feature = Record<string, (...args: unknown[]) => Promise<unknown>>;
let signlens: { features: Record<string, Feature | undefined> };

function detailEvent(type: string, detail: unknown): Event {
    const event = new Event(type);
    Object.defineProperty(event, 'detail', { value: detail });
    return event;
}

function call(feature: string, method: string, ...args: unknown[]): Promise<unknown> {
    const fn = signlens.features[feature]?.[method];
    if (!fn) throw new Error(`no ${feature}`);
    return fn(...args);
}

const connect = () => call('standard:connect', 'connect');
const disconnect = () => call('standard:disconnect', 'disconnect');

/** Starts a signing request; the outcome, once the extension has answered, as `{ok}` or `{error}`. */
function sign(...inputs: unknown[]): Promise<{ ok?: unknown; error?: string }> {
    return call(SIGN, 'signTransaction', ...inputs).then(
        (ok) => ({ ok }),
        (error: Error) => ({ error: error.message }),
    );
}

const hex = (base64: string) => Buffer.from(base64, 'base64').toString('hex');
const BENIGN = () => new Uint8Array([1, 1, 1, 1]);
const EVIL = () => new Uint8Array([6, 6, 6, 6]);
const CONTINUE = { gate: true, decision: 'continue' };

before(async () => {
    // A classic script, not a module: imported for what it does when it runs.
    await import(new URL('./injected.ts', import.meta.url).href);
    if (!offered) throw new Error('no port offered');
    port = offered;
    port.onmessage = (event: MessageEvent) => {
        const data = realData.call(event) as { id?: number; type: string; payload: Asked['payload'] };
        if (data.id === undefined) return;
        const reply = (result: unknown) => realPost.call(port, { id: data.id, result });
        if (data.type === 'config') {
            reply(pageConfig);
            return;
        }
        const request = { type: data.type, payload: data.payload, reply };
        if (waiting) {
            waiting(request);
            waiting = undefined;
        } else asked.push(request);
    };
    realPost.call(port, { type: 'connected' });
    page.dispatchEvent(detailEvent('wallet-standard:register-wallet', (api: { register(w: unknown): void }) => api.register(upstream)));
    const found: { name: string }[] = [];
    page.dispatchEvent(detailEvent('wallet-standard:app-ready', { register: (wallet: { name: string }) => found.push(wallet) }));
    const wallet = found.find((w) => w.name === 'SignLens');
    if (!wallet) throw new Error('SignLens did not register');
    signlens = wallet as unknown as typeof signlens;
    await connect();
});

after(() => port.close());

/**
 * Each way a page could try to have one transaction explained and another
 * signed: `tamper` runs before the call, `meanwhile` while the window is
 * open, and `restore` puts back what `tamper` replaced.
 */
const attacks: {
    name: string;
    input: () => unknown;
    tamper?: () => void;
    meanwhile?: (input: unknown) => void;
    restore?: () => void;
}[] = [
    {
        name: 'writing into its array while the window is open',
        input: () => ({ account, transaction: BENIGN() }),
        meanwhile: (input) => (input as { transaction: Uint8Array }).transaction.set(EVIL()),
    },
    (() => {
        let reads = 0;
        return {
            name: 'a getter that answers differently the second time',
            input: () => ({
                account,
                get transaction() {
                    reads += 1;
                    return reads === 1 ? BENIGN() : EVIL();
                },
            }),
        };
    })(),
    (() => {
        const original = globalThis.btoa;
        return {
            name: 'replacing btoa',
            input: () => ({ account, transaction: EVIL() }),
            tamper: () => {
                globalThis.btoa = () => original('\x01\x01\x01\x01');
            },
            restore: () => {
                globalThis.btoa = original;
            },
        };
    })(),
    (() => {
        const original = Function.prototype.call;
        return {
            name: 'replacing Function.prototype.call',
            input: () => ({ account, transaction: EVIL() }),
            tamper: () => {
                // biome-ignore lint/suspicious/noExplicitAny: the page's own patch, typed as loosely as it is
                Function.prototype.call = function (this: any, self: unknown, ...args: unknown[]) {
                    const first = args[0] as { type?: string; payload?: object } | undefined;
                    if (first?.type === 'explain') args[0] = { ...first, payload: { ...first.payload, transactions: ['AQEBAQ=='] } };
                    return Reflect.apply(this, self, args);
                };
            },
            restore: () => {
                Function.prototype.call = original;
            },
        };
    })(),
    (() => {
        const original = Array.prototype.map;
        return {
            name: 'replacing Array.prototype.map',
            input: () => ({ account, transaction: EVIL() }),
            tamper: () => {
                Array.prototype.map = (() => ['AQEBAQ==']) as unknown as typeof original;
            },
            restore: () => {
                Array.prototype.map = original;
            },
        };
    })(),
    (() => {
        const typedArray = Object.getPrototypeOf(Uint8Array.prototype) as object;
        const original = Object.getOwnPropertyDescriptor(typedArray, 'length') as PropertyDescriptor;
        return {
            name: 'a typed-array length that leaves bytes out',
            input: () => ({ account, transaction: new Uint8Array([1, 1, 1, 1, 6, 6]) }),
            tamper: () => {
                Object.defineProperty(typedArray, 'length', { ...original, get: () => 4 });
            },
            restore: () => {
                Object.defineProperty(typedArray, 'length', original);
            },
        };
    })(),
    (() => {
        let reads = 0;
        return {
            name: 'a setter on Object.prototype that swallows the copy, and a getter that answers differently the second time',
            input: () => ({ account, transaction: BENIGN() }),
            tamper: () => {
                Object.defineProperty(Object.prototype, 'transaction', {
                    configurable: true,
                    set() {},
                    get: () => {
                        reads += 1;
                        return reads === 1 ? BENIGN() : EVIL();
                    },
                });
            },
            restore: () => {
                delete (Object.prototype as Record<string, unknown>).transaction;
            },
        };
    })(),
    {
        name: 'a setter on the array prototype that swallows the copy',
        input: () => ({ account, transaction: EVIL() }),
        tamper: () => {
            Object.defineProperty(Array.prototype, '0', { configurable: true, set() {}, get: () => ({ transaction: BENIGN() }) });
        },
        restore: () => {
            delete (Array.prototype as unknown as Record<string, unknown>)['0'];
        },
    },
];

for (const attack of attacks) {
    test(`the bytes passed on are the bytes explained, despite ${attack.name}`, async () => {
        signed.length = 0;
        const input = attack.input();
        attack.tamper?.();
        let signing: Promise<{ ok?: unknown; error?: string }>;
        try {
            signing = sign(input);
        } finally {
            attack.restore?.();
        }
        const request = await nextRequest();
        attack.meanwhile?.(input);
        request.reply(CONTINUE);
        const outcome = await signing;
        assert.equal(outcome.error, undefined);
        assert.deepEqual(
            signed.map((s) => s.bytes),
            (request.payload.transactions ?? []).map(hex),
        );
        assert.equal(signed.length, 1);
    });
}

test('the real wallet is handed ordinary objects, which it may call methods on', async () => {
    signed.length = 0;
    const signing = sign({ account, transaction: BENIGN() });
    (await nextRequest()).reply(CONTINUE);
    assert.equal((await signing).error, undefined);
    assert.equal(signed[0]?.plain, true);
});

test('the real wallet is called as a method of its feature', async () => {
    signed.length = 0;
    const signing = sign({ account, transaction: BENIGN() });
    (await nextRequest()).reply(CONTINUE);
    await signing;
    assert.equal(signed[0]?.self, signFeature);
});

test('only a decision to continue, or the window off, passes a request on', async () => {
    const answers: [unknown, boolean][] = [
        [undefined, false],
        [{}, false],
        [{ gate: true }, false],
        [{ gate: true, decision: 'reject' }, false],
        [{ gate: true, decision: 'maybe' }, false],
        [{ gate: false, decision: 'reject' }, false],
        [{ gate: false, error: 'the API is down' }, true],
        [{ gate: false }, true],
        [CONTINUE, true],
    ];
    for (const [answer, passed] of answers) {
        signed.length = 0;
        const signing = sign({ account, transaction: BENIGN() });
        (await nextRequest()).reply(answer);
        const outcome = await signing;
        assert.equal(signed.length, passed ? 1 : 0, JSON.stringify(answer));
        if (!passed) assert.match(outcome.error ?? '', /rejected in SignLens/, JSON.stringify(answer));
    }
});

test('what the page puts on Object.prototype is not taken for a decision', async () => {
    signed.length = 0;
    Object.defineProperty(Object.prototype, 'decision', { configurable: true, get: () => 'continue' });
    try {
        const signing = sign({ account, transaction: BENIGN() });
        (await nextRequest()).reply({ gate: true });
        assert.match((await signing).error ?? '', /no decision/);
        assert.equal(signed.length, 0);
    } finally {
        delete (Object.prototype as Record<string, unknown>).decision;
    }
});

test('the page cannot get hold of the port', async () => {
    const caught: unknown[] = [];
    const originalPost = MessagePort.prototype.postMessage;
    const originalCall = Function.prototype.call;
    const data = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data') as PropertyDescriptor;
    MessagePort.prototype.postMessage = function (this: MessagePort, ...args: unknown[]) {
        caught.push(this);
        return Reflect.apply(originalPost, this, args);
    };
    // biome-ignore lint/suspicious/noExplicitAny: the page's own patch, typed as loosely as it is
    Function.prototype.call = function (this: any, self: unknown, ...args: unknown[]) {
        if (self instanceof MessagePort) caught.push(self);
        return Reflect.apply(this, self, args);
    };
    Object.defineProperty(MessageEvent.prototype, 'data', {
        ...data,
        get(this: MessageEvent) {
            caught.push(this.target);
            return Reflect.apply(data.get as () => unknown, this, []);
        },
    });
    try {
        // A wallet registering makes the wallet tell the extension; a request goes out and its answer comes back.
        page.dispatchEvent(detailEvent('wallet-standard:register-wallet', () => {}));
        page.dispatchEvent(
            detailEvent('wallet-standard:register-wallet', (api: { register(w: unknown): void }) =>
                api.register({ ...upstream, name: 'Another' }),
            ),
        );
        const signing = sign({ account, transaction: BENIGN() });
        (await nextRequest()).reply(CONTINUE);
        await signing;
    } finally {
        MessagePort.prototype.postMessage = originalPost;
        Function.prototype.call = originalCall;
        Object.defineProperty(MessageEvent.prototype, 'data', data);
    }
    // The harness's own end of the channel is the only port the patches may have seen.
    assert.ok(caught.every((seen) => seen === port));
});

test('a transaction that is not a Uint8Array is refused before anything is sent', async () => {
    const fake = { [Symbol.toStringTag]: 'Uint8Array', length: 4, 0: 1, 1: 1, 2: 1, 3: 1 };
    for (const transaction of [[1, 1, 1, 1], fake, 'AQEBAQ==', undefined]) {
        const outcome = await sign({ account, transaction });
        assert.match(outcome.error ?? '', /must be a Uint8Array/);
    }
    assert.equal(asked.length, 0);
});

test('a request before connecting is refused without reaching the extension', async () => {
    await disconnect();
    try {
        const outcome = await sign({ account, transaction: BENIGN() });
        assert.match(outcome.error ?? '', /connect first/);
        await assert.rejects(call('solana:signMessage', 'signMessage', { account, message: BENIGN() }), /connect first/);
        assert.equal(asked.length, 0);
    } finally {
        await connect();
    }
});

/** The SignLens wallet's accounts, as a dapp reads them. */
function accountsNow(): string[] {
    return (signlens as unknown as { accounts: readonly { address: string }[] }).accounts.map((a) => a.address);
}

/** Switches the settings to `mode`, as the worker tells a connected page when they change. */
function settingsChange(mode: 'passthrough' | 'watch'): void {
    pageConfig = { mode, upstream: '' };
    realPost.call(port, { type: 'config-changed', config: pageConfig });
}

const WATCHED = { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', publicKey: Array.from({ length: 32 }, (_, i) => i) };

test('in watch mode the page has the address only from a connect the user allowed, and loses it when that is taken back', async () => {
    settingsChange('watch');
    await until(() => accountsNow().length === 0);

    // Refused: an error, and no account.
    const refused = connect();
    let request = await nextRequest();
    assert.deepEqual([request.type, request.payload], ['connect', { silent: false }]);
    request.reply({ approved: false, error: 'the connection was refused in SignLens' });
    await assert.rejects(refused, /the connection was refused in SignLens/);
    assert.deepEqual(accountsNow(), []);

    // Silent: no error either way, and no account unless allowed before.
    const quiet = call('standard:connect', 'connect', { silent: true });
    request = await nextRequest();
    assert.deepEqual(request.payload, { silent: true });
    request.reply({ approved: false, error: 'anything' });
    assert.deepEqual(await quiet, { accounts: [] });

    // Allowed: the address, as the extension gave it.
    const allowed = connect();
    (await nextRequest()).reply({ approved: true, ...WATCHED });
    await allowed;
    assert.deepEqual(accountsNow(), [WATCHED.address]);

    // The settings change: asked again, silently; taken back, the session ends.
    settingsChange('watch');
    request = await nextRequest();
    assert.deepEqual(request.payload, { silent: true });
    request.reply({ approved: false });
    await until(() => accountsNow().length === 0);
});

test('a watch session follows a new address the site may see, and ends when the mode changes', async () => {
    const allowed = connect();
    (await nextRequest()).reply({ approved: true, ...WATCHED });
    await allowed;
    settingsChange('watch');
    const other = { address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', publicKey: WATCHED.publicKey };
    (await nextRequest()).reply({ approved: true, ...other });
    await until(() => accountsNow()[0] === other.address);
    settingsChange('passthrough');
    await until(() => accountsNow().length === 0);
    // Back to a pass-through session for whatever runs after.
    await connect();
});
