// The popup: the settings, whether the SignLens API answers, and the
// latest answers.

import type { ApiStatus } from './api.ts';
import { element, type HistoryEntry, renderRow, rows, rowVerdictWord } from './render.ts';
import { base58Decode, DEFAULTS, parseContacts, type Settings, settings } from './settings.ts';

const form = document.getElementById('settings') as HTMLFormElement;
const engineStatus = document.getElementById('engine-status') as HTMLElement;
const addressHint = document.getElementById('address-hint') as HTMLElement;
const contactsHint = document.getElementById('contacts-hint') as HTMLElement;
const historyList = document.getElementById('history') as HTMLOListElement;
const empty = document.getElementById('empty') as HTMLElement;

function field(name: string): HTMLInputElement {
    return form.elements.namedItem(name) as HTMLInputElement;
}

interface WalletList {
    wallets: string[];
    origin: string;
    at: number;
}

/**
 * The wallets the dapp in the current tab has announced, as the choices
 * of the pass-through wallet. The saved choice stays listed even when the
 * tab does not have it, so it is not lost by opening the popup elsewhere.
 */
async function showWallets(saved: string): Promise<void> {
    const select = form.elements.namedItem('upstream') as HTMLSelectElement;
    const hint = document.getElementById('upstream-hint') as HTMLElement;
    // The saved choice is in place before anything is awaited, so a save
    // meanwhile (any input in the form) keeps it rather than clearing it.
    select.replaceChildren(new Option('First one found', ''), ...(saved ? [new Option(saved, saved)] : []));
    select.value = saved;
    let tabId: number | undefined;
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = tab?.id;
    } catch {
        // No tab to ask about: the latest page's list stands in.
    }
    let list: WalletList | null = null;
    try {
        list = (await chrome.runtime.sendMessage({ type: 'wallet-list', tabId })) as WalletList | null;
    } catch {
        list = null;
    }
    const found = list?.wallets ?? [];
    // A tab with no content script to answer is one open from before the
    // extension was installed or updated; only a reload gives it one.
    let running = true;
    if (tabId !== undefined && found.length === 0) {
        try {
            const answer = chrome.tabs.sendMessage(tabId, { type: 'ping' });
            const late = new Promise<false>((resolve) => setTimeout(() => resolve(false), 500));
            running = Boolean(await Promise.race([answer, late]));
        } catch {
            running = false;
        }
    }
    const names = [...new Set([...found, ...(saved && !found.includes(saved) ? [saved] : [])])];
    select.replaceChildren(
        new Option('First one found', ''),
        ...names.map((name) => new Option(found.includes(name) ? name : `${name} (not on this page)`, name)),
    );
    select.value = saved;
    if (select.value !== saved) select.value = '';
    if (found.length) {
        hint.textContent = `Found on ${list?.origin.replace(/^\w+:\/\//, '') ?? 'this page'}: ${found.join(', ')}.`;
    } else if (!running) {
        hint.textContent =
            'SignLens is not running in this tab yet. Reload the tab (needed once after installing or updating SignLens), then open this popup again.';
    } else {
        hint.textContent = 'No other wallet found in this tab. Open a dapp, then come back here.';
    }
}

/**
 * Shows one view and marks its tab. The choice is kept in session storage,
 * which nothing but the popup reads: the settings in local storage are
 * what the page's wallet follows, and a view is not a setting.
 */
