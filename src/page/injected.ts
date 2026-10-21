// Runs in the page itself: registers "SignLens" as a Wallet Standard
// wallet, so every dapp lists it next to the real ones. It holds no keys.
// What a dapp asks it to sign goes to the extension, which explains it and
// shows the explanation; then the request is refused (watch mode) or, once
// the user agrees, handed to a real wallet (pass-through mode). A classic
// script in the page's main world: no imports.
//
// It shares that world with the page, which may replace any built-in,
// before a call or during one. Against that it holds two things:
// - The bytes. What is explained and what the wallet is handed are the
//   same copies, made when the dapp asked (`snapshot`) through built-ins
//   taken before any page script ran (below): nothing the page does after
//   the call changes the bytes between the explanation and the wallet.
// - The port. The channel to the extension is a MessagePort kept in this
//   closure and offered to the content script once, before any page
//   listener exists (`offer`). It is used only through the built-ins taken
//   at start-up, and no page code runs while its message event is the
//   current one (`port.onmessage`), so `window.event` does not reach it.
// It does not hold the rest: a page that replaces what this script uses
// at run time (Map, Promise, setTimeout, the array methods) can tamper
// with the answers to its own requests, and so skip the window. That
// gains it nothing it could not get by asking the real wallet directly,
// which asks the user all the same.

