// A rating from the window's feedback strip, sent to the API: one record
// per explained transaction, each with its own digest, and its bytes only
// when the user asked for them to be sent.

import { sendFeedback } from './api.ts';
import { type FeedbackPayload, MAX_TRANSACTION_BASE64, MAX_TRANSACTIONS } from './messages.ts';
import { withoutControls } from './text.ts';
import type { Feedback, Rating } from './types.ts';

const RATINGS: readonly Rating[] = ['clear', 'unclear', 'wrong'];

/** The records `payload` stands for, or none when it is not a rating of anything. */
export function feedbackRecords(payload: FeedbackPayload): Feedback[] {
    const rating = RATINGS.find((known) => known === payload.rating);
    if (!rating) return [];
    const comment = withoutControls(payload.comment).slice(0, 2000);
    return (Array.isArray(payload.records) ? payload.records : [])
        .slice(0, MAX_TRANSACTIONS)
        .filter(
            (record): record is { digest: string; transaction: string | null } =>
                typeof record?.digest === 'string' &&
                /^[0-9a-f]{64}$/.test(record.digest) &&
                (record.transaction === null ||
                    (typeof record.transaction === 'string' && record.transaction.length <= MAX_TRANSACTION_BASE64)),
        )
        .map((record) => ({ messageHash: record.digest, rating, comment, transaction: record.transaction }));
}

/** Sends the records of `payload` to the API at `apiUrl`; whether it took them all. */
export async function sendRating(payload: FeedbackPayload, apiUrl: string): Promise<boolean> {
    const records = feedbackRecords(payload);
    if (records.length === 0) return false;
    const sent = await Promise.all(records.map((record) => sendFeedback(apiUrl, record)));
    return sent.every(Boolean);
}
