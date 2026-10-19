// The latest answers for the popup, newest first, and the toolbar badge,
// which shows the worst verdict among the answers the popup has not shown
// yet. Kept in session storage, which content scripts cannot read, and
// written one change at a time: two answers at once would otherwise undo
// each other's counts.

import type { HistoryEntry } from './render.ts';
import { type VerdictWord, worse } from './verdict.ts';

/** How many answers are kept. */
export const HISTORY_LENGTH = 20;

const BADGE: Record<VerdictWord, { text: string; color: string }> = {
    ok: { text: 'OK', color: '#1a7f4b' },
    warning: { text: 'WARN', color: '#a15c00' },
    blocked: { text: 'BLOCK', color: '#b3261e' },
    error: { text: '?', color: '#5b6475' },
    message: { text: 'MSG', color: '#5b6475' },
};

let saving: Promise<void> = Promise.resolve();

/** Runs `write` after every write before it. */
function serially(write: () => Promise<void>): Promise<void> {
    saving = saving.then(write).catch(() => {});
    return saving;
}

/** Keeps `entry` as the newest answer, and counts it as not shown yet. */
export function remember(entry: HistoryEntry): Promise<void> {
    return serially(async () => {
        const { history = [], unseen = 0 } = (await chrome.storage.session.get(['history', 'unseen'])) as {
            history?: HistoryEntry[];
            unseen?: number;
        };
        await chrome.storage.session.set({ history: [entry, ...history].slice(0, HISTORY_LENGTH), unseen: unseen + 1 });
    });
}

/** The newest answer kept, if any. */
export async function latest(): Promise<HistoryEntry | undefined> {
    const { history = [] } = (await chrome.storage.session.get('history')) as { history?: HistoryEntry[] };
    return history[0];
}

/** Shows `verdict` on the badge, unless a worse one the popup has not shown is already there. */
export function showBadge(verdict: VerdictWord): Promise<void> {
    return serially(async () => {
        const { unseenWorst = null } = (await chrome.storage.session.get('unseenWorst')) as { unseenWorst?: VerdictWord | null };
        const shown = unseenWorst ? worse(unseenWorst, verdict) : verdict;
        await chrome.storage.session.set({ unseenWorst: shown });
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
    return serially(async () => {
        await chrome.storage.session.set({ unseen: 0, unseenWorst: null });
        await chrome.action.setBadgeText({ text: '' });
    });
}

/** Forgets every answer. */
export function clearHistory(): Promise<void> {
    return serially(() => chrome.storage.session.set({ history: [] }));
}
