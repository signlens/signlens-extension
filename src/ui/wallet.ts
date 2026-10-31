// The window that asks which wallet signs: it opens when a page that has
// several connects SignLens with none chosen in the settings (requests.ts).
// Each wallet is a button, by the name and icon it has in the page (its
// initial, for one with no icon the worker let through); the one pressed
// is kept in the settings, as the popup would keep it, and the connect goes
// on to it. Cancel has the focus; Escape and closing the window choose
// none, and the connect is refused.

import type { Decision, WalletChoice } from '../shared/model.ts';
import { getPending, local } from '../shared/store.ts';
import { describe, withoutScheme } from '../shared/text.ts';
import { t } from '../shared/words.ts';
import { byId } from './dom.ts';
import { localize, nodes } from './localize.ts';
import { element, originNode } from './render.ts';
import { goneAtOpen, requestId, sendDecision } from './windows.ts';

/** Sends the answer to the worker; a choice no connect waits for any more says so rather than close as if it counted. */
function decide(decision: Decision): void {
    sendDecision(decision, t('wallet-not-connected'), byId('wallets'), byId('reject', HTMLButtonElement));
}

/** The wallet's icon, beside its name, which says it all: the icon says nothing more to a screen reader. */
function icon(wallet: WalletChoice): HTMLElement {
    if (wallet.icon === undefined) {
        const initial = element('span', 'wallet-icon', wallet.name.charAt(0).toUpperCase());
        initial.setAttribute('aria-hidden', 'true');
        return initial;
    }
    const image = element('img', 'wallet-icon');
    image.alt = '';
    image.width = 28;
    image.height = 28;
    image.src = wallet.icon;
    return image;
}

let chosen = false;

/** Keeps `name` as the wallet to pass requests to, then lets the connect go on to it; once, however often it is pressed. */
async function choose(name: string): Promise<void> {
    if (chosen) return;
    chosen = true;
    try {
        await local.set({ upstream: name });
    } catch (error) {
        chosen = false;
        byId('note').textContent = t('wallet-not-kept', { error: describe(error) });
        return;
    }
    decide('continue');
}

async function start(): Promise<void> {
    localize();
    const request = await getPending('wallet.html', requestId);
    byId('reject').addEventListener('click', () => decide('reject'));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') decide('reject');
    });
    if (!request) {
        goneAtOpen(byId('wallets'), byId('reject', HTMLButtonElement));
        return;
    }
    document.title = t('wallet-window-title', { site: withoutScheme(request.origin) });
    byId('where').replaceChildren(nodes('wallet-where', { origin: originNode(request.origin, '') }));
    byId('wallets').replaceChildren(
        ...request.wallets.map((wallet) => {
            const item = element('li');
            const button = element('button', 'wallet-choice');
            button.type = 'button';
            button.append(icon(wallet), element('span', 'wallet-name', wallet.name));
            button.addEventListener('click', () => void choose(wallet.name));
            item.append(button);
            return item;
        }),
    );
    // Cancel has the focus, as the other windows' refusals do: an Enter chooses nothing.
    byId('reject').focus();
}

void start();
