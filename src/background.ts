// The extension's background worker: answers a page's request by having it
// explained (explain.ts), shown in the window and decided on when the gate
// is on (gate.ts), and kept for the popup (history.ts); keeps the wallets
// each page has; and routes the messages, taking from a page only what a
// page may ask (messages.ts). A page's own rules (CSP, mixed content) do
// not bind it.

import { apiStatus } from './api.ts';
import { explainTransactions, showMessage } from './explain.ts';
import { sendRating } from './feedback.ts';
import * as gate from './gate.ts';
import { clearHistory, latest, markSeen, remember, showBadge } from './history.ts';
import {
    accepts,
    type ConnectPayload,
    type ConnectReply,
    type ExplainPayload,
    type FeedbackPayload,
    type Message,
    type MessagePayload,
    type Reply,
    type WalletsPayload,
} from './messages.ts';
import type { Entry, HistoryEntry } from './render.ts';
import { pageConfig, parseContacts, type Settings, settings } from './settings.ts';
import { connectWatch } from './sites.ts';
import { describe, withoutControls } from './text.ts';
import { rows, worstVerdict } from './verdict.ts';

/**
 * Answers a page's request. Nothing in here fails open: an error anywhere
 * becomes an answer with the error, which goes through the window like
 * any refusal (`gate.mustAsk`, the window off or not), and the reply
 * always says whether the user was asked, so that the page's wallet can
 * tell "no decision asked" from "no decision given".
 */
async function answer(type: 'explain' | 'message', payload: ExplainPayload & MessagePayload, flight: gate.InFlight): Promise<Reply> {
    let config: Settings;
    try {
        config = await settings();
    } catch (error) {
        // Without settings nothing can be shown or trusted: refused.
        return { error: `SignLens could not read its settings: ${describe(error)}`, gate: true, decision: 'reject' };
    }
    let result: Entry;
    try {
        result =
            type === 'message' ? showMessage(payload) : await explainTransactions(payload, config, parseContacts(config.contacts).contacts);
    } catch (error) {
        result = { error: `SignLens could not explain it: ${describe(error)}` };
    }
    const worst = worstVerdict(rows(result));
    await showBadge(worst);
    const entry: HistoryEntry = {
        time: Date.now(),
        ...(payload.origin !== undefined ? { origin: payload.origin } : {}),
        ...(payload.method !== undefined ? { method: payload.method } : {}),
        mode: config.mode,
        upstream: config.upstream,
        ...result,
    };
    let decision: gate.Decision | undefined;
    const asked = gate.mustAsk(config.gate, config.mode, worst);
    if (asked) {
        try {
            ({ decision } = await gate.askUser(entry, flight));
        } catch {
            decision = 'reject';
        }
    }
    // Only a request that could go on has a decision to show in the history.
    const kept = config.mode === 'passthrough' ? decision : undefined;
    await remember({ ...entry, ...(kept ? { decision: kept } : {}) });
    return {
        ...(result.error !== undefined ? { error: result.error } : {}),
        gate: asked,
        ...(decision ? { decision } : {}),
    };
}

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
    const entry = { wallets, origin: withoutControls(payload.origin).slice(0, 200), at: Date.now() };
    await chrome.storage.session
        .set({ ...(tabId !== undefined ? { [`wallets:${tabId}`]: entry } : {}), latestWallets: entry })
        .catch(() => {});
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
    if (last?.method === 'standard:connect' && last.origin === payload.origin && last.error?.includes(error)) return;
    await showBadge('error');
    await remember({
        time: Date.now(),
        ...(payload.origin !== undefined ? { origin: payload.origin } : {}),
        method: 'standard:connect',
        mode: config.mode,
        upstream: config.upstream,
        error: `SignLens could not connect: ${error}. Choose a wallet in the extension's settings.`,
    });
}

// ---- Messages ----

// A closed tab's wallets go with it, and its request is refused: no one is
// left to pass it to.
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove(`wallets:${tabId}`).catch(() => {});
    gate.abandon(tabId);
});

