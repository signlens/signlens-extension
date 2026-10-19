// The popup: the settings, whether the SignLens API answers, and the
// latest answers.

import type { ApiStatus } from './api.ts';
import { element, type HistoryEntry, renderRow } from './render.ts';
import { base58Decode, DEFAULTS, ENDPOINTS, endpointProblem, parseContacts, type Settings, settings } from './settings.ts';
import { approvals, revoke } from './sites.ts';
import { rows, rowVerdictWord } from './verdict.ts';

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
    // The selected tab alone is in the Tab order; the arrow keys move between them.
    for (const tab of document.querySelectorAll<HTMLElement>('.tab')) {
        const selected = tab.dataset.view === view;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    }
    if (remember) chrome.storage.session.set({ view }).catch(() => {});
}

/** Left and Right (and Home and End) move to the next tab and show its view, as tabs do. */
function onTabKey(event: KeyboardEvent): void {
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tab')];
    const at = tabs.indexOf(event.target as HTMLButtonElement);
    const moves: Record<string, number> = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 };
    const to = moves[event.key];
    if (at < 0 || to === undefined) return;
    event.preventDefault();
    const tab = tabs[(to + tabs.length) % tabs.length];
    tab?.focus();
    showView(tab?.dataset.view ?? 'requests', true);
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
    (document.getElementById('sites-field') as HTMLElement).hidden = !watch;
    (document.getElementById('upstream-field') as HTMLElement).hidden = watch;
    (document.getElementById('token-api-field') as HTMLElement).hidden = !field('lookupTokens').checked;
}

function checkAddress(): void {
    const address = field('address').value.trim();
    const badAddress = address !== '' && !base58Decode(address);
    addressHint.textContent = badAddress ? 'Not a Solana address (base58 of 32 bytes).' : '';
    field('address').setAttribute('aria-invalid', String(badAddress));
    const { bad } = parseContacts(field('contacts').value);
    contactsHint.textContent = bad.length ? `Line${bad.length === 1 ? '' : 's'} ${bad.join(', ')} not read: expected Name = address.` : '';
    field('contacts').setAttribute('aria-invalid', String(bad.length > 0));
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
        lookupTokens: field('lookupTokens').checked,
        simulate: field('simulate').checked,
    };
    chrome.storage.local.set(update).catch(() => {});
}

/** Says what is wrong with endpoint `name`, and what became of it (`fate`), or clears the field's hint. */
function flagEndpoint(name: (typeof ENDPOINTS)[number], problem: string | null, fate = 'Not saved'): void {
    (document.getElementById(`${name}-hint`) as HTMLElement).textContent = problem ? `${fate}: ${problem}.` : '';
    field(name).setAttribute('aria-invalid', String(problem !== null));
}

/**
 * The endpoints as typed, saved at each key: the popup closes on Escape or
 * a click outside without telling the field it was left, so a pasted
 * address must already be kept. A usable address is kept, one that is not
 * is not saved (and, once the field is left, `flag` says why), and the
 * default or an empty field is removed from storage, so that a later
 * default reaches it. Both writes leave before anything is awaited.
 */
async function saveEndpoints(flag: boolean): Promise<void> {
    const update: Partial<Settings> = {};
    const reset: string[] = [];
    for (const name of ENDPOINTS) {
        const value = field(name).value.trim();
        const problem = value === '' ? null : endpointProblem(value);
        if (problem) {
            if (flag) flagEndpoint(name, problem);
            continue;
        }
        flagEndpoint(name, null);
        if (value === '' || value === DEFAULTS[name]) reset.push(name);
        else update[name] = value;
    }
    await Promise.all([chrome.storage.local.set(update).catch(() => {}), chrome.storage.local.remove(reset).catch(() => {})]);
}

/** The sites allowed to see the watched address, each with a button that takes it back. */
async function showSites(): Promise<void> {
    const list = document.getElementById('sites') as HTMLUListElement;
    const allowed = await approvals();
    list.replaceChildren(
        ...allowed.map(({ origin, address }) => {
            const item = element('li');
            const key = element('code', 'key', `${address.slice(0, 4)}…${address.slice(-4)}`);
            key.title = address;
            const take = element('button', 'small', 'Revoke');
            take.type = 'button';
            take.setAttribute('aria-label', `Revoke ${site(origin)}`);
            take.addEventListener('click', () => void revoke(origin, address));
            item.append(element('span', 'site', site(origin)), key, take);
            return item;
        }),
    );
    (document.getElementById('sites-empty') as HTMLElement).hidden = allowed.length > 0;
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
    // An address kept from before that is no longer taken (plain http to a
    // LAN host, say) is not used: say so, rather than leave every request
    // to fail with no word here.
    for (const name of ENDPOINTS) flagEndpoint(name, endpointProblem(config[name]), 'Not used');
    showModeFields();
    checkAddress();
    void checkEngine();
    void showSites();

    form.addEventListener('input', (event) => {
        if ((ENDPOINTS as readonly string[]).includes((event.target as HTMLInputElement).name)) void saveEndpoints(false);
        else save();
    });
    for (const name of ENDPOINTS) field(name).addEventListener('change', () => void saveEndpoints(true).then(checkEngine));
    form.addEventListener('submit', (event) => event.preventDefault());

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
    for (const tab of document.querySelectorAll<HTMLElement>('.tab')) {
        tab.addEventListener('click', () => showView(tab.dataset.view ?? 'requests', true));
        tab.addEventListener('keydown', onTabKey);
    }
    const {
        history = [],
        unseen = 0,
        view = '',
    } = (await chrome.storage.session.get(['history', 'unseen', 'view'])) as { history?: HistoryEntry[]; unseen?: number; view?: string };
    renderHistory(history);
    showUnseen(unseen);
    // Seen only once read: told first, the worker could zero the count before the popup shows it.
    chrome.runtime.sendMessage({ type: 'seen' }).catch(() => {});
    // New requests open on the requests; otherwise the view last used, and
    // the settings until there is a request to show.
    showView(unseen > 0 || !view ? (history.length > 0 ? 'requests' : 'settings') : view);
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.showInstructions) showInstructions = Boolean(changes.showInstructions.newValue);
        if (area === 'local' && changes.watchSites) void showSites();
        if (area === 'session' && changes.history) renderHistory((changes.history.newValue as HistoryEntry[] | undefined) ?? []);
    });
}

void start();
