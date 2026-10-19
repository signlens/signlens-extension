// The popup: the latest requests, the settings with the sites allowed to
// see the watched address, and whether the SignLens API answers.

import type { ApiStatus } from './api.ts';
import { endpointProblem } from './endpoint.ts';
import { send, type WalletList } from './messages.ts';
import type { HistoryEntry, Row } from './model.ts';
import { noWalletHint, runsOn } from './pages.ts';
import { element, renderRow } from './render.ts';
import { addressBytes, DEFAULTS, ENDPOINTS, parseContacts, type Settings, settings } from './settings.ts';
import { local, onChange, session } from './store.ts';
import { methodName, short, withoutScheme } from './text.ts';
import { rowVerdictWord, summaryOf } from './verdict.ts';

const form = document.getElementById('settings') as HTMLFormElement;
const engineStatus = document.getElementById('engine-status') as HTMLElement;
const addressHint = document.getElementById('address-hint') as HTMLElement;
const contactsHint = document.getElementById('contacts-hint') as HTMLElement;
const historyList = document.getElementById('history') as HTMLOListElement;
const empty = document.getElementById('empty') as HTMLElement;

function field(name: string): HTMLInputElement {
    return form.elements.namedItem(name) as HTMLInputElement;
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
    let url: string | undefined;
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = tab?.id;
        url = tab?.url;
    } catch {
        // No tab to ask about: the latest page's list stands in.
    }
    let list: WalletList | null = null;
    try {
        list = await send({ type: 'wallet-list', tabId: tabId ?? null });
    } catch {
        list = null;
    }
    const found = list?.wallets ?? [];
    // A tab with no content script to answer, on a page SignLens runs on,
    // is one open from before the extension was installed or updated; only
    // a reload gives it one.
    let running = true;
    if (tabId !== undefined && found.length === 0 && runsOn(url)) {
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
        hint.textContent = `Found on ${list ? withoutScheme(list.origin) : 'this page'}: ${found.join(', ')}.`;
    } else if (tabId === undefined) {
        // No tab to ask about: the latest page's list stood in, and there is no page to say anything of.
        hint.textContent = 'No other wallet found. Open a dapp, then come back here.';
    } else {
        hint.textContent = noWalletHint(url, running);
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
    if (remember) session.set({ view }).catch(() => {});
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
    const badAddress = address !== '' && !addressBytes(address);
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
        status = await send({ type: 'status' });
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
        ...(address === '' || addressBytes(address) ? { address } : {}),
        upstream: (form.elements.namedItem('upstream') as HTMLSelectElement).value.trim(),
        gate: field('gate').checked,
        contacts: field('contacts').value,
        lookupTokens: field('lookupTokens').checked,
        simulate: field('simulate').checked,
    };
    void saved(local.set(update));
}

/** Says, under the settings, when the browser would not keep them, and stops saying so once it does. */
async function saved(write: Promise<void>): Promise<void> {
    const status = document.getElementById('save-status') as HTMLElement;
    try {
        await write;
        status.textContent = '';
    } catch (error) {
        status.textContent = `Not saved: ${error instanceof Error ? error.message : String(error)}`;
    }
}

/** Says what is wrong with endpoint `name`, or clears the field's hint. Typed now or kept from before, such an address is not used. */
function flagEndpoint(name: (typeof ENDPOINTS)[number], problem: string | null): void {
    (document.getElementById(`${name}-hint`) as HTMLElement).textContent = problem ? `Not used: ${problem}.` : '';
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
    const reset: (typeof ENDPOINTS)[number][] = [];
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
    await Promise.all([saved(local.set(update)), saved(local.remove(...reset))]);
}

/** An item of a list `updateList` keeps, and how to make it the first time. */
interface Keyed {
    key: string;
    make: () => HTMLElement;
}

