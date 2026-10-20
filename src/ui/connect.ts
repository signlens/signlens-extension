// The window a site's first connect in watch mode opens: which site asks
// to see which address, and the user's answer, sent to the worker that
// opened it. Deny has the focus, Escape denies, and closing the window
// denies too.

import type { Decision } from '../shared/model.ts';
import { getPending } from '../shared/store.ts';
import { withoutScheme } from '../shared/text.ts';
import { byId } from './dom.ts';
import { originNode } from './render.ts';
import { goneAtOpen, requestId, sendDecision } from './windows.ts';

/** Sends the answer to the worker; an Allow no request waits for any more says so rather than close as if it counted. */
function decide(decision: Decision): void {
    sendDecision(
        decision,
        'The site was not allowed: this request was no longer pending. Connect again from the site if you still mean to.',
        byId('allow'),
        byId('deny', HTMLButtonElement),
    );
}

async function start(): Promise<void> {
    const request = await getPending('connect.html', requestId);
    byId('deny').addEventListener('click', () => decide('reject'));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') decide('reject');
    });
    if (!request) {
        goneAtOpen(byId('allow'), byId('deny', HTMLButtonElement));
        return;
    }
    byId('where').replaceChildren(originNode(request.origin, ' wants to see the address SignLens watches'));
    document.title = `${withoutScheme(request.origin)} asks to see the watched address · SignLens`;
    byId('address').textContent = request.address;
    byId('allow').addEventListener('click', () => decide('continue'));
    // Denying is the safe default: it has the focus, so Enter cannot allow.
    byId('deny').focus();
}

void start();
