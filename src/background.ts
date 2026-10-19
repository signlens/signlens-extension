// The extension's background worker: explains what a dapp asked by sending
// the engine's request to the SignLens API (beta), with the lookup tables
// read and the transaction simulated over the user's own RPC first; shows
// the explanation and waits for the user's decision when the gate is on;
// keeps the latest answers for the popup. A page's own rules (CSP, mixed
// content) do not bind it.

import { apiStatus, explainRemotely, rowVerdict, sendFeedback } from './api.ts';
import type { HistoryEntry, Row } from './render.ts';
import { pageConfig, parseContacts, type Settings, settings } from './settings.ts';
import {
    fetchLookupTables,
    fromBase64,
    isAddress,
    type LoadedAddresses,
    loadedAddresses,
    messageAccounts,
    multipleAccounts,
    refusal,
    TOKEN_PROGRAMS,
    tableLookups,
    tokenBalance,
} from './solana.ts';
import {
    type Contact,
    type EngineAnswer,
    type EngineRequest,
    type Explanation,
    isError,
    type Rating,
    type Simulation,
    type TokenHint,
} from './types.ts';

const HISTORY_LENGTH = 20;
const MAX_TRANSACTIONS = 32;
const WINDOW = { width: 520, height: 680 };

type Verdict = 'ok' | 'warning' | 'blocked' | 'error' | 'message';

const BADGE: Record<Verdict, { text: string; color: string }> = {
    ok: { text: 'OK', color: '#1a7f4b' },
    warning: { text: 'WARN', color: '#a15c00' },
    blocked: { text: 'BLOCK', color: '#b3261e' },
    error: { text: '?', color: '#5b6475' },
    message: { text: 'MSG', color: '#5b6475' },
};

/** What a page asks for: the transactions or the message, and where from. The accounts are the ones the wallet granted, as the page's wallet reports them. */
interface ExplainPayload {
    origin?: string;
    method?: string;
    accounts?: unknown;
    transactions?: unknown;
}

interface MessagePayload {
    origin?: string;
    method?: string;
    message?: string;
}

/** An answer: rows per transaction, or one text, or one failure. */
interface Answer {
    results?: Row[];
    text?: string;
    error?: string;
}

/**
 * What the page's wallet gets back: the verdict words, the error if there
 * was one, whether the window is on, and the user's decision when it was
 * asked. Never the explanation itself: its text names the user's contacts
 * and the page is not to learn them.
 */
interface Reply {
    verdicts: (string | null)[];
    error?: string;
    gate: boolean;
    decision?: 'continue' | 'reject';
}

let saving: Promise<void> = Promise.resolve();

/** Keeps the latest answers for the popup, newest first, and counts the ones it has not shown yet. */
function remember(entry: HistoryEntry): Promise<void> {
    saving = saving
        .then(async () => {
            const { history = [], unseen = 0 } = (await chrome.storage.session.get(['history', 'unseen'])) as {
                history?: HistoryEntry[];
                unseen?: number;
            };
            await chrome.storage.session.set({ history: [entry, ...history].slice(0, HISTORY_LENGTH), unseen: unseen + 1 });
        })
        .catch(() => {});
    return saving;
}

const VERDICT_ORDER: Verdict[] = ['ok', 'message', 'warning', 'blocked', 'error'];

/** The worse of two verdicts. */
function worse(a: Verdict, b: Verdict): Verdict {
    return VERDICT_ORDER.indexOf(b) > VERDICT_ORDER.indexOf(a) ? b : a;
}

/** The worst verdict among an answer's rows, for the badge. */
function worstVerdict(answer: Answer): Verdict {
    if (answer.error) return 'error';
    if (!answer.results) return 'message';
    return answer.results.map((row): Verdict => (row.error ? 'error' : (row.verdict ?? 'error'))).reduce(worse, 'ok');
}

/** The badge shows the worst verdict among the answers the popup has not shown yet. */
async function showBadge(verdict: Verdict): Promise<void> {
    const { unseenWorst = null } = (await chrome.storage.session.get('unseenWorst').catch(() => ({}))) as { unseenWorst?: Verdict | null };
    const shown = unseenWorst ? worse(unseenWorst, verdict) : verdict;
    await chrome.storage.session.set({ unseenWorst: shown }).catch(() => {});
    const badge = BADGE[shown];
    try {
        await chrome.action.setBadgeBackgroundColor({ color: badge.color });
        await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
        await chrome.action.setBadgeText({ text: badge.text });
    } catch {
        // A badge is a nicety.
    }
}

