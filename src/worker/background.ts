// The extension's background worker: hands a page's request to
// requests.ts, which has it explained, shown and decided on; keeps the
// wallets each page has; and routes the messages, taking from a page only
// what a page may ask (messages.ts). A page's own rules (CSP, mixed
// content) do not bind it.

import {
    accepts,
    isWaiting,
    type Message,
    type MessageType,
    REQUEST_PORT,
    type Replies,
    readMessage,
    type WaitingMessage,
    type WalletList,
    type WalletsPayload,
} from '../shared/messages.ts';
import { pageConfig, settings } from '../shared/settings.ts';
import { dropStalePending, type SessionItems, session, walletsKey } from '../shared/store.ts';
import { describe, logged, withoutControls } from '../shared/text.ts';
import { keepingAlive } from './alive.ts';
import { apiStatus } from './api.ts';
import { sendRating } from './feedback.ts';
import * as gate from './gate.ts';
import { clearHistory, markSeen } from './history.ts';
import { answerRequest, connectFailed } from './requests.ts';
import { revoke } from './sites.ts';
import { opensSetup } from './welcome.ts';

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
    const entry: WalletList = { wallets, origin: payload.origin, at: Date.now() };
    const items: Partial<SessionItems> = { latestWallets: entry };
    if (tabId !== undefined) items[walletsKey(tabId)] = entry;
    // A list of wallets is a convenience for the popup: not worth failing a page over.
    await session.set(items).catch(logged('keep the wallets'));
}

// ---- Messages ----

// A worker that stopped took the requests it had waiting with it: what they
// left in storage would only take room. In turn before any new request is kept.
dropStalePending().catch(logged('drop the requests left waiting'));

// A new install opens the setup page (welcome.ts). At the top, as every
// listener: the browser fires the event as the worker first starts.
chrome.runtime.onInstalled.addListener((details) => {
    if (opensSetup(details)) chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }).catch(logged('open the setup page'));
});

// A closed tab's wallets go with it, and its request is refused: no one is
// left to pass it to.
chrome.tabs.onRemoved.addListener((tabId) => {
    // A list of wallets left behind only takes room until the session ends.
    session.remove(walletsKey(tabId)).catch(() => {});
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
        const message = readMessage(raw, sender);
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

/** A message that is answered at once: everything but a page's request that may wait on the user. */
type Answered = Exclude<MessageType, WaitingMessage['type']>;

/** How the worker answers a message of type `T`, and what it answers when that fails. */
interface Answer<T extends Answered> {
    reply(message: Extract<Message, { type: T }>, sender: chrome.runtime.MessageSender): Replies[T] | Promise<Replies[T]>;
    failed(error: unknown): Replies[T];
}

/** The answer to each message, by its type: one for every type, or this does not compile. */
const ANSWERS: { [T in Answered]: Answer<T> } = {
    status: { reply: async () => apiStatus((await settings()).apiUrl), failed: (error) => ({ error: describe(error) }) },
    config: { reply: async () => pageConfig(await settings()), failed: () => null },
    // A list of wallets is a convenience for the popup: not worth failing a page over.
    wallets: {
        reply: async (message, sender) => {
            await rememberWallets(sender.tab?.id, message.payload);
            return true as const;
        },
        failed: () => true,
    },
    'connect-failed': {
        reply: async (message) => {
            await connectFailed(message.payload.origin, walletNames(message.payload));
            return true;
        },
        failed: () => false,
    },
    'wallet-list': {
        reply: async ({ tabId }) => {
            const key = tabId !== null ? walletsKey(tabId) : 'latestWallets';
            return (await session.get(key))[key] ?? null;
        },
        failed: () => null,
    },
    seen: {
        reply: () => {
            // The badge is a nicety: a failure to clear it is logged, never the popup's to handle.
            markSeen().catch(logged('clear the badge'));
            return true;
        },
        failed: () => true,
    },
    clear: {
        reply: async () => {
            await clearHistory();
            return true;
        },
        failed: () => false,
    },
    // Whether the request was still waiting, so the window can say so rather than close on a Continue that went nowhere.
    decision: { reply: ({ id, decision }) => gate.decide(id, decision), failed: () => false },
    retry: { reply: ({ id }) => gate.retry(id), failed: () => false },
    revoke: {
        reply: async ({ origin, address }) => {
            await revoke(origin, address);
            return true;
        },
        failed: () => false,
    },
    feedback: { reply: async ({ payload }) => sendRating(payload, (await settings()).apiUrl), failed: () => false },
};

/** `message`'s answer, by its type. */
async function answer<T extends Answered>(
    message: Extract<Message, { type: T }>,
    sender: chrome.runtime.MessageSender,
): Promise<Replies[T]> {
    // A message narrows its answer by its type, which TypeScript cannot follow through the table: the one cast.
    const { reply, failed } = ANSWERS[(message as Message).type as T] as Answer<T>;
    try {
        return await reply(message, sender);
    } catch (error) {
        return failed(error);
    }
}

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    const message = readMessage(raw, sender);
    // A page's requests that wait on the user come over a port of their own, never here.
    if (!message || isWaiting(message) || !accepts(message.type, sender, self())) {
        sendResponse(false);
        return false;
    }
    void answer(message, sender).then(sendResponse);
    return true;
});
