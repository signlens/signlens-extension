// A rating from the window's feedback strip, sent to the API: one record
// per explained transaction, each with its own digest, the site (in
// Firefox, once the user allowed it: consent.ts) and what the window
// showed of it, and its bytes, with the addresses its lookup tables
// loaded, only when the user asked for them to be sent. Everything the
// window hands over is checked here again before it goes out.

import { isAddress } from '../shared/base58.ts';
import { siteAllowed } from '../shared/consent.ts';
import {
    type FeedbackPayload,
    MAX_COMMENT,
    MAX_LOADED,
    MAX_SEEN_FINDINGS,
    MAX_SEEN_INSTRUCTIONS,
    MAX_SEEN_SUMMARY,
    MAX_TRANSACTION_BASE64,
    MAX_TRANSACTIONS,
} from '../shared/messages.ts';
import { withoutControls } from '../shared/text.ts';
import { type Feedback, type Rating, SEVERITIES, type Seen, VERDICTS } from '../shared/types.ts';
import { sendFeedback } from './api.ts';

const RATINGS: readonly Rating[] = ['clear', 'unclear', 'wrong'];

/** The host of the page's origin, or nothing when it has none worth sending. */
export function hostOf(origin: unknown): string | undefined {
    if (typeof origin !== 'string') return undefined;
    try {
        const host = new URL(origin).host;
        return /^[A-Za-z0-9.:[\]-]{1,253}$/.test(host) ? host : undefined;
    } catch {
        return undefined;
    }
}

/** What the window showed, as the API takes it, or nothing when it is not that. */
function seenOf(value: unknown): Seen | undefined {
    if (typeof value !== 'object' || value === null) return undefined;
    const seen = value as Record<string, unknown>;
    const verdict = VERDICTS.find((v) => v === seen.verdict);
    if (!verdict) return undefined;
    const findings = (Array.isArray(seen.findings) ? seen.findings : [])
        .filter(
            (f): f is { code: string; severity: (typeof SEVERITIES)[number]; instruction?: unknown } =>
                typeof f?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(f.code) && SEVERITIES.some((s) => s === f.severity),
        )
        .slice(0, MAX_SEEN_FINDINGS)
        .map((f) => ({
            code: f.code,
            severity: f.severity,
            instruction: Number.isInteger(f.instruction) && (f.instruction as number) >= 0 ? (f.instruction as number) : null,
        }));
    const instructions = (Array.isArray(seen.instructions) ? seen.instructions : [])
        .filter((i): i is { program: string; title?: unknown } => isAddress(i?.program))
        .slice(0, MAX_SEEN_INSTRUCTIONS)
        .map((i) => ({ program: i.program, title: typeof i.title === 'string' ? withoutControls(i.title).slice(0, 120) : null }));
    return { verdict, summary: withoutControls(seen.summary).slice(0, MAX_SEEN_SUMMARY), findings, instructions };
}

/** A list of addresses, or none when anything in it is not one. */
function addresses(value: unknown): string[] | undefined {
    return Array.isArray(value) && value.every(isAddress) ? value : undefined;
}

/** The records `payload` stands for, or none when it is not a rating of anything; the site only `withSite`. */
export function feedbackRecords(payload: FeedbackPayload, extension?: string, withSite = true): Feedback[] {
    const rating = RATINGS.find((known) => known === payload.rating);
    if (!rating) return [];
    const comment = withoutControls(payload.comment).slice(0, MAX_COMMENT);
    const origin = withSite ? hostOf(payload.origin) : undefined;
    const method = typeof payload.method === 'string' && /^[A-Za-z0-9:_.-]{1,64}$/.test(payload.method) ? payload.method : undefined;
    const version = typeof extension === 'string' && /^[A-Za-z0-9.+-]{1,32}$/.test(extension) ? extension : undefined;
    return (Array.isArray(payload.records) ? payload.records : [])
        .slice(0, MAX_TRANSACTIONS)
        .filter(
            (
                record,
            ): record is {
                digest: string;
                transaction: string | null;
                seen?: unknown;
                loaded_writable?: unknown;
                loaded_readonly?: unknown;
            } =>
                typeof record?.digest === 'string' &&
                /^[0-9a-f]{64}$/.test(record.digest) &&
                (record.transaction === null ||
                    (typeof record.transaction === 'string' && record.transaction.length <= MAX_TRANSACTION_BASE64)),
        )
        .map((record) => {
            const feedback: Feedback = { message_hash: record.digest, rating, comment, transaction: record.transaction };
            if (origin) feedback.origin = origin;
            if (method) feedback.method = method;
            if (version) feedback.extension = version;
            const seen = seenOf(record.seen);
            if (seen) feedback.seen = seen;
            // The tables' addresses go only with the transaction they load for.
            const writable = addresses(record.loaded_writable);
            const readonly = addresses(record.loaded_readonly);
            if (record.transaction !== null && writable && readonly && writable.length + readonly.length <= MAX_LOADED) {
                feedback.loaded_writable = writable;
                feedback.loaded_readonly = readonly;
            }
            return feedback;
        });
}

/** Sends the records of `payload` to the API at `apiUrl`; whether it took them all. */
export async function sendRating(payload: FeedbackPayload, apiUrl: string): Promise<boolean> {
    const records = feedbackRecords(payload, globalThis.chrome?.runtime?.getManifest?.().version, await siteAllowed());
    if (records.length === 0) return false;
    const sent = await Promise.all(records.map((record) => sendFeedback(apiUrl, record)));
    return sent.every(Boolean);
}
