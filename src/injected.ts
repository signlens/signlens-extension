// Runs in the page itself: registers "SignLens" as a Wallet Standard
// wallet, so every dapp lists it next to the real ones. It holds no keys.
// What a dapp asks it to sign goes to the extension, which explains it and
// shows the explanation; then the request is refused (watch mode) or, once
// the user agrees, handed to a real wallet (pass-through mode). A classic
// script in the page's main world: no imports, and nothing of the page's
// is trusted.

(() => {
    const NAME = 'SignLens';
    const CHANNEL = 'signlens';
    const REQUEST_TIMEOUT_MS = 30_000;
    // A request that waits for the user's decision in the SignLens window;
    // past this it is refused, not passed on.
    const DECISION_TIMEOUT_MS = 10 * 60_000;
    // Taken before any page script runs. A page that replaces the originals
    // later cannot reach the port through them, keep a request from the
    // extension, or change the bytes between their explanation and the
    // wallet: the port, the copies of the bytes and their encoding are only
    // ever touched through these.
    const post = MessagePort.prototype.postMessage;
    const apply = Reflect.apply;
    const defineProperty = Reflect.defineProperty;
    const create = Object.create;
    const freeze = Object.freeze;
    const hasOwn = Object.hasOwn;
    const ByteArray = Uint8Array;
    const fromCharCode = String.fromCharCode;
    const encodeBase64 = btoa;
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
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTQiIGZpbGw9IiMxNDIxM2QiLz48Y2lyY2xlIGN4PSIyOCIgY3k9IjI4IiByPSIxMyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmNhMzExIiBzdHJva2Utd2lkdGg9IjUiLz48cGF0aCBkPSJNMzggMzhsMTIgMTIiIHN0cm9rZT0iI2ZjYTMxMSIgc3Ryb2tlLXdpZHRoPSI2IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cGF0aCBkPSJNMjIgMjhsNCA0IDgtOSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+';

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
    // on nothing on the window is listened to, and the port is used only
    // through what was taken at start-up, so a page cannot reach it to
    // forge an answer or a setting.
    //
    // Code in the page's own world cannot be fully protected from the page:
    // one that rewrites built-ins such as Promise can make this wallet skip
    // the window, which gains it nothing it could not get by asking the
    // real wallet directly. What it cannot do is have SignLens explain one
    // transaction and pass on another; see `snapshot`.

    interface Waiting {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    }

    interface PortMessage {
        id?: number;
        type?: string;
        config?: PageConfig;
        result?: unknown;
        error?: string;
    }

    /** What the extension tells every page: never the watched address, which a site gets only once allowed (`askToWatch`). */
    interface PageConfig {
        mode: 'watch' | 'passthrough';
        upstream: string;
    }

    /** What `show` makes of the extension's answer: a line for the dapp, and whether the request goes on. */
    interface Shown {
        summary: string;
        passOn: boolean;
    }

    /** `object[key]` when it is the object's own: a page cannot answer for a missing key through the prototypes it can change. */
    function own(object: unknown, key: string): unknown {
        return typeof object === 'object' && object !== null && hasOwn(object, key) ? (object as Record<string, unknown>)[key] : undefined;
    }

    /** Sets `key` of `object` as its own property, past any setter a page put on a prototype. */
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

    port.onmessage = (event: MessageEvent<PortMessage>) => {
        if (messageData === undefined) return;
        const data: unknown = apply(messageData, event, []);
        const type = own(data, 'type');
        if (type === 'connected') {
            announceWallets();
            return;
        }
        if (type === 'config-changed') {
            const next = own(data, 'config');
            if (next) applyConfig(next as PageConfig);
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
    };

    /**
     * Offers the other port to the content script. Both scripts run at
     * document_start, before any page script, and a posted message is
     * dispatched only after that, so the content script's listener is in
     * place by then whatever the order, and no page listener exists yet to
     * see the offer; the content script stops its propagation besides.
     * The transfer can happen once.
     */
    function offer(): void {
        window.postMessage({ channel: CHANNEL, to: 'extension', type: 'port' }, window.location.origin, [channel.port2]);
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
                            : `no decision in SignLens within ${DECISION_TIMEOUT_MS / 60_000} minutes`,
                    ),
                );
            }, timeout);
            pending.set(id, { resolve, reject, timer });
            apply(post, port, [{ id, type, payload }]);
        });
    }

    offer();

    // ---- State ----

    let config: PageConfig = { mode: 'passthrough', upstream: '' };
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

    function applyConfig(next: PageConfig): void {
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
        notify('connect-failed', { message, wallets: names });
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
    function snapshot(inputs: SignInput[], bytes: 'transaction' | 'message'): SignInput[] {
        const copies: SignInput[] = [];
        for (let i = 0; i < inputs.length; i += 1) {
            const input: unknown = inputs[i];
            if (typeof input !== 'object' || input === null) throw new Error(`${NAME}: each input must be an object`);
            const given = input as SignInput;
            // An ordinary object, as a wallet expects one (it may call its
            // methods), with every field its own, as no prototype can fake.
            const copy: SignInput = {};
            put(copy, bytes, copyBytes(given[bytes], bytes));
            const account = given.account;
            if (account !== undefined) put(copy, 'account', account);
            if (bytes === 'transaction') {
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
     * Returns a line for the dapp and whether to pass the request on: on the
     * user's "continue", or when the extension says it did not ask (the
     * window off, and nothing SignLens would refuse).
     * Anything else (no answer, a reload, the clock, an answer without a
     * decision) is a refusal: the request is never passed on unexplained.
     * The answer never says what the explanation found, since that depends
     * on the user's address book; it stays in the extension.
     */
    async function show(type: 'explain' | 'message', method: string, payload: Record<string, unknown>): Promise<Shown> {
        let answer: unknown;
        try {
            answer = await request(type, { method, ...payload });
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.warn(`[${NAME}] ${method}: refused, ${reason}`);
            return { summary: `SignLens did not answer (${reason}), so the request was refused.`, passOn: false };
        }
        const decision = own(answer, 'decision');
        const passOn = decision === 'continue' || (own(answer, 'gate') === false && decision === undefined);
        const error = own(answer, 'error');
        if (typeof error === 'string') {
            console.warn(`[${NAME}] ${method}: ${error}`);
            return { summary: `SignLens could not explain it: ${error}`, passOn };
        }
        if (!passOn && decision !== 'reject') return { summary: 'SignLens got no decision, so the request was refused.', passOn };
        return { summary: `The ${type === 'message' ? 'message' : 'explanation'} is in the SignLens popup.`, passOn };
    }

    /** Hands the copies to the real wallet, or refuses them. */
    function finish(method: string, name: string, copies: SignInput[], { summary, passOn }: Shown): Promise<unknown> {
        if (session?.mode !== 'passthrough') throw new Error(`${NAME} holds no keys: nothing was signed. ${summary}`);
        if (!passOn) throw new Error(`${NAME}: rejected in SignLens. ${summary}`);
        const upstream = session.upstream;
        const feature = upstream.features[method];
        const sign = feature?.[name];
        if (typeof sign !== 'function') throw new Error(`${NAME}: ${upstream.name} does not support ${method}`);
        return apply(sign, feature, copies) as Promise<unknown>;
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
            const shown = await show('explain', method, { accounts: addresses(accounts), transactions, chains });
            return finish(method, name, copies, shown);
        };
    }

    const signMessage: SignFunction = async (...inputs) => {
        if (!session) throw new Error(`${NAME}: not connected; connect first`);
        const copies = snapshot(inputs, 'message');
        let shown: Shown = { summary: '', passOn: false };
        for (let i = 0; i < copies.length; i += 1) {
            const copy = copies[i] as SignInput;
            const address = copy.account?.address;
            shown = await show('message', SIGN_MESSAGE, {
                ...(typeof address === 'string' ? { account: address } : {}),
                message: toBase64(copy.message as Uint8Array),
            });
            if (!shown.passOn) break;
        }
        return finish(SIGN_MESSAGE, 'signMessage', copies, shown);
    };

    // ---- The wallet ----

    async function connect(input?: unknown): Promise<{ accounts: readonly WalletAccount[] }> {
        applyConfig((await request('config')) as PageConfig);
        if (config.mode === 'passthrough') {
            const upstream = upstreamWallet();
            const granted = await (upstream.features[CONNECT] as ConnectFeature).connect(input);
            if (session?.mode === 'passthrough') session.stopWatching?.();
            const stopWatching = (upstream.features[EVENTS] as EventsFeature | undefined)?.on('change', (properties) => {
                if (session?.mode !== 'passthrough' || session.upstream !== upstream || !properties.accounts) return;
                if (properties.accounts.length === 0) endSession();
                else setAccounts(properties.accounts);
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
            for (const other of wallets) if (other !== wallet) otherWallets.add(other);
            announceWallets();
            return () => {
                for (const other of wallets) otherWallets.delete(other);
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
        (next) => applyConfig(next as PageConfig),
        () => {},
    );
})();
