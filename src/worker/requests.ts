// A page's request that may wait on the user, answered: a connect in watch
// mode (sites.ts), or transactions or a message explained (explain.ts),
// shown in the window and decided on when they must be (gate.ts), and
// kept for the popup (history.ts). Apart from the worker's listeners
// (background.ts), so that it runs in Node under test.

import type { ConnectReply, ExplainPayload, MessagePayload, Reply, WaitingMessage } from '../shared/messages.ts';
import { type Entry, failure, type HistoryEntry, type Outcome, requestError } from '../shared/model.ts';
import { addAddresses, parseAddresses, parseContacts, type Settings, settings, watched } from '../shared/settings.ts';
import { session } from '../shared/store.ts';
import { describe, logged, printable } from '../shared/text.ts';
import { worstVerdict } from '../shared/verdict.ts';
import { explainTransactions, showMessage } from './explain.ts';
import * as gate from './gate.ts';
import { remember, showBadge } from './history.ts';
import { connectWatch } from './sites.ts';
import { isAddress } from './solana.ts';

/** What the history keeps of where a request came from, whatever became of it. */
function about(payload: ExplainPayload & MessagePayload, config: Settings): Omit<HistoryEntry, 'rows'> {
    const method = printable(payload.method, 60);
    return {
        time: Date.now(),
        ...(payload.origin ? { origin: payload.origin } : {}),
        ...(method ? { method } : {}),
        mode: config.mode,
        upstream: config.upstream,
        // The page's word for its wallet, in plain ASCII: no character that could reorder or disguise the window's text.
        ...(config.mode === 'passthrough' && typeof payload.wallet === 'string' && printable(payload.wallet, 60).trim()
            ? { wallet: printable(payload.wallet, 60).trim() }
            : {}),
    };
}

/** The addresses the page names as signing its request: the valid ones, a few at most. */
function named(payload: ExplainPayload): string[] {
    const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
    return [...new Set(accounts.filter((account): account is string => isAddress(account)))].slice(0, 16);
}

/**
 * Who "you" are in the explanation of a request to sign transactions, or
 * the answer to a request refused before anything is explained.
 *
 * A page names the addresses it signs with, but everything the page's
 * world hands SignLens can be the page's own: an impostor wallet under
 * your wallet's name, a replaced built-in. Called "you", an attacker's
 * address turns a drain into "You receive 50 SOL into Your wallet
 * (verified)". So only addresses you put in the settings are "you": in
 * watch mode the watched one, which a page cannot change; in pass-through
 * mode your addresses. When the page names one your settings do not have
 * (or none is there yet), you are asked in a window of your own, before
 * the transaction is sent anywhere; a yes adds it to your addresses. When
 * it names more than one, it is refused: one yes is one address. With
 * asking first off, it is refused too: no window the user did not ask for.
 */
async function yours(
    payload: ExplainPayload & MessagePayload,
    config: Settings,
    flight: gate.InFlight,
): Promise<{ ownKeys: string[] } | { reply: Reply }> {
    const claimed = named(payload);
    const refuse = async (reply: Reply, others: string[], decision: Outcome) => {
        if (gate.withdrawn(flight)) return { reply };
        await showBadge('warning').catch(logged('show the badge'));
        await remember({ ...about(payload, config), rows: [{ kind: 'address', claimed: others }], ...decision }).catch(
            logged('keep the request'),
        );
        return { reply };
    };
    if (config.mode === 'watch') {
        const address = watched(config)?.address;
        const others = claimed.filter((account) => account !== address);
        if (others.length === 0) return { ownKeys: address ? [address] : [] };
        // Watch mode connects as one address only: another can only be the page's doing.
        const refused = 'the page named an address other than the one SignLens watches';
        return refuse({ decision: 'reject', refused }, others, { decision: 'reject', refused });
    }
    const mine = parseAddresses(config.myAddresses).addresses;
    const others = claimed.filter((account) => !mine.includes(account));
    const [other] = others;
    if (other === undefined) return { ownKeys: mine };
    // One yes is one address: a page that puts your own address beside its
    // own would otherwise have both made yours by the same click.
    if (others.length > 1) {
        const refused = 'the page named more than one address that is not yours in SignLens; add yours in the settings, then ask again';
        return refuse({ decision: 'reject', refused }, others, { decision: 'reject', refused });
    }
    // With asking first off, no window opens unless SignLens would refuse: a
    // page is not to summon one by naming a fresh address, where a careless
    // click costs the most. Yours go in the settings first.
    if (!config.askFirst) {
        const refused =
            'the page named an address that is not yours in SignLens, and with “Show the explanation and ask first” off SignLens does not ask; add it in the settings if it is yours';
        return refuse({ decision: 'reject', refused }, others, { decision: 'reject', refused });
    }
    let outcome: Outcome;
    try {
        outcome = await gate.ask('address.html', { origin: payload.origin, address: other, mine }, flight);
    } catch (error) {
        outcome = { decision: 'reject', refused: `the SignLens window failed: ${describe(error)}` };
    }
    if (outcome.decision !== 'continue') {
        return refuse(outcome.refused ? { decision: 'reject', refused: outcome.refused } : { decision: 'reject' }, others, outcome);
    }
    try {
        await addAddresses([other]);
    } catch (error) {
        const refused = `could not keep your address: ${describe(error)}`;
        return refuse({ decision: 'reject', refused }, others, { decision: 'reject', refused });
    }
    return { ownKeys: [...mine, other] };
}