/** `text` without control characters other than newline and tab. */
function withoutControls(text: unknown): string {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is stripped
    return String(text ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '?');
}

function describe(error: unknown): string {
    return withoutControls(error instanceof Error ? error.message : String(error));
}

// ---- Lookup tables ----

/** Lookup tables read in this worker's life, by address, with when; a table can change, so not for long. */
const tableCache = new Map<string, { at: number; data: Uint8Array }>();
const TABLE_CACHE_MS = 5 * 60_000;

/** The accounts of `addresses` that are lookup tables, from the cache or the RPC. */
async function lookupTables(rpc: string, addresses: string[]): Promise<Map<string, Uint8Array>> {
    const now = Date.now();
    const tables = new Map<string, Uint8Array>();
    const missing: string[] = [];
    for (const address of addresses) {
        const cached = tableCache.get(address);
        if (cached && now - cached.at < TABLE_CACHE_MS) tables.set(address, cached.data);
        else missing.push(address);
    }
    if (missing.length > 0) {
        const fetched = await fetchLookupTables(rpc, missing);
        for (const [address, data] of fetched) {
            tableCache.set(address, { at: now, data });
            tables.set(address, data);
        }
    }
    return tables;
}

/** What the transaction's lookup tables load, read over the RPC, or why that is unknown. */
async function resolveTables(bytes: Uint8Array, rpc: string): Promise<{ loaded?: LoadedAddresses; note: string }> {
    let lookups: ReturnType<typeof tableLookups>;
    try {
        lookups = tableLookups(bytes);
    } catch (error) {
        return { note: `not parsed (${describe(error)})` };
    }
    if (lookups.length === 0) return { note: 'none' };
    const count = `${lookups.length} lookup table${lookups.length === 1 ? '' : 's'}`;
    try {
        const tables = await lookupTables(
            rpc,
            lookups.map((l) => l.table),
        );
        return { loaded: loadedAddresses(lookups, tables), note: `${count} read over RPC, unverified` };
    } catch (error) {
        return { note: `${count} not resolved (${describe(error)})` };
    }
}

interface Meta {
    origin: string;
    method: string;
    accounts: string[];
}

/** A transaction as `signlens census` and `signlens explain` read it: comment lines, then the bytes. */
function captureOf(transaction: string, meta: Meta, loaded?: LoadedAddresses): string {
    const lines = [
        '# Captured by the SignLens extension before signing.',
        `# origin: ${meta.origin}`,
        `# method: ${meta.method}`,
        `# captured: ${new Date().toISOString()}`,
        ...meta.accounts.map((account) => `# signer: ${account}`),
        ...(loaded ? [`# loaded-writable: ${loaded.writable.join(' ')}`, `# loaded-readonly: ${loaded.readonly.join(' ')}`] : []),
    ];
    for (let i = 0; i < transaction.length; i += 76) lines.push(transaction.slice(i, i + 76));
    return `${lines.join('\n')}\n`;
}

// ---- Unlisted tokens ----

/** Where a mint account keeps its decimals. */
const MINT_DECIMALS_OFFSET = 44;
/** Hints learned in this worker's life, by mint; `null` for a mint nothing named. */
const hintCache = new Map<string, TokenHint | null>();

/** The mints of tokens the explanation could not name. */
function unknownMints(document: Explanation): string[] {
    const mints = new Set<string>();
    const amounts: { asset?: { id: string; decimals: number | null; symbol: string | null } }[] = [];
    for (const effect of document.effects) {
        const value = effect.value as { amount?: { asset?: { id: string; decimals: number | null; symbol: string | null } } } | undefined;
        if (value?.amount) amounts.push(value.amount);
    }
    for (const section of document.sections) {
        for (const field of section.fields) {
            if (field.value.type === 'Amount') amounts.push(field.value.value as (typeof amounts)[number]);
        }
    }
    for (const amount of amounts) {
        const asset = amount.asset;
        if (asset && asset.decimals === null && asset.symbol === null && isAddress(asset.id)) mints.add(asset.id);
    }
    return [...mints];
}

