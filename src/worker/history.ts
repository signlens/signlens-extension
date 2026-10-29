// The latest answers for the popup, newest first, and the toolbar badge,
// which shows the worst verdict among the answers the popup has not shown
// yet. Kept in session storage, which content scripts cannot read, and
// written one change at a time (`inTurn`): two answers at once would
// otherwise undo each other's counts. A write the browser refuses for room
// is tried again with less; any other failure is the caller's to handle.

import type { HistoryEntry, Row, VerdictWord } from '../shared/model.ts';
import { inTurn, isQuotaError, session } from '../shared/store.ts';
import { worse } from '../shared/verdict.ts';

/** How many answers are kept. */
export const HISTORY_LENGTH = 20;

/**
 * How much of session storage the history may take, as JSON in UTF-8.
 * Chrome counts an explanation at about 2.7 times its JSON (an answer of
 * 32 transactions, 0.44 MB of JSON, takes 1.07 MiB of its 10 MiB), so this
 * is about half of it, and the requests waiting in a window have the rest.
 * A write refused for room all the same is tried again with less.
 */
export const HISTORY_BYTES = 2 * 1024 * 1024;

/** How much one answer may take before it is slimmed: a quarter of the history, so that one answer cannot push the rest out. */
export const ENTRY_BYTES = HISTORY_BYTES / 4;

const BADGE: Record<VerdictWord, { text: string; color: string }> = {
    ok: { text: 'OK', color: '#1a7f4b' },
    warning: { text: 'WARN', color: '#a15c00' },
    blocked: { text: 'BLOCK', color: '#b3261e' },
    error: { text: '?', color: '#5b6475' },
    message: { text: 'MSG', color: '#5b6475' },
};

function size(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** `row` without what takes the room: the full text, then the sections and the bytes to save. */
function slimmer(row: Row, step: 1 | 2): Row {
    if (row.kind !== 'explained') return row;
    const text = 'The full text was too long to keep in the history.';
    return step === 1 ? { ...row, text } : { ...row, text, sections: [], capture: '' };
}

/** `entry` slimmed a step at a time until it is within `ENTRY_BYTES`, or as slim as it gets. */
function withinShare(entry: HistoryEntry): HistoryEntry {
    let slim = entry;
    for (const step of [1, 2] as const) {
        if (size(slim) <= ENTRY_BYTES) break;
        slim = { ...entry, rows: entry.rows.map((row) => slimmer(row, step)) };
    }
    return slim;
}

/** `list` cut to fit `HISTORY_BYTES`: the newest slimmed to its share, then the oldest answers dropped until the rest fit. Each is measured once. */
function withinBudget([newest, ...older]: HistoryEntry[]): HistoryEntry[] {
    if (!newest) return [];
    const kept = [withinShare(newest)];
    // As JSON: the brackets, and a comma before each answer after the first.
    let total = 2 + size(kept[0]);
    for (const entry of older) {
        total += 1 + size(entry);
        if (total > HISTORY_BYTES) break;
        kept.push(entry);
    }
    return kept;
}

/** `list` a step smaller: without its oldest answer, or its only one slimmed to the bone; undefined when it is as small as it gets. */
function smaller(list: HistoryEntry[]): HistoryEntry[] | undefined {
    if (list.length > 1) return list.slice(0, -1);
    const [only] = list;
    if (!only) return undefined;
    const slim = { ...only, rows: only.rows.map((row) => slimmer(row, 2)) };
    return size(slim) < size(only) ? [slim] : undefined;
}

/** Keeps `entry` as the newest answer, in place of the older ones `replacing` picks, and counts it as not shown yet. */
export function remember(entry: HistoryEntry, replacing: (older: HistoryEntry) => boolean = () => false): Promise<void> {
    return inTurn(async () => {
        const { history = [], unseen = 0 } = await session.get('history', 'unseen');
        let kept = withinBudget([entry, ...history.filter((older) => !replacing(older))].slice(0, HISTORY_LENGTH));
        for (;;) {
            try {
                return await session.set({ history: kept, unseen: unseen + 1 });
            } catch (error) {
                const less = isQuotaError(error) ? smaller(kept) : undefined;
                if (!less) throw error;
                kept = less;
            }
        }
    });
}

/** Shows `verdict` on the badge, unless a worse one the popup has not shown is already there. */
export function showBadge(verdict: VerdictWord): Promise<void> {
    return inTurn(async () => {
        const { unseenWorst = null } = await session.get('unseenWorst');
        const shown = unseenWorst ? worse(unseenWorst, verdict) : verdict;
        await session.set({ unseenWorst: shown });
        const badge = BADGE[shown];
        try {
            await chrome.action.setBadgeBackgroundColor({ color: badge.color });
            await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
            await chrome.action.setBadgeText({ text: badge.text });
        } catch {
            // A badge is a nicety.
        }
    });
}

/** The popup is open: the badge has done its job. In turn with the writes, so an answer just in cannot put back a badge cleared after it. */
export function markSeen(): Promise<void> {
    return inTurn(async () => {
        await session.set({ unseen: 0, unseenWorst: null });
        await chrome.action.setBadgeText({ text: '' });
    });
}

/** Forgets every answer. */
export function clearHistory(): Promise<void> {
    return inTurn(() => session.set({ history: [] }));
}

/**
 * Forgets the answers an earlier version kept, and their count on the
 * badge: their rows may be of a shape this version does not read, as the
 * explanation's changed with `/v2`. Session storage outlives an update in
 * some browsers.
 */
export function forgetEarlierAnswers(): Promise<void> {
    return inTurn(async () => {
        await session.set({ history: [], unseen: 0, unseenWorst: null });
        await chrome.action.setBadgeText({ text: '' });
    });
}
