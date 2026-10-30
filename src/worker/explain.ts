// What a page asked, explained: each transaction with what the worker read
// itself (its lookup tables, a simulation, the accounts the explanation
// names, names for unlisted tokens) sent to the SignLens API, your contacts
// with stand-ins for their names (contacts.ts), and the answer, the names
// put back, kept as a row for the window and the popup; a message to sign,
// shown as it is. Needs `fetch` and nothing of the browser's, so it runs
// in Node under test as it does in the worker.

import {
    type ExplainPayload,
    MAX_MESSAGE_BASE64,
    MAX_MESSAGE_BYTES,
    MAX_TRANSACTION_BASE64,
    MAX_TRANSACTION_BYTES,
    MAX_TRANSACTIONS,
    type MessagePayload,
} from '../shared/messages.ts';
import { type Entry, failure, type Row } from '../shared/model.ts';
import type { Settings } from '../shared/settings.ts';
import { printable, withoutControls } from '../shared/text.ts';
import { type AccountData, type Contact, type EngineAnswer, type EngineRequest, isError, type TokenHint } from '../shared/types.ts';
import { verdictOf } from '../shared/verdict.ts';
import { withAccounts } from './accounts.ts';
import { explainRemotely, LIMITED } from './api.ts';
import { eachString, standIns } from './contacts.ts';
import { tokenHints, unknownMints } from './hints.ts';
import { readerLocales } from './locale.ts';
import { type SimulationResult, simulate } from './simulation.ts';
import { fromBase64, isAddress, type LoadedAddresses } from './solana.ts';
import { resolveTables } from './tables.ts';

/** Where a request came from, for the capture. */
interface Meta {
    origin: string;
    method: string;
    accounts: string[];
}

/** A transaction as `signlens census` and `signlens explain --read-accounts` read it: comment lines, then the bytes. */
function captureOf(transaction: string, meta: Meta, loaded?: LoadedAddresses, read: AccountData[] = []): string {
    const lines = [
        '# Captured by the SignLens extension before signing.',
        `# origin: ${meta.origin}`,
        `# method: ${meta.method}`,
        `# captured: ${new Date().toISOString()}`,
        ...meta.accounts.map((account) => `# signer: ${account}`),
        ...(loaded ? [`# loaded-writable: ${loaded.writable.join(' ')}`, `# loaded-readonly: ${loaded.readonly.join(' ')}`] : []),
        ...read.map((account) => `# account: ${account.address} ${account.owner} ${account.slot} ${account.data}`),
    ];
    for (let i = 0; i < transaction.length; i += 76) lines.push(transaction.slice(i, i + 76));
    return `${lines.join('\n')}\n`;
}

/** How many bytes `base64` (valid, padded or not) decodes to. */
function decodedLength(base64: string): number {
    return Math.floor((base64.replace(/=+$/, '').length * 3) / 4);
}

/** The transactions of a request, or why it is refused before anything is asked of anyone. */
function transactionsOf(payload: ExplainPayload): string[] | string {
    const transactions = payload.transactions;
    if (Array.isArray(transactions) && transactions.length > MAX_TRANSACTIONS) {
        return `${transactions.length} transactions in one request; SignLens explains at most ${MAX_TRANSACTIONS}`;
    }
    if (
        !Array.isArray(transactions) ||
        transactions.length === 0 ||
        transactions.length > MAX_TRANSACTIONS ||
        !transactions.every((t): t is string => typeof t === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(t))
    ) {
        return 'transactions must be a list of base64 strings';
    }
    if (transactions.some((t) => t.length > MAX_TRANSACTION_BASE64 || decodedLength(t) > MAX_TRANSACTION_BYTES)) {
        return `a transaction is longer than ${MAX_TRANSACTION_BYTES} bytes`;
    }
    return transactions;
}

/**
 * Explains the transactions of an `explain` request through the API, one
 * row each, with `ownKeys` as the addresses the explanation calls "you":
 * the caller's to choose, never the page's (requests.ts). Once `stop`
 * aborts, the page went or stopped waiting: the calls under way stop, and
 * nothing more is asked, since no one is left to show it to.
 */
