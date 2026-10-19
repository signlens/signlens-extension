// The latest answers for the popup, newest first, and the toolbar badge,
// which shows the worst verdict among the answers the popup has not shown
// yet. Kept in session storage, which content scripts cannot read, and
// written one change at a time (`inTurn`): two answers at once would
// otherwise undo each other's counts. A failed write is the caller's to
// handle.

import type { HistoryEntry, Row, VerdictWord } from './model.ts';
import { inTurn, session } from './store.ts';
import { worse } from './verdict.ts';

/** How many answers are kept. */
export const HISTORY_LENGTH = 20;

/**
 * How much of session storage the history may take, as JSON in UTF-8:
 * half of Chrome's 10 MB, so the requests waiting in a window always have
 * room. An answer of 32 transactions with their full texts can come close
 * to it on its own.
 */
export const HISTORY_BYTES = 5 * 1024 * 1024;

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

/** `list` cut to fit `HISTORY_BYTES`: the oldest answers go first, and the newest alone is slimmed until it fits. */
function withinBudget(list: HistoryEntry[]): HistoryEntry[] {
    let kept = list;
    while (kept.length > 1 && size(kept) > HISTORY_BYTES) kept = kept.slice(0, -1);
    for (const step of [1, 2] as const) {
        const [newest] = kept;
        if (!newest || size(kept) <= HISTORY_BYTES) break;
        kept = [{ ...newest, rows: newest.rows.map((row) => slimmer(row, step)) }];
    }
    return kept;
}

/** Keeps `entry` as the newest answer, and counts it as not shown yet. */
export function remember(entry: HistoryEntry): Promise<void> {
    return inTurn(async () => {
        const { history = [], unseen = 0 } = await session.get('history', 'unseen');
        await session.set({ history: withinBudget([entry, ...history].slice(0, HISTORY_LENGTH)), unseen: unseen + 1 });
    });
}

/** The newest answer kept, if any. */
export async function latest(): Promise<HistoryEntry | undefined> {
    const { history = [] } = await session.get('history');
    return history[0];
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
