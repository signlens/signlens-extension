// What the worker is sent and answers, and who may send what. The content
// script relays a page's requests; the popup and the windows are the
// extension's own pages. A message is read (`readMessage`) before
// anything else looks at it: a page can send anything, so its fields stay
// `unknown` but for the origin the content script states.

import type { ApiStatus } from './api.ts';
import type { Decision } from './model.ts';
import { printable } from './text.ts';

/** How many transactions one request may hold. */
export const MAX_TRANSACTIONS = 32;
/** The largest transaction taken: a v1 transaction's limit, past the 1232 bytes of a legacy or v0 one. */
export const MAX_TRANSACTION_BYTES = 4096;
/** The same, as base64: a quick bound only, since this many characters can hold two bytes more. */
export const MAX_TRANSACTION_BASE64 = Math.ceil(MAX_TRANSACTION_BYTES / 3) * 4;
/** The longest message to sign taken: far past any sign-in or off-chain message. */
export const MAX_MESSAGE_BYTES = 65_536;
/** The same, as base64. */
export const MAX_MESSAGE_BASE64 = Math.ceil(MAX_MESSAGE_BYTES / 3) * 4;
/** The longest comment a rating carries, in characters. */
export const MAX_COMMENT = 2000;

/** A page's fields, as the content script relays them: anything, but for the origin, which the content script states. */
export type PagePayload = Record<string, unknown> & { origin: string };

/** A page asking for transactions to be explained. The accounts are the ones the wallet granted, as the page's wallet reports them. */
export interface ExplainPayload {
    origin?: string;
    method?: unknown;
    accounts?: unknown;
    transactions?: unknown;
    /** The chain each transaction is for, as the dapp named it (`solana:devnet`), or null. */
    chains?: unknown;
    /** The wallet the page hands the request to on Continue, by the name it registered with. */
    wallet?: unknown;
}

/** A page asking for a message to be signed. */
export interface MessagePayload {
    origin?: string;
    method?: unknown;
    message?: unknown;
    wallet?: unknown;
}

/** A page connecting in watch mode; `silent` when it may only be told what was allowed before, without asking. */
export interface ConnectPayload {
    origin?: string;
    silent?: unknown;
}

/** What a connect in watch mode gets: the watched address once the user allowed the site, or a refusal. */
export type ConnectReply = { approved: true; address: string; publicKey: number[] } | { approved: false; error?: string };

/** The wallets a page has, or the connect that found none to pass to. */
export interface WalletsPayload {
    wallets?: unknown;
    origin?: string;
    message?: unknown;
}

/** The wallets a page announced, as the popup asks for them. */
export interface WalletList {
    wallets: string[];
    origin: string;
    at: number;
}

/** A rating from the window's feedback strip. */
export interface FeedbackPayload {
    rating?: unknown;
    comment?: unknown;
    /** One per explained transaction: its digest, and its bytes when the user asked for them to be sent. */
    records?: unknown;
}

/**
 * What the page's wallet gets back: whether the request goes on, why
 * SignLens refused it when the user did not, and why it could not be
 * explained, if it could not. 'continue' is the user's decision, or, with
 * the window off, that nothing stopped it; anything but 'continue' is a
 * refusal. Never the explanation nor even its verdict: both depend on the
 * user's address book (a transfer to a lookalike of a contact is a
 * warning), and the page is not to learn who the user knows.
 */
export interface Reply {
    decision: Decision;
    refused?: string;
    error?: string;
}

/** What a page may ask, through the content script; everything else comes from the extension's own pages only. */
const PAGE: Readonly<Record<SignLensPage.Request, true>> = {
    config: true,
    connect: true,
    explain: true,
    message: true,
    wallets: true,
    'connect-failed': true,
};
export const PAGE_REQUESTS = Object.keys(PAGE) as readonly SignLensPage.Request[];

/** The page's requests that may wait on the user, each over a port of its own named `REQUEST_PORT` (content.ts). */
export const WAITING_REQUESTS: readonly SignLensPage.Request[] = ['connect', 'explain', 'message'];
export const REQUEST_PORT = 'request';

/** One member per type, each with `fields`, so that a message narrows by its type. */
type Each<T extends string, Fields extends object = object> = T extends string ? { type: T } & Fields : never;

/** A message to the worker, by type. */
export type Message =
    | Each<'config' | 'status' | 'seen' | 'clear'>
    | Each<Exclude<SignLensPage.Request, 'config'>, { payload: PagePayload }>
    | Each<'feedback', { payload: FeedbackPayload }>
    /** The wallets of a tab, or, when the popup cannot tell its tab, of the latest page that announced any. */
    | Each<'wallet-list', { tabId: number | null }>
    | Each<'decision', { id: string; decision: Decision }>
    /** Takes back a site's approval, which the worker alone writes (sites.ts). */
    | Each<'revoke', { origin: string; address: string }>;

export type MessageType = Message['type'];

/** A page's request that may wait on the user. */
export type WaitingMessage = Extract<Message, { type: 'connect' | 'explain' | 'message' }>;

export function isWaiting(message: Message): message is WaitingMessage {
    return (WAITING_REQUESTS as readonly string[]).includes(message.type);
}

/** What each message is answered with. */
export interface Replies {
    config: SignLensPage.Config | null;
    connect: ConnectReply;
    explain: Reply;
    message: Reply;
    wallets: true;
    'connect-failed': boolean;
    status: ApiStatus | { error: string };
    'wallet-list': WalletList | null;
    seen: true;
    clear: boolean;
    /** Whether a request was still waiting for the decision. */
    decision: boolean;
    /** Whether the API took every record. */
    feedback: boolean;
    revoke: boolean;
}

/** `value` if it is an object, else an empty one: what a payload is read from. */
function fields(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** A message to the worker as it arrived, read into one this worker knows, or `null`. */
export function readMessage(value: unknown): Message | null {
    const { type, payload, tabId, id, decision, origin, address } = fields(value);
    switch (type) {
        case 'config':
        case 'status':
        case 'seen':
        case 'clear':
            return { type };
        case 'connect':
        case 'explain':
        case 'message':
        case 'wallets':
        case 'connect-failed': {
            const given = fields(payload);
            return { type, payload: { ...given, origin: printable(given.origin, 200) } };
        }
        case 'feedback':
            return { type, payload: fields(payload) };
        case 'wallet-list':
            return { type, tabId: typeof tabId === 'number' ? tabId : null };
        case 'decision':
            return typeof id === 'string' && id ? { type, id, decision: decision === 'continue' ? 'continue' : 'reject' } : null;
        case 'revoke':
            return typeof origin === 'string' && typeof address === 'string' ? { type, origin, address } : null;
        default:
            return null;
    }
}

/** Sends `message` to the worker, from one of the extension's own pages, and its answer. */
export function send<T extends MessageType>(message: Extract<Message, { type: T }>): Promise<Replies[T]> {
    return chrome.runtime.sendMessage(message) as Promise<Replies[T]>;
}

/**
 * Whether the worker takes a message of `type` from `sender`: anything from
 * the extension's own pages (`root`, its URL with the trailing slash), and
 * from a content script only what a page may ask. So a page can never
 * decide, rate, clear, or read the settings' status, however it words it.
 */
export function accepts(
    type: unknown,
    sender: { id?: string | undefined; url?: string | undefined },
    self: { id: string; root: string },
): boolean {
    if (sender.id !== self.id) return false;
    if ((sender.url ?? '').startsWith(self.root)) return true;
    return (PAGE_REQUESTS as readonly unknown[]).includes(type);
}
