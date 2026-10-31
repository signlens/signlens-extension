// The setup page, which a new install opens (worker/welcome.ts): your
// addresses (yours.ts), so the address window has nothing to ask; how
// SignLens is used; whether it is pinned; and, where the browser has not
// granted it, the access SignLens needs (access.ts).

import { t } from '../shared/words.ts';
import { access } from './access.ts';
import { byId } from './dom.ts';
import { localize } from './localize.ts';
import { yourAddresses } from './yours.ts';

/** Whether SignLens is pinned, where the browser can say: done, or the steps. */
async function showPin(): Promise<void> {
    let pinned = false;
    try {
        pinned = (await chrome.action.getUserSettings()).isOnToolbar;
    } catch {
        // A browser that cannot say gets the steps.
    }
    const status = byId('pin-status');
    status.textContent = pinned ? t('welcome-pinned') : t('welcome-pin-steps');
    status.classList.toggle('done', pinned);
}

/** The access the settings need, kept for the button, which must ask at once, in its click. */
let hosts = { origins: [] as string[] };

/** Asks for the access the settings need only where the browser has not granted it. */
async function showAccess(): Promise<void> {
    const needed = await access();
    hosts = needed.hosts;
    byId('allow').textContent = needed.label;
    byId('access').hidden = needed.granted;
}

async function start(): Promise<void> {
    localize();
    yourAddresses(byId('my-addresses'));

    void showPin();
    // Chrome 130 says when the toolbar changes; before, and elsewhere, the page asks again when it is looked at.
    chrome.action.onUserSettingsChanged?.addListener(() => void showPin());
    document.addEventListener('visibilitychange', () => void showPin());
    window.addEventListener('focus', () => void showPin());

    void showAccess();
    byId('allow').addEventListener('click', async () => {
        try {
            await chrome.permissions.request(hosts);
        } catch {
            // Refused, or not askable here.
        }
        void showAccess();
    });

    byId('done').addEventListener('click', () => {
        chrome.tabs
            .getCurrent()
            .then((tab) => (tab?.id !== undefined ? chrome.tabs.remove(tab.id) : window.close()))
            .catch(() => window.close());
    });
}

void start();
