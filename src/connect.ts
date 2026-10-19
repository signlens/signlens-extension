// The window a site's first connect in watch mode opens: which site asks
// to see which address, and the user's answer, sent to the worker that
// opened it. Deny has the focus, Escape denies, and closing the window
// denies too.

import { originNode } from './render.ts';
import type { ConnectRequest } from './sites.ts';

const id = new URLSearchParams(window.location.search).get('id') ?? '';

function byId<T extends HTMLElement>(name: string): T {
    return document.getElementById(name) as T;
}

/** Says the window has nothing left to answer, and offers only to close it. */
function noLongerPending(): void {
    byId('note').textContent = 'This request is no longer pending.';
    byId('allow').hidden = true;
    const deny = byId<HTMLButtonElement>('deny');
    deny.textContent = 'Close';
    deny.focus();
}

/** Sends the answer to the worker; an Allow no request waits for any more says so rather than close as if it counted. */
function decide(decision: 'continue' | 'reject'): void {
    chrome.runtime.sendMessage({ type: 'decision', id, decision }).then(
        (taken: unknown) => {
            if (taken === true || decision === 'reject') window.close();
            else noLongerPending();
        },
        () => window.close(),
    );
}

async function start(): Promise<void> {
    const stored = (await chrome.storage.session.get(`pending:${id}`)) as Record<string, ConnectRequest | undefined>;
    const request = stored[`pending:${id}`];
    byId('deny').addEventListener('click', () => decide('reject'));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') decide('reject');
    });
    if (!request) {
        noLongerPending();
        return;
    }
    byId('where').replaceChildren(originNode(request.origin, ' wants to see the address SignLens watches'));
    byId('address').textContent = request.address;
    byId('allow').addEventListener('click', () => decide('continue'));
    // Denying is the safe default: it has the focus, so Enter cannot allow.
    byId('deny').focus();
    // The worker that waits for the answer idles out otherwise.
    setInterval(() => chrome.runtime.sendMessage({ type: 'ping' }).catch(() => {}), 20_000);
}

void start();