export async function explainTransactions(
    payload: ExplainPayload,
    config: Settings,
    contacts: Contact[],
    ownKeys: string[],
    stop?: AbortSignal,
): Promise<Entry> {
    const transactions = transactionsOf(payload);
    if (typeof transactions === 'string') return failure(transactions);
    const accounts = ownKeys.filter(isAddress).slice(0, 16);
    const meta: Meta = {
        origin: payload.origin || 'unknown',
        method: printable(payload.method, 60) || 'unknown',
        accounts,
    };
    const chains = Array.isArray(payload.chains) ? payload.chains : [];
    // One tag for the request: each call of it, for each transaction, has the same stand-ins.
    const book = standIns(contacts);
    const results: Row[] = [];
    // The transaction the API first refused for its limit: it would refuse the ones after it too, so they are not asked for.
    let limitedAt: number | null = null;
    for (const [i, transaction] of transactions.entries()) {
        if (stop?.aborted) return failure(`not explained: ${String(stop.reason)}`);
        if (limitedAt !== null) {
            results.push({
                kind: 'failed',
                scope: 'transaction',
                error: `not explained: the SignLens API took no more explanations for now, from transaction ${limitedAt} of ${transactions.length} on; try again in a minute`,
                capture: captureOf(transaction, meta),
            });
            continue;
        }
        const bytes = fromBase64(transaction);
        // The chain is the page's word, so it switches nothing off: a page
        // that called a mainnet drain "devnet" would otherwise keep the
        // simulation from ever seeing it. The transaction is read and
        // simulated on the RPC in the settings like any other, and the
        // window says which chain the page named when it is not mainnet.
        const chain = chains[i];
        const claimed = typeof chain === 'string' && chain !== 'solana:mainnet' ? withoutControls(chain).slice(0, 40) : null;
        const { loaded, note } = await resolveTables(bytes, config.rpcUrl, stop);
        let simulation: SimulationResult = null;
        let simulationNote: string | null = null;
        if (config.simulate) {
            simulation = await simulate(transaction, bytes, loaded, config.rpcUrl, stop);
            if (!simulation) simulationNote = 'not run (transaction not parsed)';
            else if (simulation.unavailable) {
                simulationNote = `not run (${simulation.unavailable})`;
                simulation = null;
            } else simulationNote = simulation.failure ? 'failed' : `${simulation.changes.length} balance change(s), unverified`;
        }
        const request: EngineRequest = {
            own_keys: accounts,
            ...(loaded ? { loaded_writable: loaded.writable, loaded_readonly: loaded.readonly } : {}),
            contacts: book.sent,
            ...(simulation ? { simulation: { failure: simulation.failure, units: simulation.units, changes: simulation.changes } } : {}),
            render: true,
            locale: readerLocales(),
        };
        let document: EngineAnswer = await explainRemotely(config.apiUrl, bytes, request, stop);
        if (isError(document) && document.error.code === LIMITED) limitedAt = i + 1;
        let read: AccountData[] = [];
        if (!isError(document) && config.lookupAccounts) {
            ({ document, accounts: read } = await withAccounts(config.apiUrl, config.rpcUrl, bytes, request, document, stop));
        }
        let hints: TokenHint[] = [];
        if (!isError(document) && config.lookupTokens) {
            const mints = unknownMints(document);
            if (mints.length > 0) hints = await tokenHints(mints, config, stop);
            if (hints.length > 0) {
                // The names are a nicety: if asking again fails, the explanation before stands without them.
                const asked = read.length > 0 ? { ...request, accounts: read } : request;
                const named = await explainRemotely(config.apiUrl, bytes, { ...asked, token_hints: hints }, stop);
                if (isError(named)) hints = [];
                else document = named;
            }
        }
        // A call given up because the page went is not the API's failure.
        if (stop?.aborted) return failure(`not explained: ${String(stop.reason)}`);
        const capture = captureOf(transaction, meta, loaded, read);
        if (isError(document)) {
            results.push({
                kind: 'failed',
                scope: 'transaction',
                error: withoutControls(document.error.message) || 'the SignLens API answered an error without a message',
                ...(note ? { tables: note } : {}),
                ...(claimed ? { chain: claimed } : {}),
                capture,
            });
            continue;
        }
        // The window and the history have the names; a rating reports none.
        const said = eachString(document, book.named);
        results.push({
            kind: 'explained',
            verdict: verdictOf(said),
            text: withoutControls(said.text),
            tables: note,
            ...(claimed ? { chain: claimed } : {}),
            simulation: simulationNote,
            capture,
            hints: hints.map((h) => h.symbol),
            ...(read.length > 0 ? { accounts: read.map((account) => account.address) } : {}),
            summary: said.summary,
            actions: said.actions,
            findings: said.findings,
            effects: said.effects,
            sections: said.sections,
            // For the feedback strip: what to name, what to report and, if the user asks, what to send.
            digest: said.raw?.digest ?? null,
            reportedSummary: book.unnamed(document.summary.text),
            transaction,
            ...(said.locale ? { locale: said.locale } : {}),
        });
    }
    return { rows: results };
}

/** A signed message, shown as it is: SignLens does not explain off-chain messages yet. */
export function showMessage(payload: MessagePayload): Entry {
    if (typeof payload.message !== 'string') return failure('message is required');
    const tooLong = failure(`the message is longer than ${MAX_MESSAGE_BYTES} bytes`);
    // Bounded before it is decoded, then exactly.
    if (payload.message.length > MAX_MESSAGE_BASE64) return tooLong;
    let bytes: Uint8Array;
    try {
        bytes = fromBase64(payload.message);
    } catch {
        return failure('the message is not base64');
    }
    if (bytes.length > MAX_MESSAGE_BYTES) return tooLong;
    let text: string;
    try {
        text = withoutControls(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
        text = `(${bytes.length} bytes, not text) ${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    }
    return { rows: [{ kind: 'message', text }] };
}