/** Decimals from the mint accounts over the RPC: on-chain state, but the host's claim here. */
async function mintDecimals(rpc: string, mints: string[]): Promise<Map<string, number>> {
    const accounts = await multipleAccounts(rpc, mints);
    const decimals = new Map<string, number>();
    accounts.forEach((account, i) => {
        const mint = mints[i];
        if (!account || !TOKEN_PROGRAMS.has(account.owner) || mint === undefined) return;
        const data = fromBase64(account.data[0]);
        const d = data[MINT_DECIMALS_OFFSET];
        if (data.length > MINT_DECIMALS_OFFSET && d !== undefined) decimals.set(mint, d);
    });
    return decimals;
}

/** Symbols from the token list: an array of `{id, symbol, decimals}`. */
async function tokenSymbols(tokenApiUrl: string, mints: string[]): Promise<Map<string, { symbol: string; decimals: unknown }>> {
    const url = new URL(tokenApiUrl);
    url.searchParams.set('query', mints.join(','));
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`token list answered HTTP ${response.status}`);
    const list: unknown = await response.json();
    const symbols = new Map<string, { symbol: string; decimals: unknown }>();
    for (const token of Array.isArray(list) ? (list as { id?: unknown; symbol?: unknown; decimals?: unknown }[]) : []) {
        if (typeof token?.id !== 'string' || !mints.includes(token.id) || typeof token.symbol !== 'string') continue;
        const symbol = token.symbol
            .replace(/[^\x20-\x7e]/g, '')
            .trim()
            .slice(0, 16);
        if (symbol) symbols.set(token.id, { symbol, decimals: token.decimals });
    }
    return symbols;
}

/** Hints for `mints`, as far as the RPC and the token list name them. Failures leave tokens unnamed. */
async function tokenHints(mints: string[], config: Settings): Promise<TokenHint[]> {
    const wanted = mints.filter((mint) => !hintCache.has(mint));
    if (wanted.length > 0) {
        const [decimals, symbols] = await Promise.all([
            mintDecimals(config.rpcUrl, wanted).catch(() => new Map<string, number>()),
            tokenSymbols(config.tokenApiUrl, wanted).catch(() => new Map<string, { symbol: string; decimals: unknown }>()),
        ]);
        for (const mint of wanted) {
            const named = symbols.get(mint);
            const d = decimals.get(mint) ?? named?.decimals;
            hintCache.set(
                mint,
                named && typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 20
                    ? { mint, symbol: named.symbol, decimals: d }
                    : null,
            );
        }
    }
    return mints.map((mint) => hintCache.get(mint)).filter((hint): hint is TokenHint => hint !== null && hint !== undefined);
}

// ---- Simulation ----

interface SimulationOutcome {
    err: unknown;
    logs?: unknown;
    unitsConsumed?: unknown;
    accounts?: unknown;
}

async function rpcCall<T>(rpc: string, method: string, params: unknown[]): Promise<T> {
    const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw await refusal(rpc, response);
    const body = (await response.json()) as { error?: { message: string }; result: T };
    if (body.error) throw new Error(`RPC error: ${body.error.message}`);
    return body.result;
}

/** Why a simulation failed: the RPC's error, and the program's last word on it when it logged one. */
function failureText(outcome: SimulationOutcome): string {
    const error = withoutControls(JSON.stringify(outcome.err));
    const logs = Array.isArray(outcome.logs) ? (outcome.logs as unknown[]) : [];
    const said = logs
        .filter((line): line is string => typeof line === 'string' && /^Program log: /.test(line))
        .map((line) => withoutControls(line.replace(/^Program log: /, '')).trim())
        .filter((line) => line && !/^Instruction: /.test(line))
        .at(-1);
    return `${error}${said ? `; the program said: ${said}` : ''}`.slice(0, 300);
}

/** How many accounts a node reports after a simulation, at most. */
const SIMULATED_ACCOUNTS = 18;

type SimulationResult = (Simulation & { unavailable?: string }) | null;

/**
 * Simulates `transaction` (base64) over the RPC and returns what the engine
 * takes: whether it failed, the units, and the balance changes of the
 * accounts the transaction may write, or `null` when the transaction could
 * not be parsed, or `unavailable` set when the RPC could not be asked. The
 * RPC sees the whole transaction.
 */
