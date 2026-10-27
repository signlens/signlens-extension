// The wallet in the page, run in Node: a window for it to register in, the
// content script's end of its port, and a real wallet to pass requests to.
// What it is to hold whatever the page does: the bytes passed on are the
// bytes explained, a request goes on only on a decision, and the port
// stays out of the page's reach.

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { until } from '../../test/chrome.fake.ts';

const SIGN = 'solana:signTransaction';

/** A request the wallet sent the extension, and how to answer it. */
interface Asked {
    type: string;
    payload: { transactions?: string[]; message?: string; wallet?: string; accounts?: string[] };
    reply(result: unknown): void;
    /** Answers with an error in place of a result, as the content script does when the worker cannot be reached. */
    fail(error: string): void;
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
const signed: { bytes: string; self: unknown; plain: boolean; account: unknown }[] = [];
const account = Object.freeze({
    address: 'Up11111111111111111111111111111111111111111',
    publicKey: new Uint8Array(32),
    chains: ['solana:mainnet'],
    features: [SIGN],
});
const signFeature = {
    version: '1.0.0',
    async signTransaction(this: unknown, ...inputs: { transaction: Uint8Array; account?: unknown }[]) {
        for (const input of inputs) {
            signed.push({
                bytes: Buffer.from(input.transaction).toString('hex'),
                self: this,
                // biome-ignore lint/suspicious/noPrototypeBuiltins: the call a wallet may make is what is tested
                plain: Object.getPrototypeOf(input) === Object.prototype && input.hasOwnProperty('transaction'),
                account: input.account,
            });
        }
        return inputs.map((input) => ({ signedTransaction: input.transaction }));
    },
};
/** The messages the real wallet was handed, as hex. */
const signedMessages: string[] = [];
interface UpstreamAccount {
    readonly address: string;
    readonly publicKey: Uint8Array;
    readonly chains: readonly string[];
    readonly features: readonly string[];
}
// Its connection to the page, which a site may make it drop (jup.ag does
// Backpack's) and a connect takes up again, as a new account object.
let upstreamAccounts: readonly UpstreamAccount[] = [account];
const upstreamListeners = new Set<(properties: { accounts: readonly UpstreamAccount[] }) => void>();
/** Whether the real wallet still lets this site connect without asking. */
let trusted = true;
/** What each connect asked the real wallet, `null` for nothing. */
const connects: unknown[] = [];
/** The real wallet's connection changes, and it says so. */
function upstreamChange(next: readonly UpstreamAccount[]): void {
    upstreamAccounts = next;
    for (const listener of upstreamListeners) listener({ accounts: next });
}
const upstream = {
    version: '1.0.0',
    name: 'Real Wallet',
    icon: 'data:,',
    chains: ['solana:mainnet'],
    get accounts() {
        return upstreamAccounts;
    },
    features: {
        'standard:connect': {
            version: '1.0.0',
            async connect(input?: { silent?: boolean }) {
                connects.push(input ?? null);
                if (upstreamAccounts.length === 0) {
                    if (input?.silent && !trusted) throw new Error('Not connected');
                    upstreamChange([Object.freeze({ ...account })]);
                }
                return { accounts: upstreamAccounts };
            },
        },
        'standard:events': {
            version: '1.0.0',
            on(event: string, listener: (properties: { accounts: readonly UpstreamAccount[] }) => void) {
                if (event !== 'change') return () => {};
                upstreamListeners.add(listener);
                return () => upstreamListeners.delete(listener);
            },
        },
        [SIGN]: signFeature,
        'solana:signMessage': {
            version: '1.0.0',
            async signMessage(...inputs: { message: Uint8Array }[]) {
                for (const input of inputs) signedMessages.push(Buffer.from(input.message).toString('hex'));
                return inputs.map((input) => ({ signedMessage: input.message, signature: new Uint8Array(64) }));
            },
        },
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

/** Starts a request to sign a message, as `sign` does a transaction. */
function signMessage(...inputs: unknown[]): Promise<{ ok?: unknown; error?: string }> {
    return call('solana:signMessage', 'signMessage', ...inputs).then(
        (ok) => ({ ok }),
        (error: Error) => ({ error: error.message }),
    );
}

const hex = (base64: string) => Buffer.from(base64, 'base64').toString('hex');
const BENIGN = () => new Uint8Array([1, 1, 1, 1]);
const EVIL = () => new Uint8Array([6, 6, 6, 6]);
const CONTINUE = { decision: 'continue' };

before(async () => {
    // A classic script, not a module: imported for what it does when it runs.
    await import(new URL('./injected.ts', import.meta.url).href);
    if (!offered) throw new Error('no port offered');
    port = offered;
    port.onmessage = (event: MessageEvent) => {
        const data = realData.call(event) as { id?: number; type: string; payload: Asked['payload'] };
        if (data.id === undefined) return;
        const reply = (result: unknown) => realPost.call(port, { id: data.id, result });
        const fail = (error: string) => realPost.call(port, { id: data.id, error });
        if (data.type === 'config') {
            reply(pageConfig);
            return;
        }
        const request = { type: data.type, payload: data.payload, reply, fail };
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

// Each test starts where the first does, whatever ran before it: nothing
// asked or signed yet, and a pass-through session connected to the real
// wallet.
beforeEach(async () => {
    asked.length = 0;
    waiting = undefined;
    signed.length = 0;
    signedMessages.length = 0;
    upstreamAccounts = [account];
    trusted = true;
    if (pageConfig.mode !== 'passthrough') {
        settingsChange('passthrough');
        await until(() => accountsNow().length === 0);
    }
    if (accountsNow()[0] !== account.address) await connect();
    connects.length = 0;
});

type Field = 'transaction' | 'message';

/**
 * Each way a page could try to have one transaction or message explained
 * and another signed: `tamper` runs before the call, `meanwhile` while the
 * window is open, and `restore` puts back what `tamper` replaced.
 */
function attacks(field: Field): {
    name: string;
    input: () => unknown;
    tamper?: () => void;
    meanwhile?: (input: unknown) => void;
    restore?: () => void;
}[] {
    return [
        {
            name: 'writing into its array while the window is open',
            input: () => ({ account, [field]: BENIGN() }),
            meanwhile: (input) => (input as Record<Field, Uint8Array>)[field].set(EVIL()),
        },
        (() => {
            let reads = 0;
            return {
                name: 'a getter that answers differently the second time',
                input: () => ({
                    account,
                    get [field]() {
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
                input: () => ({ account, [field]: EVIL() }),
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
                input: () => ({ account, [field]: EVIL() }),
                tamper: () => {
                    // biome-ignore lint/suspicious/noExplicitAny: the page's own patch, typed as loosely as it is
                    Function.prototype.call = function (this: any, self: unknown, ...args: unknown[]) {
                        const first = args[0] as { type?: string; payload?: object } | undefined;
                        if (first?.type === 'explain') args[0] = { ...first, payload: { ...first.payload, transactions: ['AQEBAQ=='] } };
                        if (first?.type === 'message') args[0] = { ...first, payload: { ...first.payload, message: 'AQEBAQ==' } };
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
                input: () => ({ account, [field]: EVIL() }),
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
                input: () => ({ account, [field]: new Uint8Array([1, 1, 1, 1, 6, 6]) }),
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
                input: () => ({ account, [field]: BENIGN() }),
                tamper: () => {
                    Object.defineProperty(Object.prototype, field, {
                        configurable: true,
                        set() {},
                        get: () => {
                            reads += 1;
                            return reads === 1 ? BENIGN() : EVIL();
                        },
                    });
                },
                restore: () => {
                    delete (Object.prototype as Record<string, unknown>)[field];
                },
            };
        })(),
        {
            name: 'a get on Object.prototype, which a descriptor inheriting it would carry',
            input: () => ({ account, [field]: EVIL() }),
            tamper: () => {
                Object.defineProperty(Object.prototype, 'get', { configurable: true, value: () => BENIGN() });
            },
            restore: () => {
                delete (Object.prototype as Record<string, unknown>).get;
            },
        },
        {
            name: 'a setter on the array prototype that swallows the copy',
            input: () => ({ account, [field]: EVIL() }),
            tamper: () => {
                Object.defineProperty(Array.prototype, '0', { configurable: true, set() {}, get: () => ({ [field]: BENIGN() }) });
            },
            restore: () => {
                delete (Array.prototype as unknown as Record<string, unknown>)['0'];
            },
        },
    ];
}

for (const field of ['transaction', 'message'] as const) {
    for (const attack of attacks(field)) {
        test(`the ${field} passed on is the one explained, despite ${attack.name}`, async () => {
            signed.length = 0;
            signedMessages.length = 0;
            const input = attack.input();
            attack.tamper?.();
            let signing: Promise<{ ok?: unknown; error?: string }>;
            try {
                signing = field === 'transaction' ? sign(input) : signMessage(input);
            } finally {
                attack.restore?.();
            }
            const request = await nextRequest();
            attack.meanwhile?.(input);
            request.reply(CONTINUE);
            const outcome = await signing;
            assert.equal(outcome.error, undefined);
            const explained = field === 'transaction' ? (request.payload.transactions ?? []) : [request.payload.message ?? ''];
            const passedOn = field === 'transaction' ? signed.map((s) => s.bytes) : signedMessages;
            assert.deepEqual(passedOn, explained.map(hex));
            assert.equal(passedOn.length, 1);
        });
    }
}

test('a message refused is not signed, nor any of the same request: the wallet signs them together', async () => {
    const one = signMessage({ account, message: BENIGN() });
    (await nextRequest()).reply({ decision: 'reject' });
    assert.equal((await one).error, 'SignLens: rejected in SignLens. The message is in the SignLens popup.');
    // The first goes on, the second is refused: neither is signed.
    const two = signMessage({ account, message: BENIGN() }, { account, message: EVIL() });
    (await nextRequest()).reply(CONTINUE);
    (await nextRequest()).reply({ decision: 'reject', refused: 'no decision in time' });
    assert.equal((await two).error, 'SignLens: refused (no decision in time).');
    assert.deepEqual(signedMessages, []);
});

test('once a message is refused, the ones after it in the request are not asked about', async () => {
    const asking = signMessage({ account, message: BENIGN() }, { account, message: EVIL() });
    (await nextRequest()).reply({ decision: 'reject' });
    // Whichever comes first: the refusal, or the second message asked about.
    const next = await Promise.race([asking.then(() => 'refused'), nextRequest().then(() => 'asked again')]);
    assert.equal(next, 'refused');
    assert.match((await asking).error ?? '', /rejected in SignLens/);
    assert.deepEqual(signedMessages, []);
});

test('the real wallet is handed ordinary objects, which it may call methods on', async () => {
    signed.length = 0;
    const signing = sign({ account, transaction: BENIGN() });
    (await nextRequest()).reply(CONTINUE);
    assert.equal((await signing).error, undefined);
    assert.equal(signed[0]?.plain, true);
});

test("a page cannot take the wallet you sign with out of SignLens's list, nor put its own ahead of it", async () => {
    // The page reaches SignLens's app as any wallet would, takes back a
    // wallet it did not add, and adds an impostor under the same name.
    let api: { register(...wallets: unknown[]): () => void } | undefined;
    page.dispatchEvent(
        detailEvent('wallet-standard:register-wallet', (given: typeof api) => {
            api = given;
        }),
    );
    api?.register(upstream)();
    const impostor = {
        ...upstream,
        features: { ...upstream.features, [SIGN]: { version: '1.0.0', signTransaction: async () => [] } },
    };
    api?.register(impostor);
    await disconnect();
    await connect();
    const signing = sign({ account, transaction: BENIGN() });
    (await nextRequest()).reply(CONTINUE);
    await signing;
    assert.equal(signed[0]?.self, signFeature);
});

test('the extension is told the address a request is signed with, as the dapp names it, to check against yours', async () => {
    const other = { ...account, address: 'EXkwQoWHvDj7gdLdba4zWo3ktJNocyjT9DDQAryU7Tqa' };
    const signing = sign({ account: other, transaction: BENIGN() }, { account, transaction: BENIGN() });
    const request = await nextRequest();
    assert.deepEqual(request.payload.accounts, [other.address, account.address]);
    request.reply({ decision: 'reject' });
    await signing;
});

test('an error in place of an answer is a refusal by SignLens: nothing is signed, and the dapp is told why', async () => {
    const signing = sign({ account, transaction: BENIGN() });
    (await nextRequest()).fail('the extension was reloaded');
    assert.deepEqual(await signing, { error: 'SignLens: refused (the extension was reloaded).' });
    const messaging = signMessage({ account, message: BENIGN() });
    (await nextRequest()).fail('the extension was reloaded');
    assert.deepEqual(await messaging, { error: 'SignLens: refused (the extension was reloaded).' });
    assert.deepEqual(signed, []);
    assert.deepEqual(signedMessages, []);
});

test('the extension is told which wallet a request goes to, by the name it registered with', async () => {
    const signing = sign({ account, transaction: BENIGN() });
    const transaction = await nextRequest();
    assert.equal(transaction.payload.wallet, 'Real Wallet');
    transaction.reply(CONTINUE);
    await signing;
    const asking = signMessage({ account, message: BENIGN() });
    const message = await nextRequest();
    assert.equal(message.payload.wallet, 'Real Wallet');
    message.reply(CONTINUE);
    await asking;
});

test('another wallet chosen in the settings ends the session with the one before: the dapp connects again, to the one the window names', async () => {
    const handed: string[] = [];
    const chosen = {
        ...upstream,
        name: 'Chosen Wallet',
        features: {
            ...upstream.features,
            [SIGN]: {
                version: '1.0.0',
                async signTransaction(...inputs: { transaction: Uint8Array }[]) {
                    for (const input of inputs) handed.push(Buffer.from(input.transaction).toString('hex'));
                    return inputs.map((input) => ({ signedTransaction: input.transaction }));
                },
            },
        },
    };
    let unregister = () => {};
    page.dispatchEvent(
        detailEvent('wallet-standard:register-wallet', (api: { register(w: unknown): () => void }) => {
            unregister = api.register(chosen);
        }),
    );
    const changeTo = (upstream: string) => {
        pageConfig = { mode: 'passthrough', upstream };
        realPost.call(port, { type: 'config-changed', config: pageConfig });
    };
    try {
        // Connected to the first wallet found; then another is chosen.
        assert.deepEqual(accountsNow(), [account.address]);
        changeTo('chosen wallet ');
        await until(() => accountsNow().length === 0);
        await connect();
        const signing = sign({ account, transaction: BENIGN() });
        (await nextRequest()).reply(CONTINUE);
        assert.equal((await signing).error, undefined);
        assert.deepEqual([signed.length, handed.length], [0, 1]);
        // The settings naming no wallet keep the session: any is the first found.
        changeTo('');
        changeTo('Chosen Wallet');
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.deepEqual(accountsNow(), [account.address]);
    } finally {
        unregister();
        changeTo('Real Wallet');
        await until(() => accountsNow().length === 0);
        settingsChange('passthrough');
    }
});

test('the real wallet is called as a method of its feature', async () => {
    signed.length = 0;
    const signing = sign({ account, transaction: BENIGN() });
    (await nextRequest()).reply(CONTINUE);
    await signing;
    assert.equal(signed[0]?.self, signFeature);
});

test('only a decision to continue passes a request on, and the dapp is told who refused it and why, once', async () => {
    const answers: [unknown, string | null][] = [
        [CONTINUE, null],
        [{ decision: 'reject' }, 'SignLens: rejected in SignLens. The request is in the SignLens popup.'],
        [
            { decision: 'reject', error: 'the API is down' },
            'SignLens: rejected in SignLens. SignLens could not explain it: the API is down',
        ],
        [
            { decision: 'reject', refused: 'the SignLens window could not open: no display' },
            'SignLens: refused (the SignLens window could not open: no display).',
        ],
        // Anything else is no decision: refused, whatever else it says.
        [undefined, 'SignLens: refused (no decision came back).'],
        [{}, 'SignLens: refused (no decision came back).'],
        [{ decision: 'maybe' }, 'SignLens: refused (no decision came back).'],
        [{ gate: false }, 'SignLens: refused (no decision came back).'],
        [{ error: 'the API is down' }, 'SignLens: refused (no decision came back).'],
    ];
    for (const [answer, refusal] of answers) {
        signed.length = 0;
        const signing = sign({ account, transaction: BENIGN() });
        (await nextRequest()).reply(answer);
        const outcome = await signing;
        assert.equal(signed.length, refusal === null ? 1 : 0, JSON.stringify(answer));
        assert.equal(outcome.error, refusal ?? undefined, JSON.stringify(answer));
    }
});

test('a session that ended while the window was open passes nothing on, and says so', async () => {
    const signing = sign({ account, transaction: BENIGN() });
    const request = await nextRequest();
    await disconnect();
    request.reply(CONTINUE);
    assert.deepEqual(await signing, { error: 'SignLens: disconnected while the request waited; nothing was signed. Connect again.' });
    assert.equal(signed.length, 0);
});

test('what the page puts on Object.prototype is not taken for a decision', async () => {
    signed.length = 0;
    Object.defineProperty(Object.prototype, 'decision', { configurable: true, get: () => 'continue' });
    try {
        const signing = sign({ account, transaction: BENIGN() });
        (await nextRequest()).reply({});
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

/** The request `pending` sent the extension; a failure if it settled without asking. */
async function askedBy(pending: Promise<{ ok?: unknown; error?: string }>): Promise<Asked> {
    const first = await Promise.race([nextRequest(), pending.then((outcome) => ({ outcome }))]);
    if ('outcome' in first) assert.fail(`settled without asking the extension: ${first.outcome.error ?? 'signed'}`);
    return first;
}

/** What SignLens tells a dapp of its accounts, as the addresses of each change, until `stop` is called. */
function watchChanges(): { changes: string[][]; stop: () => void } {
    const changes: string[][] = [];
    const on = signlens.features['standard:events']?.on as unknown as (
        event: string,
        listener: (properties: { accounts: readonly { address: string }[] }) => void,
    ) => () => void;
    const stop = on('change', (properties) => changes.push(properties.accounts.map((a) => a.address)));
    return { changes, stop };
}

test('the wallet behind dropping its connection keeps the session: asked again silently at the request, it gets its own account', async () => {
    const { changes, stop } = watchChanges();
    try {
        const given = (signlens as unknown as { accounts: readonly unknown[] }).accounts[0];
        // As jup.ag makes Backpack drop whenever another wallet is connected.
        upstreamChange([]);
        assert.deepEqual(accountsNow(), [account.address]);
        const pending = sign({ account: given, transaction: BENIGN() });
        (await askedBy(pending)).reply(CONTINUE);
        const outcome = await pending;
        assert.equal(outcome.error, undefined);
        assert.deepEqual(connects, [{ silent: true }]);
        // Handed the account it holds now, of the same address, not the object the dapp kept.
        assert.equal(signed.length, 1);
        assert.equal(signed[0]?.account, upstreamAccounts[0]);
        assert.notEqual(signed[0]?.account, given);
        assert.equal(signed[0]?.bytes, hex(Buffer.from(BENIGN()).toString('base64')));
        // The same address back: nothing for the dapp, which never saw it go.
        assert.deepEqual(changes, []);
    } finally {
        stop();
    }
});

test('a wallet behind that will not reconnect without asking has left: nothing is signed, the session ends, the dapp is told', async () => {
    const { changes, stop } = watchChanges();
    try {
        upstreamChange([]);
        trusted = false;
        const pending = sign({ account, transaction: BENIGN() });
        (await askedBy(pending)).reply(CONTINUE);
        const outcome = await pending;
        assert.match(outcome.error ?? '', /Real Wallet is no longer connected to this site; connect again/);
        assert.equal(signed.length, 0);
        assert.deepEqual(accountsNow(), []);
        assert.deepEqual(changes, [[]]);
    } finally {
        stop();
    }
});

test("another account in the wallet behind is the dapp's to know", async () => {
    const { changes, stop } = watchChanges();
    try {
        const other = Object.freeze({ ...account, address: 'Other1111111111111111111111111111111111111' });
        upstreamChange([other]);
        assert.deepEqual(accountsNow(), [other.address]);
        assert.deepEqual(changes, [[other.address]]);
    } finally {
        stop();
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
    settingsChange('watch');
    await until(() => accountsNow().length === 0);
    const allowed = connect();
    (await nextRequest()).reply({ approved: true, ...WATCHED });
    await allowed;
    settingsChange('watch');
    const other = { address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', publicKey: WATCHED.publicKey };
    (await nextRequest()).reply({ approved: true, ...other });
    await until(() => accountsNow()[0] === other.address);
    settingsChange('passthrough');
    await until(() => accountsNow().length === 0);
});
