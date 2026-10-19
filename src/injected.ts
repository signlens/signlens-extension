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
    // Taken before any page script runs, so a page that replaces it later
    // cannot keep a request from reaching the extension.
    const post = MessagePort.prototype.postMessage;
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
    }

    type SignFunction = (...inputs: SignInput[]) => Promise<unknown>;

    // ---- The extension, reached through the content script ----
    //
    // One MessageChannel: this side keeps one port in its closure and
    // offers the other to the content script in a single window message,
    // which that script consumes before any page listener runs. From then
    // on nothing on the window is listened to, so a page cannot forge an
    // answer, a decision or a setting.

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

    interface PageConfig {
        mode: 'watch' | 'passthrough';
        address: string;
        publicKey: number[] | null;
        upstream: string;
    }

    interface Answer {
        error?: string;
        gate?: boolean;
        decision?: 'continue' | 'reject';
        verdicts?: (string | null)[];
    }

    let nextId = 0;
    const pending = new Map<number, Waiting>();
    const channel = new MessageChannel();
    const port = channel.port1;
    let connected = false;

    port.onmessage = (event: MessageEvent<PortMessage>) => {
        const data = event.data;
        if (data?.type === 'connected') {
            connected = true;
            announceWallets();
            return;
        }
        if (data?.type === 'config-changed' && data.config) {
            applyConfig(data.config);
            return;
        }
        if (data?.id === undefined) return;
        const waiting = pending.get(data.id);
        if (!waiting) return;
        pending.delete(data.id);
        clearTimeout(waiting.timer);
        if (data.error === undefined) waiting.resolve(data.result);
        else waiting.reject(new Error(data.error));
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
        port.postMessage({ type, payload });
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
                        type === 'config' ? 'the extension did not answer; reload the page' : 'no decision in SignLens within 10 minutes',
                    ),
                );
            }, timeout);
            pending.set(id, { resolve, reject, timer });
            post.call(port, { id, type, payload });
        });
    }

    offer();

    // ---- State ----

    let config: PageConfig = { mode: 'passthrough', address: '', publicKey: null, upstream: '' };
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

    function watchAccount(): WalletAccount {
        return Object.freeze({
            address: config.address,
            publicKey: new Uint8Array(config.publicKey ?? []),
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
        const previous = config;
        config = next;
        if (!session) return;
        if (session.mode !== config.mode) {
            // The dapp connected to a different kind of wallet; make it reconnect.
            endSession();
        } else if (session.mode === 'watch' && previous.address !== config.address) {
            if (config.publicKey) setAccounts([watchAccount()]);
            else endSession();
        }
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

    function toBase64(bytes: Uint8Array): string {
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
    }

    /**
     * Sends what was asked to the extension, which explains it, shows the
     * explanation and waits for the user's decision when the gate is on,
     * and notes the verdict in the page's console. Returns a one-line
     * summary and the decision, if one was asked for. An extension that
     * does not answer (gone, reloaded, or out of time) is a refusal: the
     * request is never passed on unexplained.
     */
    async function show(
        type: 'explain' | 'message',
        method: string,
        payload: Record<string, unknown>,
    ): Promise<{ summary: string; decision?: 'continue' | 'reject' }> {
        let answer: Answer;
        try {
            answer = (await request(type, { method, ...payload })) as Answer;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.warn(`[${NAME}] ${method}: refused, ${reason}`);
            return { summary: `SignLens did not answer (${reason}), so the request was refused.`, decision: 'reject' };
        }
        const decision = answer?.decision;
        if (answer?.error) {
            console.warn(`[${NAME}] ${method}: ${answer.error}`);
            return { summary: `SignLens could not explain it: ${answer.error}`, ...(decision ? { decision } : {}) };
        }
        if (type === 'message') return { summary: 'The message is in the SignLens popup.', ...(decision ? { decision } : {}) };
        const verdicts = (answer?.verdicts ?? []).map((verdict) => verdict ?? 'not explained').join(', ');
        console.info(`[${NAME}] ${method}: ${verdicts}. The explanation is in the SignLens popup.`);
        return { summary: `SignLens verdict: ${verdicts}. The explanation is in the SignLens popup.`, ...(decision ? { decision } : {}) };
    }

    /** Hands the request to the real wallet, or refuses it. */
    function finish(
        method: string,
        inputs: SignInput[],
        { summary, decision }: { summary: string; decision?: 'continue' | 'reject' },
    ): Promise<unknown> {
        if (decision === 'reject') throw new Error(`${NAME}: rejected in SignLens. ${summary}`);
        if (session?.mode !== 'passthrough') throw new Error(`${NAME} holds no keys: nothing was signed. ${summary}`);
        const feature = session.upstream.features[method];
        const name = method.split(':')[1] ?? method;
        const sign = feature?.[name];
        if (typeof sign !== 'function') throw new Error(`${NAME}: ${session.upstream.name} does not support ${method}`);
        return (sign as SignFunction)(...inputs);
    }

    function transactionFeature(method: string): SignFunction {
        return async (...inputs) => {
            const summary = await show('explain', method, {
                accounts: accounts.map((account) => account.address),
                transactions: inputs.map((input) => toBase64(input.transaction ?? new Uint8Array())),
            });
            return finish(method, inputs, summary);
        };
    }

    const signMessage: SignFunction = async (...inputs) => {
        let shown: { summary: string; decision?: 'continue' | 'reject' } = { summary: '' };
        for (const input of inputs) {
            shown = await show('message', SIGN_MESSAGE, {
                account: input.account?.address,
                message: toBase64(input.message ?? new Uint8Array()),
            });
            if (shown.decision === 'reject') break;
        }
        return finish(SIGN_MESSAGE, inputs, shown);
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
            if (!config.publicKey) throw new Error(`${NAME}: enter the address to watch in the extension's popup, then connect again`);
            if (session?.mode === 'passthrough') session.stopWatching?.();
            session = { mode: 'watch' };
            setAccounts([watchAccount()]);
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
                signTransaction: transactionFeature(SIGN_TRANSACTION),
            }),
            [SIGN_AND_SEND_TRANSACTION]: Object.freeze({
                version: '1.0.0',
                supportedTransactionVersions,
                signAndSendTransaction: transactionFeature(SIGN_AND_SEND_TRANSACTION),
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