function showView(view: string, remember = false): void {
    for (const section of document.querySelectorAll<HTMLElement>('.view')) section.hidden = section.id !== `view-${view}`;
    for (const tab of document.querySelectorAll<HTMLElement>('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.view === view));
    if (remember) chrome.storage.session.set({ view }).catch(() => {});
}

/** The requests' tab label: how many arrived since the popup was last open. */
function showUnseen(unseen: number): void {
    const count = document.getElementById('unseen') as HTMLElement;
    count.hidden = !unseen;
    count.textContent = unseen ? `${unseen} new` : '';
}

function showModeFields(): void {
    const watch = field('mode').value === 'watch';
    (document.getElementById('address-field') as HTMLElement).hidden = !watch;
    (document.getElementById('upstream-field') as HTMLElement).hidden = watch;
    (document.getElementById('token-api-field') as HTMLElement).hidden = !field('lookupTokens').checked;
}

function checkAddress(): void {
    const address = field('address').value.trim();
    addressHint.textContent = address && !base58Decode(address) ? 'Not a Solana address (base58 of 32 bytes).' : '';
    const { bad } = parseContacts(field('contacts').value);
    contactsHint.textContent = bad.length ? `Line${bad.length === 1 ? '' : 's'} ${bad.join(', ')} not read: expected Name = address.` : '';
}

let statusCheck = 0;

/** Asks the worker whether the API answers and what it carries. */
async function checkEngine(): Promise<void> {
    statusCheck += 1;
    const check = statusCheck;
    let status: ApiStatus | { error: string };
    try {
        status = (await chrome.runtime.sendMessage({ type: 'status' })) as ApiStatus | { error: string };
    } catch (error) {
        status = { error: error instanceof Error ? error.message : String(error) };
    }
    if (check !== statusCheck) return;
    if ('error' in status) {
        engineStatus.textContent = `SignLens API not reachable: ${status.error}`;
        engineStatus.className = 'status down';
    } else {
        engineStatus.textContent = `SignLens API ready: engine ${status.engine}, ${status.programs} programs, ${status.tokens.toLocaleString()} verified tokens`;
        engineStatus.className = 'status up';
    }
}

function save(): void {
    showModeFields();
    checkAddress();
    const address = field('address').value.trim();
    const update: Partial<Settings> = {
        mode: field('mode').value === 'watch' ? 'watch' : 'passthrough',
        // Half-typed addresses are not saved: a connected dapp follows every change.
        ...(address === '' || base58Decode(address) ? { address } : {}),
        upstream: (form.elements.namedItem('upstream') as HTMLSelectElement).value.trim(),
        gate: field('gate').checked,
        contacts: field('contacts').value,
        apiUrl: field('apiUrl').value.trim() || DEFAULTS.apiUrl,
        rpcUrl: field('rpcUrl').value.trim() || DEFAULTS.rpcUrl,
        lookupTokens: field('lookupTokens').checked,
        simulate: field('simulate').checked,
        tokenApiUrl: field('tokenApiUrl').value.trim() || DEFAULTS.tokenApiUrl,
    };
    chrome.storage.local.set(update).catch(() => {});
}

/** Whether rows open on their instructions: the reader's last choice, kept in storage. */
let showInstructions = false;

/** An origin without its scheme. */
function site(origin: string | undefined): string {
    return (origin ?? '').replace(/^\w+:\/\//, '');
}

function renderHistory(history: HistoryEntry[]): void {
    empty.hidden = history.length > 0;
    (document.getElementById('clear') as HTMLElement).hidden = history.length === 0;
    historyList.replaceChildren(
        ...history.flatMap((entry) =>
            // One row per transaction; a request that failed as a whole, or a
            // message, is one row.
            rows(entry).map((row) => {
                const verdict = rowVerdictWord(row);
                const summary = element('summary');
                const head = element('div', 'row-line');
                head.append(element('span', `verdict ${verdict}`, verdict));
                // What became of it sits by the verdict, where it cannot be cut off.
                if (entry.decision) head.append(element('span', 'decision', entry.decision === 'continue' ? 'passed on' : 'rejected'));
                head.append(
                    element('span', 'where', `${site(entry.origin)} · ${(entry.method ?? '').replace(/^\w+:/, '')}`),
                    element('time', '', new Date(entry.time).toLocaleTimeString()),
                );
                summary.append(head);
                // The one line that says what it is, under the where and when.
                const lead = row.summary ?? row.error ?? (row.text ? 'A message, shown as it is' : '');
                if (lead) summary.append(element('div', 'lead', lead));
                const details = element('details');
                details.append(summary, renderRow({ ...row, capturedAt: entry.time, site: site(entry.origin) }, { showInstructions }));
                const item = element('li');
                item.append(details);
                return item;
            }),
        ),
    );
}

/** Host permissions: granted at install in Chrome, asked for in Firefox. */
const HOSTS = { origins: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'] };

async function checkPermissions(): Promise<void> {
    let granted = true;
    try {
        granted = await chrome.permissions.contains(HOSTS);
    } catch {
        // No permissions API: nothing to ask for.
    }
    (document.getElementById('permissions') as HTMLElement).hidden = granted;
}

async function start(): Promise<void> {
    const config = await settings();
    showInstructions = config.showInstructions;
    field('mode').value = config.mode;
    field('address').value = config.address;
    // The list may wait on a tab that never answers: nothing else waits on it.
    void showWallets(config.upstream);
    field('gate').checked = config.gate;
    field('contacts').value = config.contacts;
    field('apiUrl').value = config.apiUrl;
    field('rpcUrl').value = config.rpcUrl;
    field('lookupTokens').checked = config.lookupTokens;
    field('simulate').checked = config.simulate;
    field('tokenApiUrl').value = config.tokenApiUrl;
    showModeFields();
    checkAddress();
    void checkEngine();

    form.addEventListener('input', save);
    field('apiUrl').addEventListener('change', () => void checkEngine());
    form.addEventListener('submit', (event) => event.preventDefault());

    chrome.runtime.sendMessage({ type: 'seen' }).catch(() => {});
    void checkPermissions();
    document.getElementById('allow')?.addEventListener('click', async () => {
        try {
            await chrome.permissions.request(HOSTS);
        } catch {
            // Refused, or not askable here.
        }
        void checkPermissions();
        void checkEngine();
    });
    document.getElementById('clear')?.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'clear' }).catch(() => {}));
    for (const tab of document.querySelectorAll<HTMLElement>('.tab'))
        tab.addEventListener('click', () => showView(tab.dataset.view ?? 'requests', true));
    const {
        history = [],
        unseen = 0,
        view = '',
    } = (await chrome.storage.session.get(['history', 'unseen', 'view'])) as { history?: HistoryEntry[]; unseen?: number; view?: string };
    renderHistory(history);
    showUnseen(unseen);
    // New requests open on the requests; otherwise the view last used, and
    // the settings until there is a request to show.
    showView(unseen > 0 || !view ? (history.length > 0 ? 'requests' : 'settings') : view);
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.showInstructions) showInstructions = Boolean(changes.showInstructions.newValue);
        if (area === 'session' && changes.history) renderHistory((changes.history.newValue as HistoryEntry[] | undefined) ?? []);
    });
}

void start();
