// The window that asks whether an address a page names as yours is yours:
// it opens before a request is explained when your settings do not have
// that address (requests.ts). Reject has the focus, Escape and closing the
// window reject; "It's mine" adds the address to your addresses, and the
// request goes on to be explained.

import type { Decision } from '../shared/model.ts';
import { getPending } from '../shared/store.ts';
import { withoutScheme } from '../shared/text.ts';
import { t } from '../shared/words.ts';
import { byId } from './dom.ts';
import { localize, nodes } from './localize.ts';
import { element, originNode } from './render.ts';
import { goneAtOpen, requestId, sendDecision } from './windows.ts';

/** An address in full, its first and last four characters in bold: what a wallet shows of it, to compare with. */
function addressCode(address: string): HTMLElement {
    const code = element('code', 'watched');
    code.append(element('b', '', address.slice(0, 4)), address.slice(4, -4), element('b', '', address.slice(-4)));
    return code;
}

function addressItem(address: string): HTMLLIElement {
    const item = element('li', 'address-item');
    item.append(addressCode(address));
    return item;
}

/** Sends the answer to the worker; a yes no request waits for any more says so rather than close as if it counted. */
function decide(decision: Decision): void {
    sendDecision(decision, t('address-not-added'), byId('add'), byId('reject', HTMLButtonElement));
}

async function start(): Promise<void> {
    localize();
    const request = await getPending('address.html', requestId);
    byId('reject').addEventListener('click', () => decide('reject'));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') decide('reject');
    });
    if (!request) {
        goneAtOpen(byId('add'), byId('reject', HTMLButtonElement));
        return;
    }
    document.title = t('address-window-title', { site: withoutScheme(request.origin) });
    byId('where').replaceChildren(nodes('address-where', { origin: originNode(request.origin, '') }));
    byId('claimed').replaceChildren(addressCode(request.address));
    byId('mine').replaceChildren(...request.mine.map(addressItem));
    byId('mine-empty').hidden = request.mine.length > 0;
    byId('add').addEventListener('click', () => decide('continue'));
    // Rejecting is the safe default: it has the focus, so Enter cannot add.
    byId('reject').focus();
}

void start();
