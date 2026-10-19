// The extension's background worker: hands a page's request to
// requests.ts, which has it explained, shown and decided on; keeps the
// wallets each page has; and routes the messages, taking from a page only
// what a page may ask (messages.ts). A page's own rules (CSP, mixed
// content) do not bind it.

import { keepingAlive } from './alive.ts';
import { apiStatus } from './api.ts';
import { sendRating } from './feedback.ts';
import * as gate from './gate.ts';
import { clearHistory, latest, markSeen, remember, showBadge } from './history.ts';
import {
    accepts,
    isWaiting,
    type MessageType,
    REQUEST_PORT,
    type Replies,
    readMessage,
    type WalletList,
    type WalletsPayload,
} from './messages.ts';
import { answerRequest } from './requests.ts';
import { pageConfig, settings } from './settings.ts';
import { revoke } from './sites.ts';
import { type SessionItems, session } from './store.ts';
import { describe, withoutControls } from './text.ts';

// ---- The page's wallets ----

function walletNames(payload: WalletsPayload): string[] {
    return (Array.isArray(payload.wallets) ? payload.wallets : [])
        .filter((name): name is string => typeof name === 'string')
        .map((name) => withoutControls(name).slice(0, 60))
        .slice(0, 32);
}

/** The wallets the page in `tabId` has, for the popup's list; the latest page's list stands in when the popup cannot tell the tab. */
async function rememberWallets(tabId: number | undefined, payload: WalletsPayload): Promise<void> {
    const wallets = walletNames(payload);
    const entry: WalletList = { wallets, origin: payload.origin ?? '', at: Date.now() };
    const items: Partial<SessionItems> = { latestWallets: entry };
    if (tabId !== undefined) items[`wallets:${tabId}`] = entry;
    // A list of wallets is a convenience for the popup: not worth failing a page over.
    await session.set(items).catch((error: unknown) => console.error('SignLens could not keep the wallets', error));
}

/**
 * A connect that found no wallet to pass to: shown in the popup like any
 * failed request, once. A page can call connect in a loop, and the same
 * failure as the latest row would only push the real requests out.
 */
async function connectFailed(payload: WalletsPayload): Promise<void> {
    const config = await settings();
    const error = withoutControls(payload.message).slice(0, 300) || 'no wallet to pass requests to';
    const last = await latest();
    const lastRow = last?.rows[0];
    if (
        last?.method === 'standard:connect' &&
        last.origin === payload.origin &&
        lastRow?.kind === 'failed' &&
        lastRow.error.includes(error)
    )
        return;
    await showBadge('error');
    await remember({
        time: Date.now(),
        ...(payload.origin ? { origin: payload.origin } : {}),
        method: 'standard:connect',
        mode: config.mode,
        upstream: config.upstream,
        rows: [{ kind: 'failed', error: `SignLens could not connect: ${error}. Choose a wallet in the extension's settings.` }],
    });
}

// ---- Messages ----

// A closed tab's wallets go with it, and its request is refused: no one is
// left to pass it to.
chrome.tabs.onRemoved.addListener((tabId) => {
    session.remove(`wallets:${tabId}`).catch(() => {});
    gate.abandon(tabId);
});

/** The extension, as `accepts` knows it. */
function self(): { id: string; root: string } {
    return { id: chrome.runtime.id, root: chrome.runtime.getURL('/') };
}

// Each comes over a port that closes with the page, and keeps the worker
// up until it is answered (alive.ts). Closed before it is answered, the
// page reloaded, navigated or closed: no one waits for the answer, so the
// request is refused and its window closed, and the tab is free for the
// page's next request.
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== REQUEST_PORT) return;
    const sender = port.sender ?? {};
    let answered = false;
    port.onMessage.addListener((raw: unknown) => {
        const message = readMessage(raw);
        if (!message || !isWaiting(message) || !accepts(message.type, sender, self())) {
            port.disconnect();
            return;
        }
        void keepingAlive(() => answerRequest(message, sender.tab?.id ?? -1)).then((reply) => {
            answered = true;
            try {
                port.postMessage(reply);
            } catch {
                // The page went meanwhile.
            }
        });
    });
    port.onDisconnect.addListener(() => {
        if (!answered && sender.tab?.id !== undefined) gate.abandon(sender.tab.id);
    });
});

/** Answers with what `answer` settles to, or what `failed` makes of its error. True: the answer comes later. */
function later<T extends MessageType>(
    respond: (reply: Replies[T]) => void,
    answer: Promise<Replies[T]>,
    failed: (error: unknown) => Replies[T],
): true {
    answer.then(respond, (error: unknown) => respond(failed(error)));
    return true;
}

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    const message = readMessage(raw);
    if (!message || !accepts(message.type, sender, self())) {
        sendResponse(false);
        return false;
    }
    switch (message.type) {
        case 'status':
            return later<'status'>(
                sendResponse,
                settings().then((config) => apiStatus(config.apiUrl)),
                (error) => ({ error: describe(error) }),
            );
        case 'config':
            return later<'config'>(sendResponse, settings().then(pageConfig), () => null);
        case 'wallets':
            return later<'wallets'>(
                sendResponse,
                rememberWallets(sender.tab?.id, message.payload).then(() => true),
                () => true,
            );
        case 'connect-failed':
            return later<'connect-failed'>(
                sendResponse,
                connectFailed(message.payload).then(() => true),
                () => false,
            );
        case 'wallet-list': {
            const key = message.tabId !== null ? (`wallets:${message.tabId}` as const) : 'latestWallets';
            return later<'wallet-list'>(
                sendResponse,
                session.get(key).then((stored) => stored[key] ?? null),
                () => null,
            );
        }
        case 'seen':
            void markSeen();
            sendResponse(true);
            return false;
        case 'clear':
            return later<'clear'>(
                sendResponse,
                clearHistory().then(() => true),
                () => false,
            );
        case 'decision':
            // Answers whether the request was still waiting, so the window
            // can say so rather than close on a Continue that went nowhere.
            sendResponse(gate.decide(message.id, message.decision));
            return false;
        case 'revoke':
            return later<'revoke'>(
                sendResponse,
                revoke(message.origin, message.address).then(() => true),
                () => false,
            );
        case 'feedback':
            return later<'feedback'>(
                sendResponse,
                settings().then((config) => sendRating(message.payload, config.apiUrl)),
                () => false,
            );
        // A page's requests that wait on the user come over a port, not here.
        case 'connect':
        case 'explain':
        case 'message':
            sendResponse(false);
            return false;
    }
});