/**
 * Answers a request to sign. Nothing in here fails open: an error anywhere
 * becomes an answer with the error, which goes through the window like any
 * refusal (`gate.mustAsk`), and the reply always carries a decision: the
 * user's, SignLens's refusal with its reason, or 'continue' where the
 * window is not to be asked and nothing stopped it (watch mode passes
 * nothing on).
 */
async function answer(type: 'explain' | 'message', payload: ExplainPayload & MessagePayload, flight: gate.InFlight): Promise<Reply> {
    let config: Settings;
    try {
        config = await settings();
    } catch (error) {
        // Without settings nothing can be shown or trusted: refused.
        return { decision: 'reject', refused: `could not read its settings: ${describe(error)}` };
    }
    let ownKeys: string[] = [];
    if (type === 'explain') {
        const who = await yours(payload, config, flight);
        if ('reply' in who) return who.reply;
        ownKeys = who.ownKeys;
    }
    let result: Entry;
    try {
        result =
            type === 'message'
                ? showMessage(payload)
                : await explainTransactions(payload, config, parseContacts(config.contacts).contacts, ownKeys, flight.signal);
    } catch (error) {
        result = failure(describe(error));
    }
    // A request its page withdrew before anything was shown is not worth keeping or flagging; no one is left to answer.
    if (gate.withdrawn(flight)) return { ...gate.GONE };
    const worst = worstVerdict(result.rows);
    await showBadge(worst).catch(logged('show the badge'));
    const entry: HistoryEntry = { ...about(payload, config), rows: result.rows };
    const asked = gate.mustAsk(config.askFirst, config.mode, worst);
    let outcome: Outcome = { decision: config.mode === 'passthrough' ? 'continue' : 'reject' };
    if (asked) {
        try {
            outcome = await gate.askUser(entry, flight);
        } catch (error) {
            outcome = { decision: 'reject', refused: `the SignLens window failed: ${describe(error)}` };
        }
    }
    if (gate.withdrawn(flight)) return { ...gate.GONE };
    // Kept for the popup with what became of it; a failure to keep it changes nothing of the answer.
    const unasked = !asked && config.mode === 'passthrough' ? { unasked: true as const } : {};
    await remember({ ...entry, ...outcome, ...unasked }).catch(logged('keep the request'));
    const error = requestError(result);
    return { ...outcome, ...(error !== undefined ? { error } : {}) };
}

/** Answers a page's request that may wait on the user: a connect in watch mode, or something to explain and decide on, from the tab `tabId`. */
export async function answerRequest(message: WaitingMessage, tabId: number): Promise<Reply | ConnectReply> {
    if (message.type === 'connect') {
        try {
            return await connectWatch(message.payload, tabId, await settings());
        } catch (error) {
            return { approved: false, error: describe(error) };
        }
    }
    // One request per tab at a time: a page cannot stack up windows, or
    // calls to the RPC and the API, by asking again and again.
    const flight = gate.begin(tabId);
    if (!flight) return { decision: 'reject', refused: gate.BUSY };
    try {
        return await answer(message.type, message.payload, flight);
    } catch (error) {
        return { decision: 'reject', refused: `failed: ${describe(error)}` };
    } finally {
        gate.end(tabId, flight);
    }
}

/**
 * A connect from the page at `origin` that found no wallet to pass to, with
 * the `wallets` the page found: kept for the popup like a failed request,
 * in SignLens's words, the names the page gave quoted and in plain ASCII.
 * One row per site: a page can call connect in a loop, and would push the
 * real requests out. The same failure again changes nothing; another takes
 * the place of the last.
 */
export async function connectFailed(origin: string, wallets: string[]): Promise<void> {
    const config = await settings();
    const quoted = (name: string) => JSON.stringify(printable(name, 60));
    const wanted = config.upstream.trim();
    const found = wallets.slice(0, 32).map(quoted).join(', ') || 'none';
    const error =
        `SignLens could not connect: no wallet${wanted ? ` named ${quoted(wanted)}` : ''} to pass requests to (found: ${found}). ` +
        "Choose a wallet in the extension's settings.";
    // This site's connects that found no wallet: not its consents, which are connects too.
    const here = (entry: HistoryEntry) =>
        entry.method === 'standard:connect' && (entry.origin ?? '') === origin && entry.rows[0]?.kind === 'failed';
    const { history = [] } = await session.get('history');
    if (history.some((entry) => here(entry) && entry.rows[0]?.kind === 'failed' && entry.rows[0].error === error)) return;
    await showBadge('error');
    await remember(
        {
            time: Date.now(),
            ...(origin ? { origin } : {}),
            method: 'standard:connect',
            mode: config.mode,
            upstream: config.upstream,
            rows: [{ kind: 'failed', scope: 'request', error }],
        },
        here,
    );
}