async function simulate(
    transaction: string,
    bytes: Uint8Array,
    loaded: LoadedAddresses | undefined,
    rpc: string,
): Promise<SimulationResult> {
    let accounts: ReturnType<typeof messageAccounts>;
    try {
        accounts = messageAccounts(bytes);
    } catch {
        return null;
    }
    const signers = new Set(accounts.filter((a) => a.signer).map((a) => a.address));
    const addresses = [
        ...new Set(
            accounts
                .filter((a) => a.writable)
                .map((a) => a.address)
                .concat(loaded?.writable ?? []),
        ),
    ].slice(0, 100);
    // The blockhash is kept as signed: a durable-nonce transaction checks
    // it against its nonce, and replacing it would fail that check. Only a
    // blockhash the chain no longer knows is replaced, on a second try.
    const run = (watched: string[], replaceRecentBlockhash: boolean) =>
        rpcCall<{ value: SimulationOutcome }>(rpc, 'simulateTransaction', [
            transaction,
            {
                encoding: 'base64',
                sigVerify: false,
                replaceRecentBlockhash,
                commitment: 'confirmed',
                accounts: { encoding: 'base64', addresses: watched },
            },
        ]);
    try {
        const before = await multipleAccounts(rpc, addresses);
        const pre = new Map(addresses.map((address, i) => [address, tokenBalance(before[i])]));
        // A node reports at most 18 accounts, so the ones that matter most
        // come first: the signers, then their token accounts, then the rest
        // in the transaction's order.
        const rank = (address: string) => (signers.has(address) ? 0 : signers.has(pre.get(address)?.token?.owner ?? '') ? 1 : 2);
        const watched = addresses
            .map((address, i) => ({ address, i, rank: rank(address) }))
            .sort((x, y) => x.rank - y.rank || x.i - y.i)
            .map((entry) => entry.address)
            .slice(0, SIMULATED_ACCOUNTS);
        const first = await run(watched, false);
        const result = first.value.err === 'BlockhashNotFound' ? await run(watched, true) : first;
        const outcome = result.value;
        const simulation: Simulation = {
            failure: outcome.err ? failureText(outcome) : null,
            units: typeof outcome.unitsConsumed === 'number' && Number.isInteger(outcome.unitsConsumed) ? outcome.unitsConsumed : null,
            changes: [],
        };
        if (!outcome.err && Array.isArray(outcome.accounts)) {
            const after = outcome.accounts as Parameters<typeof tokenBalance>[0][];
            watched.forEach((address, i) => {
                const was = pre.get(address);
                const post = tokenBalance(after[i]);
                const lamports = (post?.lamports ?? 0n) - (was?.lamports ?? 0n);
                const token = post?.token ?? was?.token;
                if (token) {
                    const amount = (post?.token?.amount ?? 0n) - (was?.token?.amount ?? 0n);
                    if (amount !== 0n)
                        simulation.changes.push({ account: address, owner: token.owner, mint: token.mint, delta: amount.toString() });
                }
                if (lamports !== 0n) {
                    // A token account's rent moves too, between it and its owner's wallet.
                    simulation.changes.push({ account: address, ...(token ? { owner: token.owner } : {}), delta: lamports.toString() });
                }
            });
        }
        return simulation;
    } catch (error) {
        return { failure: null, units: null, changes: [], unavailable: describe(error) };
    }
}

// ---- Explaining ----

