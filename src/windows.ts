// What the explanation window (confirm.ts), the consent window (connect.ts)
// and the address window (address.ts) share: the id their request goes by, their elements, the
// answer sent to the worker that waits for it, and what a window says once
// its request is gone. The worker keeps itself up while it waits
// (alive.ts).

import { byId } from './dom.ts';
import { send } from './messages.ts';
import type { Decision } from './model.ts';

/** The id the worker knows this window's request by. */
export const requestId = new URLSearchParams(window.location.search).get('id') ?? '';

/**
 * Sends `decision` to the worker, and closes the window once it is taken,
 * or for a refusal (closing the window refuses all the same). A yes that
 * no request waits for any more (its page closed or stopped waiting, or
 * the worker restarted) went nowhere, and the window says so (`nowhere`),
 * `yes` going and `no` becoming Close. A yes whose answer never came back
 * may have been taken or not: the window says that it is not known, and
 * where to look.
 */
export function sendDecision(decision: Decision, nowhere: string, yes: HTMLElement, no: HTMLButtonElement): void {
    send({ type: 'decision', id: requestId, decision }).then(
        (taken) => {
            if (taken || decision === 'reject') window.close();
            else noLongerPending(nowhere, yes, no);
        },
        () => {
            if (decision === 'reject') window.close();
            else
                noLongerPending(
                    "SignLens did not answer, so it is not known whether this went through: the popup's requests say what came of it.",
                    yes,
                    no,
                );
        },
    );
}

/** Makes the window one whose request is gone: `note` says what came of it, `yes` goes, and `no` is Close, with the focus. */
export function noLongerPending(note: string, yes: HTMLElement, no: HTMLButtonElement): void {
    document.title = 'No longer pending · SignLens';
    byId('note').textContent = note;
    yes.hidden = true;
    no.textContent = 'Close';
    // Close closes; the request it would have refused is gone.
    no.removeAttribute('aria-describedby');
    no.focus();
}

/** Makes a window opened on a request already gone: its heading and its body say so, nothing of a request shows, and Close has the focus. */
export function goneAtOpen(yes: HTMLElement, no: HTMLButtonElement): void {
    for (const part of document.querySelectorAll<HTMLElement>('header > :not(h1), main > *')) part.hidden = true;
    (document.querySelector('h1') as HTMLElement).textContent = 'No longer pending';
    const why = document.createElement('p');
    why.textContent = 'This request is no longer pending: its page closed, reloaded or stopped waiting. Nothing came of it.';
    (document.querySelector('main') as HTMLElement).append(why);
    noLongerPending('', yes, no);
}