/**
 * Brings `list` to `wanted` without rebuilding what stays: an item kept
 * is left where it is, so a row the reader opened stays open and the
 * focus in it stays put. When the focused item goes, or a control
 * `beside` the list that had the focus is hidden, the focus moves to the
 * item now in its place, or to `fallback` when the list is empty.
 * `before` is where the focus was before the caller hid anything, which
 * takes the focus away at once.
 */
function updateList(
    list: HTMLElement,
    wanted: Keyed[],
    fallback: HTMLElement,
    beside: HTMLElement[] = [],
    before = document.activeElement,
): void {
    const focused = before instanceof HTMLElement ? before : null;
    const items = [...list.children] as HTMLElement[];
    const at = focused ? items.findIndex((item) => item.contains(focused)) : -1;
    const tracked = at >= 0 || (focused !== null && beside.includes(focused));
    const keys = new Set(wanted.map((item) => item.key));
    const kept = new Map<string, HTMLElement>();
    for (const item of items) {
        if (item.dataset.key !== undefined && keys.has(item.dataset.key)) kept.set(item.dataset.key, item);
        else item.remove();
    }
    let next = list.firstElementChild;
    for (const { key, make } of wanted) {
        let item = kept.get(key);
        if (!item) {
            item = make();
            item.dataset.key = key;
        }
        if (item === next) next = next.nextElementSibling;
        else list.insertBefore(item, next);
    }
    if (!tracked || (focused?.isConnected && !focused.closest('[hidden]'))) return;
    const place = list.children[Math.min(Math.max(at, 0), list.children.length - 1)];
    (place?.querySelector<HTMLElement>('summary, button') ?? fallback).focus();
}

/**
 * The sites allowed to see the watched address, each with a button that
 * takes it back: those for the address in the settings first, then those
 * allowed for an address watched before, marked so.
 */
async function showSites(): Promise<void> {
    const list = document.getElementById('sites') as HTMLUListElement;
    const none = document.getElementById('sites-empty') as HTMLElement;
    const [{ watchSites: allowed = [] }, { address: watching }] = await Promise.all([local.get('watchSites'), settings()]);
    const current = watching.trim();
    const ordered = [...allowed.filter((a) => a.address === current), ...allowed.filter((a) => a.address !== current)];
    none.hidden = allowed.length > 0;
    updateList(
        list,
        ordered.map(({ origin, address }) => ({
            key: `${origin} ${address} ${address === current}`,
            make: () => {
                const item = element('li');
                const key = element('code', 'key', short(address));
                key.title = address;
                const take = element('button', 'small', 'Revoke');
                take.type = 'button';
                // One site may be allowed for several addresses: each button says which.
                take.setAttribute('aria-label', `Revoke ${withoutScheme(origin)} for ${short(address)}`);
                // The worker writes the approvals, in turn with a site being allowed meanwhile.
                take.addEventListener('click', () => void send({ type: 'revoke', origin, address }).catch(() => {}));
                item.append(element('span', 'site', withoutScheme(origin)), ' ', key, ' ');
                if (address !== current) item.append(element('span', 'other-address', 'another address'), ' ');
                item.append(take);
                return item;
            },
        })),
        none,
    );
}

/** Whether rows open on their instructions: the reader's last choice, kept in storage. */
let showInstructions = false;