/** Explains the transactions of an `explain` request through the API. */
async function explainThroughApi(payload: ExplainPayload, config: Settings, contacts: Contact[]): Promise<Answer> {
    const transactions = payload.transactions;
    if (
        !Array.isArray(transactions) ||
        transactions.length === 0 ||
        transactions.length > MAX_TRANSACTIONS ||
        !transactions.every((t): t is string => typeof t === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(t))
    ) {
        return { error: 'transactions must be a list of base64 strings' };
    }
    const accounts = (Array.isArray(payload.accounts) ? payload.accounts : []).filter((a): a is string => isAddress(a)).slice(0, 16);
    const meta: Meta = {
        origin:
            withoutControls(payload.origin)
                .replace(/[^\x20-\x7e]/g, '?')
                .slice(0, 200) || 'unknown',
        method:
            withoutControls(payload.method)
                .replace(/[^\x20-\x7e]/g, '?')
                .slice(0, 60) || 'unknown',
        accounts,
    };
    const results: Row[] = [];
    for (const transaction of transactions) {
        const bytes = fromBase64(transaction);
        const { loaded, note } = await resolveTables(bytes, config.rpcUrl);
        const capture = captureOf(transaction, meta, loaded);
        let simulation: SimulationResult = null;
        let simulationNote = 'off';
        if (config.simulate) {
            simulation = await simulate(transaction, bytes, loaded, config.rpcUrl);
            if (!simulation) simulationNote = 'not run (transaction not parsed)';
            else if (simulation.unavailable) {
                simulationNote = `not run (${simulation.unavailable})`;
                simulation = null;
            } else simulationNote = simulation.failure ? 'failed' : `${simulation.changes.length} balance change(s), unverified`;
        }
        const request: EngineRequest = {
            ownKeys: accounts,
            ...(loaded ? { loadedWritable: loaded.writable, loadedReadonly: loaded.readonly } : {}),
            contacts,
            ...(simulation ? { simulation: { failure: simulation.failure, units: simulation.units, changes: simulation.changes } } : {}),
            render: true,
        };
        let document: EngineAnswer = await explainRemotely(config.apiUrl, bytes, request);
        let hints: TokenHint[] = [];
        if (!isError(document) && config.lookupTokens) {
            const mints = unknownMints(document);
            if (mints.length > 0) hints = await tokenHints(mints, config);
            if (hints.length > 0) document = await explainRemotely(config.apiUrl, bytes, { ...request, tokenHints: hints });
        }
        results.push(
            isError(document)
                ? { verdict: null, text: '', error: document.error.message, tables: note, capture }
                : {
                      verdict: rowVerdict(document),
                      text: withoutControls(document.text),
                      error: null,
                      tables: note,
                      simulation: simulationNote,
                      capture,
                      hints: hints.map((h) => h.symbol),
                      summary: document.summary,
                      findings: document.findings.map((f) => ({
                          severity: f.severity,
                          code: f.code,
                          message: f.message,
                          instruction: f.instruction ?? null,
                      })),
                      effects: document.effects,
                      sections: document.sections,
                      // For the feedback strip: what to name and, if the user asks, what to send.
                      digest: document.raw?.digest ?? null,
                      transaction,
                  },
        );
    }
    return { results };
}

