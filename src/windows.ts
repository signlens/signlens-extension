// What the explanation window (confirm.ts) and the consent window
// (connect.ts) share: the id their request goes by, their elements, the
// answer sent to the worker that waits for it, and what a window says once
// its request is gone. The worker keeps itself up while it waits
// (alive.ts).

import { send } from './messages.ts';
import type { Decision } from './model.ts';

/** The id the worker knows this window's request by. */
export const requestId = new URLSearchParams(window.location.search).get('id') ?? '';

export function byId<T extends HTMLElement = HTMLElement>(name: string): T {
    return document.getElementById(name) as T;
}

/**
 * Sends `decision` to the worker, and closes the window once it is taken,
 * or for a refusal. A yes that no request waits for any more (its page
 * closed or stopped waiting, or the worker restarted) went nowhere:
 * `nowhere` says so, rather than the window closing as if it had counted.
 */
export function sendDecision(decision: Decision, nowhere: () => void): void {
    send({ type: 'decision', id: requestId, decision }).then(
        (taken) => {
            if (taken || decision === 'reject') window.close();
            else nowhere();
        },
        () => window.close(),
    );
}

/** Makes the window one whose request is gone: `note` says so, `yes` goes, and `no` is Close, with the focus. */
export function noLongerPending(note: string, yes: HTMLElement, no: HTMLButtonElement): void {
    document.title = 'No longer pending · SignLens';
    byId('note').textContent = note;
    yes.hidden = true;
    no.textContent = 'Close';
    no.focus();
}