/** One row of the history: what came of it, where and when on one line, what it is under it, and the explanation when opened. */
function historyRow(entry: HistoryEntry, row: Row): HTMLElement {
    // A site that asked to see the watched address has no verdict: it was allowed or denied.
    const consent = row.kind === 'consent';
    const verdict = consent ? 'connect' : rowVerdictWord(row);
    const summary = element('summary');
    const head = element('div', 'row-line');
    // The parts are spaced by the layout for the eye, and by spaces for the screen reader, which reads the row as one line.
    head.append(element('span', `verdict ${verdict}`, verdict), ' ');
    // What became of it sits by the verdict, where it cannot be cut off.
    if (entry.decision) {
        const yes = consent ? 'allowed' : 'passed on';
        const became = entry.decision === 'continue' ? yes : entry.refused ? 'refused' : consent ? 'denied' : 'rejected';
        head.append(element('span', 'decision', became), ' ');
    }
    head.append(
        element('span', 'where', `${withoutScheme(entry.origin)} · ${methodName(entry.method)}`),
        ' ',
        element('time', '', new Date(entry.time).toLocaleTimeString()),
    );
    summary.append(head);
    // The one line that says what it is, under the where and when.
    summary.append(' ', element('div', 'lead', summaryOf(row)));
    if (entry.refused) summary.append(' ', element('div', 'refused', `Refused by SignLens: ${entry.refused}`));
    const details = element('details');
    details.append(
        summary,
        renderRow(row, {
            showInstructions,
            onShowInstructions: (shown) => void saved(local.set({ showInstructions: shown })),
            capturedAt: entry.time,
            site: withoutScheme(entry.origin),
        }),
    );
    const item = element('li', 'request');
    item.append(details);
    return item;
}

/** The history, newest first, one row per transaction; a request that failed as a whole, or a message, is one row. A kept answer never changes, so a row is made once. */
function renderHistory(history: HistoryEntry[]): void {
    const clear = document.getElementById('clear') as HTMLElement;
    const before = document.activeElement;
    empty.hidden = history.length > 0;
    clear.hidden = history.length === 0;
    const seen = new Map<string, number>();
    const wanted = history.flatMap((entry) =>
        entry.rows.map((row, i) => {
            const base = `${entry.time} ${entry.origin ?? ''} ${entry.method ?? ''} ${i}`;
            const repeat = seen.get(base) ?? 0;
            seen.set(base, repeat + 1);
            return { key: `${base} ${repeat}`, make: () => historyRow(entry, row) };
        }),
    );
    updateList(historyList, wanted, empty, [clear], before);
}

/** The host permissions the manifest asks for: granted at install in Chrome, asked for in Firefox. */
const HOSTS = { origins: chrome.runtime.getManifest().host_permissions ?? [] };

async function checkPermissions(): Promise<void> {
    let granted = true;
    try {
        granted = await chrome.permissions.contains(HOSTS);
    } catch {
        // No permissions API: nothing to ask for.
    }
    const ask = document.getElementById('permissions') as HTMLElement;
    const hadFocus = ask.contains(document.activeElement);
    ask.hidden = granted;
    // Its button goes once it has done its part: the focus goes to the view's tab, not to nowhere.
    if (granted && hadFocus) document.querySelector<HTMLElement>('.tab[aria-selected="true"]')?.focus();
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
    for (const name of ENDPOINTS) flagEndpoint(name, endpointProblem(config[name]));
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
    document.getElementById('clear')?.addEventListener('click', () => send({ type: 'clear' }).catch(() => {}));
    for (const tab of document.querySelectorAll<HTMLElement>('.tab')) {
        tab.addEventListener('click', () => showView(tab.dataset.view ?? 'requests', true));
        tab.addEventListener('keydown', onTabKey);
    }
    const { history = [], unseen = 0, view = '' } = await session.get('history', 'unseen', 'view');
    renderHistory(history);
    showUnseen(unseen);
    // Seen only once read: told first, the worker could zero the count before the popup shows it.
    send({ type: 'seen' }).catch(() => {});
    // New requests open on the requests; otherwise the view last used, and
    // the settings until there is a request to show.
    showView(unseen > 0 || !view ? (history.length > 0 ? 'requests' : 'settings') : view);
    onChange('local', (changes) => {
        if ('showInstructions' in changes) showInstructions = Boolean(changes.showInstructions);
        if ('watchSites' in changes || 'address' in changes) void showSites();
    });
    onChange('session', (changes) => {
        if ('history' in changes) renderHistory(changes.history ?? []);
    });
}

void start();