/** A signed message, shown as it is: SignLens does not explain off-chain messages yet. */
function showMessage(payload: MessagePayload): Answer {
    let body: string;
    if (typeof payload.message === 'string') {
        let bytes: Uint8Array;
        try {
            bytes = fromBase64(payload.message);
        } catch {
            return { error: 'the message is not base64' };
        }
        try {
            body = withoutControls(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        } catch {
            body = `(${bytes.length} bytes, not text) ${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
        }
    } else {
        return { error: 'message is required' };
    }
    return { text: body };
}

// ---- The gate ----

/** Decisions awaited, by request id. */
const decisions = new Map<string, (decision: 'continue' | 'reject') => void>();
let nextRequest = 0;

/**
 * Shows `entry` in its own window and resolves with the user's decision:
 * 'continue', or 'reject' when the user rejects or closes the window.
 */
async function askUser(entry: HistoryEntry): Promise<{ decision: 'continue' | 'reject'; note?: string }> {
    nextRequest += 1;
    const id = `${Date.now()}-${nextRequest}`;
    await chrome.storage.session.set({ [`pending:${id}`]: entry });
    const decided = new Promise<'continue' | 'reject'>((resolve) => decisions.set(id, resolve));
    let windowId: number | undefined;
    try {
        const created = await chrome.windows.create({
            url: chrome.runtime.getURL(`confirm.html?id=${encodeURIComponent(id)}`),
            type: 'popup',
            focused: true,
            ...WINDOW,
        });
        windowId = created?.id;
    } catch (error) {
        decisions.delete(id);
        await chrome.storage.session.remove(`pending:${id}`);
        return { decision: 'reject', note: `the SignLens window could not open (${describe(error)})` };
    }
    const closed = (removed: number) => {
        if (removed === windowId) decisions.get(id)?.('reject');
    };
    chrome.windows.onRemoved.addListener(closed);
    const decision = await decided;
    chrome.windows.onRemoved.removeListener(closed);
    decisions.delete(id);
    await chrome.storage.session.remove(`pending:${id}`);
    if (windowId !== undefined) chrome.windows.remove(windowId).catch(() => {});
    return { decision };
}

/**
 * Answers a page's request. Nothing in here fails open: an error anywhere
 * becomes an answer with the error, which goes through the window like any
 * other when the gate is on, and the reply always says whether the gate is
 * on so that the page's wallet can tell "no decision asked" from "no
 * decision given".
 */
async function answer(type: 'explain' | 'message', payload: ExplainPayload & MessagePayload): Promise<Reply> {
    let config: Settings;
    try {
        config = await settings();
    } catch (error) {
        // Without settings nothing can be shown or trusted: refused.
        return { verdicts: [], error: `SignLens could not read its settings: ${describe(error)}`, gate: true, decision: 'reject' };
    }
    let result: Answer;
    try {
        result =
            type === 'message' ? showMessage(payload) : await explainThroughApi(payload, config, parseContacts(config.contacts).contacts);
    } catch (error) {
        result = { error: `SignLens could not explain it: ${describe(error)}` };
    }
    await showBadge(worstVerdict(result)).catch(() => {});
    const entry: HistoryEntry = {
        time: Date.now(),
        ...(payload.origin !== undefined ? { origin: payload.origin } : {}),
        ...(payload.method !== undefined ? { method: payload.method } : {}),
        mode: config.mode,
        upstream: config.upstream,
        ...result,
    };
    let decision: 'continue' | 'reject' | undefined;
    if (config.gate) {
        try {
            ({ decision } = await askUser(entry));
        } catch {
            decision = 'reject';
        }
        // Only a request that could go on has a decision to honour.
        if (config.mode !== 'passthrough') decision = undefined;
    }
    await remember({ ...entry, ...(decision ? { decision } : {}) });
    return {
        verdicts: (result.results ?? []).map((row) => row.verdict ?? null),
        ...(result.error !== undefined ? { error: result.error } : {}),
        gate: config.gate,
        ...(decision ? { decision } : {}),
    };
}

// ---- Feedback ----

interface FeedbackPayload {
    digests?: string[];
    rating?: Rating;
    comment?: string;
    transactions?: string[];
}

/** One record per transaction of the request; the bytes only when the user asked. */
async function feedback(payload: FeedbackPayload): Promise<boolean> {
    const { digests = [], rating, comment = '', transactions = [] } = payload;
    if (!rating) return false;
    const config = await settings();
    const sent = await Promise.all(
        digests.map((digest, i) =>
            sendFeedback(config.apiUrl, {
                messageHash: digest,
                rating,
                comment: withoutControls(comment),
                transaction: transactions[i] ?? null,
            }),
        ),
    );
    return sent.every(Boolean);
}

// ---- The page's wallets ----

interface WalletsPayload {
    wallets?: unknown;
    origin?: string;
    message?: string;
}

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
    const { history = [] } = (await chrome.storage.session.get('history')) as { history?: HistoryEntry[] };
    const latest = history[0];
    if (latest?.method === 'standard:connect' && latest.origin === payload.origin && latest.error?.includes(error)) return;
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

interface Message {
    type?: string;
    payload?: unknown;
    id?: string;
    decision?: string;
    tabId?: number;
}

// A closed tab's wallets go with it.
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove(`wallets:${tabId}`).catch(() => {});
});

// What the content script relays for the page; everything else comes from
// the extension's own pages only.
const FROM_PAGES = new Set(['ping', 'config', 'explain', 'message', 'wallets', 'connect-failed']);

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    const ownPage = (sender.url ?? '').startsWith(chrome.runtime.getURL('/'));
    if (!ownPage && !FROM_PAGES.has(message?.type ?? '')) {
        sendResponse(false);
        return false;
    }
    switch (message?.type) {
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
            // The popup is open: the badge has done its job.
            chrome.action.setBadgeText({ text: '' }).catch(() => {});
            chrome.storage.session.set({ unseen: 0, unseenWorst: null }).catch(() => {});
            sendResponse(true);
            return false;
        case 'clear':
            chrome.storage.session
                .set({ history: [] })
                .then(() => sendResponse(true))
                .catch(() => sendResponse(false));
            return true;
        case 'decision':
            if (message.id) decisions.get(message.id)?.(message.decision === 'continue' ? 'continue' : 'reject');
            sendResponse(true);
            return false;
        case 'feedback':
            feedback((message.payload ?? {}) as FeedbackPayload)
                .then(sendResponse)
                .catch(() => sendResponse(false));
            return true;
        case 'explain':
        case 'message':
            answer(message.type, (message.payload ?? {}) as ExplainPayload & MessagePayload)
                .then(sendResponse)
                .catch((error: unknown) =>
                    sendResponse({
                        verdicts: [],
                        error: `SignLens failed: ${describe(error)}`,
                        gate: true,
                        decision: 'reject',
                    } satisfies Reply),
                );
            return true;
        default:
            return false;
    }
});