(() => {
    const NAME = 'SignLens';
    const CHANNEL: SignLensPage.Offer['channel'] = 'signlens';
    const REQUEST_TIMEOUT_MS = 30_000;
    // A request that waits for the user's decision in the SignLens window;
    // past this it is refused, not passed on.
    const DECISION_TIMEOUT_MS = 10 * 60_000;
    // Taken before any page script runs: the port, the copies of the bytes
    // and their encoding are only ever touched through these.
    const post = MessagePort.prototype.postMessage;
    const apply = Reflect.apply;
    const defineProperty = Reflect.defineProperty;
    const create = Object.create;
    const freeze = Object.freeze;
    const hasOwn = Object.hasOwn;
    const ByteArray = Uint8Array;
    const fromCharCode = String.fromCharCode;
    const encodeBase64 = btoa;
    const schedule = setTimeout;
    // These getters read internal slots, so they answer for a real typed
    // array or message event only, whatever an object claims to be.
    const TYPED_ARRAY = Object.getPrototypeOf(Uint8Array.prototype) as object;
    const typedArrayName = Object.getOwnPropertyDescriptor(TYPED_ARRAY, Symbol.toStringTag)?.get;
    const typedArrayLength = Object.getOwnPropertyDescriptor(TYPED_ARRAY, 'length')?.get;
    const messageData = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data')?.get;
    const CHAINS = Object.freeze(['solana:mainnet', 'solana:devnet', 'solana:testnet', 'solana:localnet']);
    const CONNECT = 'standard:connect';
    const DISCONNECT = 'standard:disconnect';
    const EVENTS = 'standard:events';
    const SIGN_TRANSACTION = 'solana:signTransaction';
    const SIGN_AND_SEND_TRANSACTION = 'solana:signAndSendTransaction';
    const SIGN_MESSAGE = 'solana:signMessage';
    const ICON =
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDBkNGZmIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwb2x5Z29uIHBvaW50cz0iMjYsOCA0MS42LDE3IDQxLjYsMzUgMjYsNDQgMTAuNCwzNSAxMC40LDE3IiBzdHJva2Utd2lkdGg9IjUuNSIvPjxwYXRoIGQ9Ik0zOCAzOCA1NSA1NSIgc3Ryb2tlLXdpZHRoPSI1LjUiLz48cGF0aCBkPSJNNDUgNDUgNDAgNTBNNTEgNTEgNDYgNTYiIHN0cm9rZS13aWR0aD0iNC41Ii8+PC9nPjxwb2x5Z29uIHBvaW50cz0iMjYsMTYgMzQuNywyMSAyNiwyNiAxNy4zLDIxIiBmaWxsPSIjZmZmZmZmIi8+PHBvbHlnb24gcG9pbnRzPSIxNy4zLDIxIDI2LDI2IDI2LDM2IDE3LjMsMzEiIGZpbGw9IiNkYmVhZmUiLz48cG9seWdvbiBwb2ludHM9IjI2LDI2IDM0LjcsMjEgMzQuNywzMSAyNiwzNiIgZmlsbD0iIzkzYzVmZCIvPjwvc3ZnPg==';

    // ---- Wallet Standard, the little of it this file needs ----

    interface WalletAccount {
        readonly address: string;
        readonly publicKey: Uint8Array;
        readonly chains: readonly string[];
        readonly features: readonly string[];
        readonly label?: string;
    }

    type Feature = Record<string, unknown> & { version: string };

    interface Wallet {
        readonly version: string;
        readonly name: string;
        readonly icon: string;
        readonly chains: readonly string[];
        readonly features: Readonly<Record<string, Feature | undefined>>;
        readonly accounts: readonly WalletAccount[];
    }

    interface WalletsApi {
        register(...wallets: Wallet[]): () => void;
    }

    interface ConnectFeature extends Feature {
        connect(input?: unknown): Promise<{ accounts: readonly WalletAccount[] }>;
    }

    interface DisconnectFeature extends Feature {
        disconnect(): Promise<void>;
    }

    interface EventsFeature extends Feature {
        on(event: string, listener: (properties: { accounts?: readonly WalletAccount[] }) => void): () => void;
    }

    interface SignInput {
        account?: WalletAccount;
        transaction?: Uint8Array;
        message?: Uint8Array;
        chain?: unknown;
        options?: unknown;
    }

    type SignFunction = (...inputs: SignInput[]) => Promise<unknown>;

    // ---- The extension, reached through the content script ----
    //
    // One MessageChannel: this side keeps one port in its closure and
    // offers the other to the content script in a single window message,
    // which that script consumes before any page listener runs. From then
    // on nothing on the window is listened to. What this holds, and what
    // not, is in the header.

    interface Waiting {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    }

    interface PortMessage {
        id?: number;
        type?: string;
        config?: unknown;
        result?: unknown;
        error?: string;
    }

    /**
     * What `askExtension` makes of the extension's answer: whether the request goes
     * on, and if not, who stopped it: the user ('rejected', with where the
     * explanation is or why there is none), or SignLens ('refused', with
     * why). One line for the dapp, without a prefix: `finish` adds it.
     */
    type Shown = { passOn: true } | { passOn: false; by: 'user' | 'signlens'; why: string };

    /** `object[key]` when it is the object's own: a page cannot answer for a missing key through the prototypes it can change. */
    function own(object: unknown, key: string): unknown {
        return typeof object === 'object' && object !== null && hasOwn(object, key) ? (object as Record<string, unknown>)[key] : undefined;
    }

    /**
     * Sets `key` of `object` as its own property, past any setter a page put
     * on a prototype. The descriptor has no prototype of its own: one
     * inheriting from Object.prototype would also read a `get` or `set` the
     * page put there, and defineProperty refuses a value with an accessor,
     * so the page could make every request fail.
     */
    function put(object: object, key: PropertyKey, value: unknown): void {
        const descriptor = create(null) as PropertyDescriptor;
        descriptor.value = value;
        descriptor.writable = true;
        descriptor.enumerable = true;
        descriptor.configurable = true;
        if (!defineProperty(object, key, descriptor)) throw new Error(`${NAME}: could not keep a copy of the request`);
    }

    /** Appends `value` to `list` as its own element, past any setter a page put on the array prototype. */
    function append<T>(list: T[], value: T): void {
        put(list, list.length, value);
    }

    let nextId = 0;
    const pending = new Map<number, Waiting>();
    const channel = new MessageChannel();
    const port = channel.port1;

    // While this listener runs, `window.event` is the port's message event,
    // and its target this port; so is it in the microtasks run as the
    // listener returns. Whatever an answer settles runs the page's code (a
    // dapp's change listener, its code after an `await`), so the listener
    // only takes the data, through what was captured, and an answer is
    // handled in a task of its own, where there is no event to read.
    port.onmessage = (event: MessageEvent<PortMessage>) => {
        if (messageData === undefined) return;
        const data: unknown = apply(messageData, event, []);
        schedule(() => receive(data), 0);
    };

    /** An answer or a notice from the extension. */
    function receive(data: unknown): void {
        // A notice, by its type; else an answer, by its id.
        const type = own(data, 'type') as SignLensPage.Notice['type'] | undefined;
        if (type === 'connected') {
            announceWallets();
            return;
        }
        if (type === 'config-changed') {
            const next = own(data, 'config');
            const read = readConfig(next);
            if (read) applyConfig(read);
            void recheck();
            return;
        }
        const id = own(data, 'id');
        if (typeof id !== 'number') return;
        const waiting = pending.get(id);
        if (!waiting) return;
        pending.delete(id);
        clearTimeout(waiting.timer);
        const error = own(data, 'error');
        if (error === undefined) waiting.resolve(own(data, 'result'));
        else waiting.reject(new Error(String(error)));
    }

    /**
     * Offers the other port to the content script. Both scripts run at
     * document_start, before any page script, and a posted message is
     * dispatched only after that, so the content script's listener is in
     * place by then whatever the order, and no page listener exists yet to
     * see the offer; the content script stops its propagation besides.
     * The transfer can happen once.
     */
    function offer(): void {
        window.postMessage({ channel: CHANNEL, to: 'extension', type: 'port' } satisfies SignLensPage.Offer, window.location.origin, [
            channel.port2,
        ]);
    }

    /** Tells the extension something it does not answer: the wallets found here, a failed connect. */
    function notify(type: string, payload?: unknown): void {
        apply(post, port, [{ type, payload }]);
    }

    function request(type: string, payload?: unknown): Promise<unknown> {
        return new Promise((resolve, reject) => {
            nextId += 1;
            const id = nextId;
            const timeout = type === 'config' ? REQUEST_TIMEOUT_MS : DECISION_TIMEOUT_MS;
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(
                    new Error(
                        type === 'config'
                            ? 'the extension did not answer; reload the page'
                            : `no decision within ${DECISION_TIMEOUT_MS / 60_000} minutes`,
                    ),
                );
            }, timeout);
            pending.set(id, { resolve, reject, timer });
            apply(post, port, [{ id, type, payload }]);
        });
    }

    offer();

    // ---- State ----

    // What the extension tells every page: never the watched address, which a site gets only once allowed (`askToWatch`).
    let config: SignLensPage.Config = { mode: 'passthrough', upstream: '' };
    let accounts: readonly WalletAccount[] = Object.freeze([]);
    // null until connected; then the mode, and for pass-through the wallet behind it.
    let session: { mode: 'watch' } | { mode: 'passthrough'; upstream: Wallet; stopWatching: (() => void) | undefined } | null = null;
    const changeListeners = new Set<(properties: { accounts: readonly WalletAccount[] }) => void>();
    // Every other Wallet Standard wallet in the page.
    const otherWallets = new Set<Wallet>();

    function setAccounts(next: readonly WalletAccount[]): void {
        accounts = Object.freeze([...next]);
        for (const listener of changeListeners) {
            try {
                listener({ accounts });
            } catch (error) {
                console.error(error);
            }
        }
    }

    function watchAccount(address: string, publicKey: readonly number[]): WalletAccount {
        return Object.freeze({
            address,
            publicKey: new Uint8Array(publicKey),
            chains: CHAINS,
            features: Object.freeze([SIGN_TRANSACTION, SIGN_AND_SEND_TRANSACTION, SIGN_MESSAGE]),
            label: 'Watch-only',
        });
    }

    function endSession(): void {
        if (session?.mode === 'passthrough') session.stopWatching?.();
        session = null;
        setAccounts([]);
    }

    /** The settings the extension answered with, or `null` for anything else (it answers `null` when it cannot read them). */
    function readConfig(value: unknown): SignLensPage.Config | null {
        const mode = own(value, 'mode');
        const upstream = own(value, 'upstream');
        return (mode === 'passthrough' || mode === 'watch') && typeof upstream === 'string' ? { mode, upstream } : null;
    }

    function applyConfig(next: SignLensPage.Config): void {
        config = next;
        // The dapp connected to a different kind of wallet; make it reconnect.
        if (session && session.mode !== config.mode) endSession();
    }

    /**
     * The watched account, from the extension: it answers once the user has
     * allowed this site to see the address, asking them first unless
     * `silent`. `null` for a silent ask that nothing allowed; a refusal
     * with its reason is thrown.
     */
    async function askToWatch(silent: boolean): Promise<WalletAccount | null> {
        const answer = await request('connect', { silent });
        const address = own(answer, 'address');
        const publicKey = own(answer, 'publicKey');
        if (own(answer, 'approved') === true && typeof address === 'string' && Array.isArray(publicKey)) {
            return watchAccount(address, publicKey as number[]);
        }
        const error = own(answer, 'error');
        if (typeof error === 'string') throw new Error(`${NAME}: ${error}`);
        return null;
    }

    /** A watch session lasts while the site may see the address: asked again, without a window, when the settings change. */
    async function recheck(): Promise<void> {
        if (session?.mode !== 'watch') return;
        const account = await askToWatch(true).catch(() => null);
        if (session?.mode !== 'watch') return;
        if (!account) endSession();
        else if (account.address !== accounts[0]?.address) setAccounts([account]);
    }

    /** The wallet requests are passed to in pass-through mode. */
    function upstreamWallet(): Wallet {
        const usable = [...otherWallets].filter(
            (wallet) =>
                typeof wallet.name === 'string' &&
                wallet.features?.[CONNECT] &&
                (wallet.features[SIGN_TRANSACTION] || wallet.features[SIGN_AND_SEND_TRANSACTION]),
        );
        const wanted = config.upstream.trim().toLowerCase();
        const found = wanted ? usable.find((wallet) => wallet.name.toLowerCase() === wanted) : usable[0];
        if (found) return found;
        const names = usable.map((wallet) => wallet.name);
        const message = `no wallet${wanted ? ` named "${config.upstream.trim()}"` : ''} to pass requests to (found: ${names.join(', ') || 'none'})`;
        notify('connect-failed', { wallets: names });
        throw new Error(`${NAME}: ${message}`);
    }

    // ---- The extension ----

    /** A copy of `value`, which must be a real Uint8Array, made from its internal slots rather than anything a page can override. */
    function copyBytes(value: unknown, what: string): Uint8Array {
        if (typedArrayName === undefined || apply(typedArrayName, value, []) !== 'Uint8Array') {
            throw new Error(`${NAME}: the ${what} must be a Uint8Array`);
        }
        return new ByteArray(value as Uint8Array);
    }

    /** The base64 of `bytes`, one of this file's own copies. */
    function toBase64(bytes: Uint8Array): string {
        if (typedArrayLength === undefined) throw new Error(`${NAME}: cannot read the bytes`);
        const length = apply(typedArrayLength, bytes, []) as number;
        let binary = '';
        for (let i = 0; i < length; i += 1) binary += fromCharCode(bytes[i] as number);
        return encodeBase64(binary);
    }

    /**
     * The inputs as this wallet keeps them: each field read once and the
     * bytes copied out of the page's array, in fresh frozen objects. What is
     * explained is encoded from these copies and what is passed on is these
     * same copies, so nothing the page does after the call (writing into its
     * array, a getter that answers differently the second time, replacing a
     * built-in) changes the bytes between the explanation and the wallet.
     */
    function snapshot(inputs: SignInput[], field: 'transaction' | 'message'): SignInput[] {
        const copies: SignInput[] = [];
        for (let i = 0; i < inputs.length; i += 1) {
            const input: unknown = inputs[i];
            if (typeof input !== 'object' || input === null) throw new Error(`${NAME}: each input must be an object`);
            const given = input as SignInput;
            // An ordinary object, as a wallet expects one (it may call its
            // methods), with every field its own, as no prototype can fake.
            const copy: SignInput = {};
            put(copy, field, copyBytes(given[field], field));
            const account = given.account;
            if (account !== undefined) put(copy, 'account', account);
            if (field === 'transaction') {
                const chain = given.chain;
                const options = given.options;
                if (chain !== undefined) put(copy, 'chain', chain);
                if (options !== undefined) put(copy, 'options', options);
            }
            append(copies, freeze(copy));
        }
        return copies;
    }

    /** The addresses of `list`, for the explanation to call "you". */
    function addresses(list: readonly WalletAccount[]): string[] {
        const out: string[] = [];
        for (let i = 0; i < list.length; i += 1) {
            const address = list[i]?.address;
            if (typeof address === 'string') append(out, address);
        }
        return out;
    }

    /**
     * Sends what was asked to the extension, which explains it, shows the
     * explanation and waits for the user's decision when the window is on.
     * The request goes on only on a decision to continue: the user's, or,
     * with the window off, the extension's word that nothing stopped it.
     * Anything else (no answer, a reload, the clock, an answer without a
     * decision) is a refusal: the request is never passed on unexplained.
     * The answer never says what the explanation found, since that depends
     * on the user's address book; it stays in the extension.
     */
    async function askExtension(type: 'explain' | 'message', method: string, payload: Record<string, unknown>): Promise<Shown> {
        let answer: unknown;
        try {
            answer = await request(type, { method, ...payload });
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.warn(`[${NAME}] ${method}: refused, ${reason}`);
            return { passOn: false, by: 'signlens', why: reason };
        }
        const decision = own(answer, 'decision');
        const refused = own(answer, 'refused');
        const error = own(answer, 'error');
        if (typeof error === 'string') console.warn(`[${NAME}] ${method}: ${error}`);
        if (decision === 'continue') return { passOn: true };
        if (decision !== 'reject') return { passOn: false, by: 'signlens', why: 'no decision came back' };
        if (typeof refused === 'string') return { passOn: false, by: 'signlens', why: refused };
        const why =
            typeof error === 'string'
                ? `SignLens could not explain it: ${error}`
                : `The ${type === 'message' ? 'message' : 'request'} is in the SignLens popup.`;
        return { passOn: false, by: 'user', why };
    }

    /** Whether `a` and `b` hold the same addresses, in the same order. */
    function sameAddresses(a: readonly WalletAccount[], b: readonly WalletAccount[]): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i += 1) if (a[i]?.address !== b[i]?.address) return false;
        return true;
    }

    /**
     * The accounts of the wallet behind SignLens, asked for again, silently,
     * if it dropped its connection to the page since (see the change
     * listener in `connect`). Asked just before it is handed a request: a
     * site that disconnects the wallet whenever it connects (jup.ag with
     * Backpack) gets no turn in between. A wallet that will not reconnect
     * without asking the user has left: the session ends, and the dapp is
     * told to connect again.
     */
    async function reconnected(upstream: Wallet): Promise<readonly WalletAccount[]> {
        if (upstream.accounts.length > 0) return upstream.accounts;
        let granted: readonly WalletAccount[] = [];
        try {
            granted = (await (upstream.features[CONNECT] as ConnectFeature).connect({ silent: true })).accounts;
        } catch {
            granted = [];
        }
        if (granted.length > 0) return granted;
        if (session?.mode === 'passthrough' && session.upstream === upstream) endSession();
        throw new Error(`${NAME}: ${upstream.name} is no longer connected to this site; connect again`);
    }

    /**
     * `copies` with each input's account replaced by the wallet's own
     * account of that address. A wallet may compare the account it is
     * handed with its own, and one that dropped its connection and took it
     * up again holds a new object, where the dapp still has the one it was
     * given. The bytes are the same copies; an address the wallet does not
     * hold is left for it to refuse.
     */
    function withAccounts(copies: SignInput[], current: readonly WalletAccount[], field: 'transaction' | 'message'): SignInput[] {
        const out: SignInput[] = [];
        for (let i = 0; i < copies.length; i += 1) {
            const copy = copies[i] as SignInput;
            const given = copy.account;
            let match: WalletAccount | undefined;
            for (let j = 0; given !== undefined && j < current.length; j += 1) {
                if (current[j]?.address === given.address) match = current[j];
            }
            if (given === undefined || match === undefined || match === given) {
                append(out, copy);
                continue;
            }
            const next: SignInput = {};
            put(next, field, copy[field]);
            put(next, 'account', match);
            if (hasOwn(copy, 'chain')) put(next, 'chain', copy.chain);
            if (hasOwn(copy, 'options')) put(next, 'options', copy.options);
            append(out, freeze(next));
        }
        return out;
    }

    /** Hands the copies to the real wallet, or refuses them, saying once who refused and why. */
    async function finish(method: string, name: string, copies: SignInput[], shown: Shown): Promise<unknown> {
        if (session?.mode !== 'passthrough') {
            const why = shown.passOn ? '' : shown.by === 'signlens' ? ` Refused by SignLens (${shown.why}).` : ` ${shown.why}`;
            throw new Error(`${NAME} holds no keys: nothing was signed.${why}`);
        }
        if (!shown.passOn) {
            throw new Error(shown.by === 'signlens' ? `${NAME}: refused (${shown.why}).` : `${NAME}: rejected in SignLens. ${shown.why}`);
        }
        const upstream = session.upstream;
        const current = await reconnected(upstream);
        const feature = upstream.features[method];
        const sign = feature?.[name];
        if (typeof sign !== 'function') throw new Error(`${NAME}: ${upstream.name} does not support ${method}`);
        const field = method === SIGN_MESSAGE ? 'message' : 'transaction';
        return apply(sign, feature, withAccounts(copies, current, field)) as Promise<unknown>;
    }

    /** The wallet a request goes to on Continue, by the name it registered with, for the window to say so. */
    function handedTo(): { wallet?: string } {
        return session?.mode === 'passthrough' && typeof session.upstream.name === 'string' ? { wallet: session.upstream.name } : {};
    }

    /**
     * The addresses a request is signed with, as the dapp names one for each
     * input, or the session's when it names none. The page's word: the
     * extension checks them against the addresses you gave it (requests.ts).
     */
    function signedWith(copies: SignInput[]): string[] {
        const out: string[] = [];
        for (let i = 0; i < copies.length; i += 1) {
            const address = copies[i]?.account?.address;
            if (typeof address === 'string') append(out, address);
        }
        return out.length > 0 ? out : addresses(accounts);
    }

    function transactionFeature(method: string, name: string): SignFunction {
        return async (...inputs) => {
            if (!session) throw new Error(`${NAME}: not connected; connect first`);
            const copies = snapshot(inputs, 'transaction');
            const transactions: string[] = [];
            const chains: (string | null)[] = [];
            for (let i = 0; i < copies.length; i += 1) {
                const copy = copies[i] as SignInput;
                append(transactions, toBase64(copy.transaction as Uint8Array));
                append(chains, typeof copy.chain === 'string' ? copy.chain : null);
            }
            const shown = await askExtension('explain', method, { accounts: signedWith(copies), transactions, chains, ...handedTo() });
            return finish(method, name, copies, shown);
        };
    }

    const signMessage: SignFunction = async (...inputs) => {
        if (!session) throw new Error(`${NAME}: not connected; connect first`);
        const copies = snapshot(inputs, 'message');
        let shown: Shown = { passOn: false, by: 'signlens', why: 'nothing to sign' };
        for (let i = 0; i < copies.length; i += 1) {
            const copy = copies[i] as SignInput;
            shown = await askExtension('message', SIGN_MESSAGE, {
                message: toBase64(copy.message as Uint8Array),
                ...handedTo(),
            });
            if (!shown.passOn) break;
        }
        return finish(SIGN_MESSAGE, 'signMessage', copies, shown);
    };

    // ---- The wallet ----

    async function connect(input?: unknown): Promise<{ accounts: readonly WalletAccount[] }> {
        const settings = readConfig(await request('config'));
        if (!settings) throw new Error(`${NAME}: the extension did not answer with its settings; reload the page`);
        applyConfig(settings);
        if (config.mode === 'passthrough') {
            const upstream = upstreamWallet();
            const granted = await (upstream.features[CONNECT] as ConnectFeature).connect(input);
            if (session?.mode === 'passthrough') session.stopWatching?.();
            const stopWatching = (upstream.features[EVENTS] as EventsFeature | undefined)?.on('change', (properties) => {
                if (session?.mode !== 'passthrough' || session.upstream !== upstream || !properties.accounts) return;
                // The wallet behind dropping its connection to the page is
                // not the user leaving SignLens: a site may disconnect a
                // wallet it does not see in use (jup.ag does Backpack's
                // whenever another wallet is connected), and a wallet may
                // drop and take it up again by itself. The session stays,
                // and the wallet is asked again when a request needs it
                // (`reconnected`).
                if (properties.accounts.length === 0) return;
                // The same addresses, perhaps as new objects: nothing for the dapp.
                if (!sameAddresses(properties.accounts, accounts)) setAccounts(properties.accounts);
            });
            session = { mode: 'passthrough', upstream, stopWatching };
            setAccounts(granted.accounts);
        } else {
            // No wallet behind SignLens asks the user here, so SignLens does: a
            // silent connect (a dapp reconnecting as it loads) gets the address
            // only where it was allowed before, and never an error.
            const silent = own(input, 'silent') === true;
            const account = silent ? await askToWatch(true).catch(() => null) : await askToWatch(false);
            if (!account) {
                if (session?.mode === 'watch') endSession();
                return { accounts: [] };
            }
            if (session?.mode === 'passthrough') session.stopWatching?.();
            session = { mode: 'watch' };
            setAccounts([account]);
        }
        return { accounts };
    }

    async function disconnect(): Promise<void> {
        const upstream = session?.mode === 'passthrough' ? session.upstream : null;
        endSession();
        await (upstream?.features[DISCONNECT] as DisconnectFeature | undefined)?.disconnect();
    }

    const supportedTransactionVersions = Object.freeze(['legacy', 0]);
    const wallet: Wallet = Object.freeze({
        version: '1.0.0',
        name: NAME,
        icon: ICON,
        chains: CHAINS,
        features: Object.freeze({
            [CONNECT]: Object.freeze({ version: '1.0.0', connect }),
            [DISCONNECT]: Object.freeze({ version: '1.0.0', disconnect }),
            [EVENTS]: Object.freeze({
                version: '1.0.0',
                on(event: string, listener: (properties: { accounts: readonly WalletAccount[] }) => void) {
                    if (event !== 'change') return () => {};
                    changeListeners.add(listener);
                    return () => changeListeners.delete(listener);
                },
            }),
            [SIGN_TRANSACTION]: Object.freeze({
                version: '1.0.0',
                supportedTransactionVersions,
                signTransaction: transactionFeature(SIGN_TRANSACTION, 'signTransaction'),
            }),
            [SIGN_AND_SEND_TRANSACTION]: Object.freeze({
                version: '1.0.0',
                supportedTransactionVersions,
                signAndSendTransaction: transactionFeature(SIGN_AND_SEND_TRANSACTION, 'signAndSendTransaction'),
            }),
            [SIGN_MESSAGE]: Object.freeze({ version: '1.0.0', signMessage }),
        }),
        get accounts() {
            return accounts;
        },
    });

    // ---- Wallet Standard registration, both sides of it ----

    class DetailEvent<T> extends Event {
        readonly #detail: T;

        constructor(type: string, detail: T) {
            super(type, { bubbles: false, cancelable: false, composed: false });
            this.#detail = detail;
        }

        get detail(): T {
            return this.#detail;
        }
    }

    /** The wallets requests could be passed to, by name, for the popup's list. */
    function announceWallets(): void {
        const names = [...otherWallets].filter((w) => typeof w.name === 'string' && w.features?.[CONNECT]).map((w) => w.name);
        notify('wallets', { wallets: names });
    }

    // As an app: learn of the other wallets, to pass requests to.
    const app: WalletsApi = Object.freeze({
        register(...wallets: Wallet[]) {
            // As @wallet-standard/app does: a wallet already known is not added
            // again, and the function returned takes back only what this call
            // added, so a page cannot take out the wallet you sign with.
            const added: Wallet[] = [];
            for (const other of wallets) {
                if (other === wallet || otherWallets.has(other)) continue;
                otherWallets.add(other);
                added.push(other);
            }
            announceWallets();
            return () => {
                for (const other of added) otherWallets.delete(other);
                announceWallets();
            };
        },
    });
    window.addEventListener('wallet-standard:register-wallet', (event) => {
        try {
            const callback = (event as Event & { detail?: unknown }).detail;
            if (typeof callback === 'function') (callback as (api: WalletsApi) => void)(app);
        } catch (error) {
            console.error(error);
        }
    });
    window.dispatchEvent(new DetailEvent('wallet-standard:app-ready', app));

    // As a wallet: announce this one to the dapp, whichever loads first.
    const register = (api: unknown) => {
        try {
            (api as Partial<WalletsApi> | undefined)?.register?.(wallet);
        } catch (error) {
            console.error(error);
        }
    };
    window.addEventListener('wallet-standard:app-ready', (event) => register((event as Event & { detail?: unknown }).detail));
    window.dispatchEvent(new DetailEvent('wallet-standard:register-wallet', register));

    // Have the settings by the time a dapp connects.
    request('config').then(
        (next) => {
            const read = readConfig(next);
            if (read) applyConfig(read);
        },
        () => {},
    );
})();