/** The extension, as `accepts` knows it. */
function self(): { id: string; root: string } {
    return { id: chrome.runtime.id, root: chrome.runtime.getURL('/') };
}

/** The requests that may wait on the user, which come over a port each (`content.ts`). */
const WAITING = new Set(['connect', 'explain', 'message']);

/** A page's request that may wait on the user: a connect in watch mode (sites.ts), or something to explain and decide on. */
async function request(message: Message, sender: chrome.runtime.MessageSender): Promise<Reply | ConnectReply> {
    const tabId = sender.tab?.id ?? -1;
    if (message.type === 'connect') {
        try {
            return await connectWatch((message.payload ?? {}) as ConnectPayload, tabId, await settings());
        } catch (error) {
            return { approved: false, error: describe(error) };
        }
    }
    // One request per tab at a time: a page cannot stack up windows, or
    // calls to the RPC and the API, by asking again and again.
    const flight = gate.begin(tabId);
    if (!flight) return { error: 'SignLens is still busy with an earlier request from this page', gate: true, decision: 'reject' };
    try {
        return await answer(
            message.type === 'message' ? 'message' : 'explain',
            (message.payload ?? {}) as ExplainPayload & MessagePayload,
            flight,
        );
    } catch (error) {
        return { error: `SignLens failed: ${describe(error)}`, gate: true, decision: 'reject' };
    } finally {
        gate.end(tabId);
    }
}

// Each comes over a port that closes with the page. Closed before it is
// answered, the page reloaded, navigated or closed: no one waits for the
// answer, so the request is refused and its window closed, and the tab is
// free for the page's next request.
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'request') return;
    const sender = port.sender ?? {};
    let answered = false;
    port.onMessage.addListener((message: Message) => {
        if (!WAITING.has(message?.type ?? '') || !accepts(message.type, sender, self())) {
            port.disconnect();
            return;
        }
        void request(message, sender).then((reply) => {
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

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    if (!accepts(message?.type, sender, self())) {
        sendResponse(false);
        return false;
    }
    switch (message.type) {
        case 'ping':
            sendResponse(true);
            return false;
        case 'status':
            settings()
                .then((config) => apiStatus(config.apiUrl))
                .then(sendResponse)
                .catch((error: unknown) => sendResponse({ error: describe(error) }));
            return true;
        case 'config':
            settings()
                .then((config) => sendResponse(pageConfig(config)))
                .catch(() => sendResponse(null));
            return true;
        case 'wallets':
            rememberWallets(sender.tab?.id, (message.payload ?? {}) as WalletsPayload).then(() => sendResponse(true));
            return true;
        case 'connect-failed':
            connectFailed((message.payload ?? {}) as WalletsPayload)
                .then(() => sendResponse(true))
                .catch(() => sendResponse(false));
            return true;
        case 'wallet-list': {
            // The popup asks for the wallets of a tab, or, when it cannot tell
            // its tab, of the latest page that announced any.
            const key = typeof message.tabId === 'number' ? `wallets:${message.tabId}` : 'latestWallets';
            chrome.storage.session
                .get(key)
                .then((stored) => sendResponse(stored[key] ?? null))
                .catch(() => sendResponse(null));
            return true;
        }
        case 'seen':
            void markSeen();
            sendResponse(true);
            return false;
        case 'clear':
            clearHistory()
                .then(() => sendResponse(true))
                .catch(() => sendResponse(false));
            return true;
        case 'decision':
            // Answers whether the request was still waiting, so the window
            // can say so rather than close on a Continue that went nowhere.
            sendResponse(message.id ? gate.decide(message.id, message.decision === 'continue' ? 'continue' : 'reject') : false);
            return false;
        case 'feedback':
            settings()
                .then((config) => sendRating((message.payload ?? {}) as FeedbackPayload, config.apiUrl))
                .then(sendResponse)
                .catch(() => sendResponse(false));
            return true;
        default:
            return false;
    }
});
