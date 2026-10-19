// Runs in the page's isolated world: relays between the wallet in the page
// (injected.ts) and the extension, which the page itself cannot reach.
//
// The relay is a MessageChannel: the wallet posts one port here, once, in
// a window message this script consumes before any page listener can see
// it, and everything after that travels over the port, which the page
// cannot observe or forge. A classic script, as content scripts are: no
// imports.

(() => {
    const CHANNEL = 'signlens';

    interface PortMessage {
        id?: number;
        type?: string;
        payload?: unknown;
    }

    let port: MessagePort | null = null;

    /** The requests that may wait on the user, in a window. */
    const WAITING = new Set(['connect', 'explain', 'message']);

    /**
     * Sends a request that may wait on the user over a port of its own. The
     * port closes with the page (a reload, a navigation, the tab closing),
     * which tells the worker that no one waits for the answer any more: it
     * refuses the request and closes its window rather than hold the tab.
     * A dapp changing its route keeps the page, and the port.
     */
    function ask(message: { type: string; payload: unknown }): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const worker = chrome.runtime.connect({ name: 'request' });
            worker.onMessage.addListener((answer: unknown) => {
                resolve(answer);
                worker.disconnect();
            });
            worker.onDisconnect.addListener(() => reject(new Error(chrome.runtime.lastError?.message ?? 'the extension did not answer')));
            worker.postMessage(message);
        });
    }

    async function handle(type: string | undefined, payload: unknown): Promise<unknown> {
        try {
            if (type === 'config') return await chrome.runtime.sendMessage({ type: 'config' });
            if (type === 'connect' || type === 'explain' || type === 'message' || type === 'wallets' || type === 'connect-failed') {
                // The origin is stated here, by the extension, not by the page.
                const given = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
                const message = { type, payload: { ...given, origin: window.location.origin } };
                return await (WAITING.has(type) ? ask(message) : chrome.runtime.sendMessage(message));
            }
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            if (/context invalidated/i.test(text)) throw new Error('the extension was reloaded; reload this page');
            throw error;
        }
        throw new Error(`unknown request '${String(type)}'`);
    }

    function connect(given: MessagePort): void {
        port = given;
        port.onmessage = (event: MessageEvent<PortMessage>) => {
            const data = event.data;
            const answered = handle(data?.type, data?.payload);
            // A notice has no id and gets no answer.
            if (data?.id === undefined) {
                answered.catch(() => {});
                return;
            }
            answered.then(
                (result) => port?.postMessage({ id: data.id, result }),
                (error: unknown) => port?.postMessage({ id: data.id, error: String(error instanceof Error ? error.message : error) }),
            );
        };
        port.postMessage({ type: 'connected' });
    }

    // The one window message this script takes: the wallet's port, the
    // first time it is offered. Stopped here so that no later listener,
    // the page's included, receives the event that carries the port.
    window.addEventListener('message', (event: MessageEvent<{ channel?: string; to?: string; type?: string }>) => {
        if (event.source !== window || event.data?.channel !== CHANNEL || event.data.to !== 'extension' || event.data.type !== 'port')
            return;
        event.stopImmediatePropagation();
        const [offered] = event.ports;
        if (port || !offered) return;
        connect(offered);
    });
    // The popup asks whether this script runs in a tab at all: a tab open
    // from before the extension was installed or updated has none.
    chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
        if (message?.type !== 'ping') return false;
        sendResponse({ port: port !== null });
        return false;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !port) return;
        // Only what the wallet in the page acts on: a watch session asks again
        // when the address or the sites allowed to see it change.
        if (!['mode', 'address', 'upstream', 'watchSites'].some((key) => key in changes)) return;
        chrome.runtime
            .sendMessage({ type: 'config' })
            .then((config) => port?.postMessage({ type: 'config-changed', config }))
            .catch(() => {});
    });
})();
