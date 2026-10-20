// What the worker is sent and answers, and who may send what. The content
// script relays a page's requests; the popup and the windows are the
// extension's own pages. A message is read (`readMessage`) before
// anything else looks at it: a page can send anything, so its fields stay
// `unknown` but for the origin the content script states.

import type { ApiStatus } from './api.ts';
import { objectFields } from './json.ts';
import type { Decision, Outcome } from './model.ts';
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

/**
 * What every page request carries: the page's own fields, anything at all
 * (each payload below names the ones read, as unknown), and the origin of
 * the page, which the extension states (`readMessage`), printable and cut.
 */
interface FromPage {
    origin: string;
}

/** A page asking for transactions to be explained. The accounts are the ones the request is signed with, as the page names them. */
export interface ExplainPayload extends FromPage {
    method?: unknown;
    accounts?: unknown;
    transactions?: unknown;
    /** The chain each transaction is for, as the dapp named it (`solana:devnet`), or null. */
    chains?: unknown;
    /** The wallet the page hands the request to on Continue, by the name it registered with. */
    wallet?: unknown;
}

/** A page asking for a message to be signed. */
export interface MessagePayload extends FromPage {
    method?: unknown;
    message?: unknown;
    wallet?: unknown;
}

/** A page connecting in watch mode; `silent` when it may only be told what was allowed before, without asking. */
export interface ConnectPayload extends FromPage {
    silent?: unknown;
}

/** What a connect in watch mode gets: the watched address once the user allowed the site, or a refusal. */
export type ConnectReply = { approved: true; address: string; publicKey: number[] } | { approved: false; error?: string };

/** The wallets a page has, or the connect that found none to pass to. */
export interface WalletsPayload extends FromPage {
    wallets?: unknown;
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
export interface Reply extends Outcome {
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

/** What each page request carries, by its type: a request a page may make with no payload here does not compile. */
export interface PagePayloads extends Record<Exclude<SignLensPage.Request, 'config'>, FromPage> {
    connect: ConnectPayload;
    explain: ExplainPayload;
    message: MessagePayload;
    wallets: WalletsPayload;
    'connect-failed': WalletsPayload;
}

/** A page's request of each type, with its own payload. */
type PageMessage = { [T in keyof PagePayloads]: { type: T; payload: PagePayloads[T] } }[keyof PagePayloads];

/** One member per type, each with `fields`, so that a message narrows by its type. */
type Each<T extends string, Fields extends object = object> = T extends string ? { type: T } & Fields : never;

/** A message to the worker, by type. */
export type Message =
    | Each<'config' | 'status' | 'seen' | 'clear'>
    | PageMessage
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

/** `value`'s fields if it is an object, else none: what a payload is read from. */
function fields(value: unknown): Readonly<Record<string, unknown>> {
    return objectFields(value) ?? {};
}

/** A message of type `T`, read from the `fields` that arrived; `origin` is the page's, for a page's request. */
type Reader<T extends MessageType> = (fields: Record<string, unknown>, origin: string) => Extract<Message, { type: T }> | null;

/** A page's request, with the origin stated by the extension: whatever else the page sent, as it sent it. */
function pageRequest<T extends keyof PagePayloads>(type: T): Reader<T> {
    // Every field but the origin is unknown, which anything is: TypeScript cannot see it through T.
    return ({ payload }, origin) => ({ type, payload: { ...fields(payload), origin } }) as Extract<Message, { type: T }>;
}

/** How each message is read, by its type: one for every type, or this does not compile. */
const READERS: { [T in MessageType]: Reader<T> } = {
    config: () => ({ type: 'config' }),
    status: () => ({ type: 'status' }),
    seen: () => ({ type: 'seen' }),
    clear: () => ({ type: 'clear' }),
    connect: pageRequest('connect'),
    explain: pageRequest('explain'),
    message: pageRequest('message'),
    wallets: pageRequest('wallets'),
    'connect-failed': pageRequest('connect-failed'),
    feedback: ({ payload }) => ({ type: 'feedback', payload: fields(payload) }),
    'wallet-list': ({ tabId }) => ({ type: 'wallet-list', tabId: typeof tabId === 'number' ? tabId : null }),
    decision: ({ id, decision }) =>
        typeof id === 'string' && id ? { type: 'decision', id, decision: decision === 'continue' ? 'continue' : 'reject' } : null,
    revoke: ({ origin, address }) =>
        typeof origin === 'string' && typeof address === 'string' ? { type: 'revoke', origin, address } : null,
};

/** Every message type the worker takes: the readers' keys, so none is left out. */
export const MESSAGE_TYPES = Object.keys(READERS) as readonly MessageType[];

/**
 * A message to the worker as it arrived, read into one this worker knows,
 * or `null`. A page's request has the origin of the page that `sender`
 * says it came from, where the browser says (Chrome): else the one the
 * content script stamped, from the page's location in its own world.
 */
export function readMessage(value: unknown, sender: { origin?: string | undefined } = {}): Message | null {
    const all = fields(value);
    const type = all.type;
    if (typeof type !== 'string' || !Object.hasOwn(READERS, type)) return null;
    const origin = printable(typeof sender.origin === 'string' ? sender.origin : fields(all.payload).origin, 200);
    return (READERS[type as MessageType] as Reader<MessageType>)(all, origin);
}

/** Sends `message` to the worker, from one of the extension's own pages, and its answer. */
export function send<T extends MessageType>(message: Extract<Message, { type: T }>): Promise<Replies[T]> {
    return chrome.runtime.sendMessage(message) as Promise<Replies[T]>;
}

/**
 * Whether the worker takes a message of `type`, one it has read, from
 * `sender`: anything from the extension's own pages (`root`, its URL with
 * the trailing slash), and from a content script only what a page may
 * ask. So a page can never decide, rate, clear, or read the settings'
 * status, however it words it; a type the worker does not know never gets
 * here (`readMessage`).
 */
export function accepts(
    type: MessageType,
    sender: { id?: string | undefined; url?: string | undefined },
    self: { id: string; root: string },
): boolean {
    if (sender.id !== self.id) return false;
    if ((sender.url ?? '').startsWith(self.root)) return true;
    return (PAGE_REQUESTS as readonly MessageType[]).includes(type);
}
