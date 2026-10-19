// What the worker is sent and answers, and who may send what. The content
// script relays a page's requests; the popup and the window are the
// extension's own pages. Payloads are typed as what arrives (`unknown`
// where the page chose it), since a page can send anything.

/** How many transactions one request may hold. */
export const MAX_TRANSACTIONS = 32;
/** The largest transaction taken: a v1 transaction's limit, past the 1232 bytes of a legacy or v0 one. */
export const MAX_TRANSACTION_BYTES = 4096;
/** The same, as base64: a quick bound only, since this many characters can hold two bytes more. */
export const MAX_TRANSACTION_BASE64 = Math.ceil(MAX_TRANSACTION_BYTES / 3) * 4;
/** The longest message to sign taken: far past any sign-in or off-chain message. */
export const MAX_MESSAGE_BYTES = 65_536;

export interface Message {
    type?: string;
    payload?: unknown;
    id?: string;
    decision?: string;
    tabId?: number;
}

/** A page asking for transactions to be explained. The accounts are the ones the wallet granted, as the page's wallet reports them. */
export interface ExplainPayload {
    origin?: string;
    method?: string;
    accounts?: unknown;
    transactions?: unknown;
    /** The chain each transaction is for, as the dapp named it (`solana:devnet`), or null. */
    chains?: unknown;
}

/** A page asking for a message to be signed. */
export interface MessagePayload {
    origin?: string;
    method?: string;
    message?: unknown;
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
    message?: string;
}

/** A rating from the window's feedback strip. */
export interface FeedbackPayload {
    rating?: unknown;
    comment?: unknown;
    /** One per explained transaction: its digest, and its bytes when the user asked for them to be sent. */
    records?: unknown;
}

/**
 * What the page's wallet gets back: the error if there was one, whether
 * the user was asked (`gate`; when not, the request goes on as explained),
 * and the user's decision when they were. Never the
 * explanation nor even its verdict: both depend on the user's address book
 * (a transfer to a lookalike of a contact is a warning), and the page is
 * not to learn who the user knows.
 */
export interface Reply {
    error?: string;
    gate: boolean;
    decision?: 'continue' | 'reject';
}

/** What the content script relays for a page; everything else comes from the extension's own pages only. */
const FROM_PAGES: ReadonlySet<string> = new Set(['ping', 'config', 'connect', 'explain', 'message', 'wallets', 'connect-failed']);

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
    return typeof type === 'string' && FROM_PAGES.has(type);
}
