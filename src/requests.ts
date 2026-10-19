// A page's request that may wait on the user, answered: a connect in watch
// mode (sites.ts), or transactions or a message explained (explain.ts),
// shown in the window and decided on when they must be (gate.ts), and
// kept for the popup (history.ts). Apart from the worker's listeners
// (background.ts), so that it runs in Node under test.

import { explainTransactions, showMessage } from './explain.ts';
import * as gate from './gate.ts';
import { remember, showBadge } from './history.ts';
import type { ConnectReply, ExplainPayload, MessagePayload, Reply, WaitingMessage } from './messages.ts';
import { type Entry, failure, type HistoryEntry } from './model.ts';
import { parseContacts, type Settings, settings } from './settings.ts';
import { connectWatch } from './sites.ts';
import { describe, printable } from './text.ts';
import { worstVerdict } from './verdict.ts';

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
    let result: Entry;
    try {
        result =
            type === 'message'
                ? showMessage(payload)
                : await explainTransactions(payload, config, parseContacts(config.contacts).contacts, () => flight.abandoned);
    } catch (error) {
        result = failure(describe(error));
    }
    const worst = worstVerdict(result.rows);
    await showBadge(worst).catch((error: unknown) => console.error('SignLens could not show the badge', error));
    const method = printable(payload.method, 60);
    const entry: HistoryEntry = {
        time: Date.now(),
        ...(payload.origin ? { origin: payload.origin } : {}),
        ...(method ? { method } : {}),
        mode: config.mode,
        upstream: config.upstream,
        // The page's word for its wallet, in plain ASCII: no character that could reorder or disguise the window's text.
        ...(config.mode === 'passthrough' && typeof payload.wallet === 'string' && printable(payload.wallet, 60).trim()
            ? { wallet: printable(payload.wallet, 60).trim() }
            : {}),
        ...result,
    };
    const asked = gate.mustAsk(config.gate, config.mode, worst);
    let outcome: gate.Outcome = { decision: config.mode === 'passthrough' ? 'continue' : 'reject' };
    if (asked) {
        try {
            outcome = await gate.askUser(entry, flight);
        } catch (error) {
            outcome = { decision: 'reject', refused: `the SignLens window failed: ${describe(error)}` };
        }
    }
    // Only a request that could go on, and was asked about, has a decision to show in the history.
    // Kept for the popup; a failure to keep it changes nothing of the answer.
    await remember({ ...entry, ...(asked && config.mode === 'passthrough' ? outcome : {}) }).catch((error: unknown) =>
        console.error('SignLens could not keep the request', error),
    );
    return { ...outcome, ...(result.error !== undefined ? { error: result.error } : {}) };
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
