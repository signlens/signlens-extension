// The popup: the latest requests, the settings with the sites allowed to
// see the watched address, and whether the SignLens API answers.

import { endpointProblem, hostsNeeded } from '../shared/endpoint.ts';
import { send, type WalletList } from '../shared/messages.ts';
import type { HistoryEntry, Row } from '../shared/model.ts';
import {
    addressBytes,
    DEFAULTS,
    ENDPOINTS,
    MAX_CONTACTS,
    parseAddresses,
    parseContacts,
    type Settings,
    settings,
} from '../shared/settings.ts';
import { local, onChange, session } from '../shared/store.ts';
import { describe, methodName, short, withoutScheme } from '../shared/text.ts';
import type { ApiStatus } from '../shared/types.ts';
import { rowVerdictWord, summaryOf } from '../shared/verdict.ts';
import { access } from './access.ts';
import { byId } from './dom.ts';
import { noWalletHint, runsOn } from './pages.ts';
import { element, renderRow } from './render.ts';
import { yourAddresses } from './yours.ts';

const form = byId('settings', HTMLFormElement);
const engineStatus = byId('engine-status');
const addressHint = byId('address-hint');
const contactsHint = byId('contacts-hint');
const historyList = byId('history', HTMLOListElement);
const empty = byId('empty');

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
    const hint = byId('upstream-hint');
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
            const answer = chrome.tabs.sendMessage(tabId, { type: 'ping' } satisfies SignLensPage.Ping);
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
    // Which view was open is a convenience: not worth a word when it is not kept.
    if (remember) session.set({ view }).catch(() => {});
    void showSetup();
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
    const count = byId('unseen');
    count.hidden = !unseen;
    count.textContent = unseen ? `${unseen} new` : '';
}

function showModeFields(): void {
    const watch = field('mode').value === 'watch';
    byId('address-field').hidden = !watch;
    byId('sites-field').hidden = !watch;
    byId('upstream-field').hidden = watch;
    // In watch mode "you" is the watched address.
    byId('my-addresses-field').hidden = watch;
    byId('token-api-field').hidden = !field('lookupTokens').checked;
}

function checkAddress(): void {
    const address = field('address').value.trim();
    const badAddress = address !== '' && !addressBytes(address);
    addressHint.textContent = badAddress ? 'Not a Solana address (base58 of 32 bytes).' : '';
    field('address').setAttribute('aria-invalid', String(badAddress));
    const { bad, over } = parseContacts(field('contacts').value);
    contactsHint.textContent = [
        bad.length ? `Line${bad.length === 1 ? '' : 's'} ${bad.join(', ')} not read: expected Name = address.` : '',
        over.length ? `Only the first ${MAX_CONTACTS} contacts are used; line${over.length === 1 ? '' : 's'} ${over.join(', ')} not.` : '',
    ]
        .filter(Boolean)
        .join(' ');
    field('contacts').setAttribute('aria-invalid', String(bad.length > 0));
}

let statusCheck = 0;

/** Asks the worker whether the API answers and what it carries; an address SignLens may not call is not asked, and the field says why. */
async function checkEngine(): Promise<void> {
    statusCheck += 1;
    const check = statusCheck;
    const { apiUrl } = await settings();
    if (check !== statusCheck) return;
    if (endpointProblem(apiUrl)) {
        engineStatus.textContent = 'SignLens API not used: its address in the settings is not one SignLens may call.';
        engineStatus.className = 'status down';
        return;
    }
    let status: ApiStatus | { error: string };
    try {
        status = await send({ type: 'status' });
    } catch (error) {
        status = { error: describe(error) };
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
        askFirst: field('askFirst').checked,
        contacts: field('contacts').value,
        lookupTokens: field('lookupTokens').checked,
        simulate: field('simulate').checked,
        lookupAccounts: field('lookupAccounts').checked,
    };
    void saved(local.set(update));
}

/** Says in the status line `status` when the worker did not do what it was asked (`failed`), and stops saying so once it does. */
async function done(action: Promise<boolean>, status: string, failed: string): Promise<void> {
    const ok = await action.catch(() => false);
    byId(status).textContent = ok ? '' : failed;
}

/** Says, under the settings, when the browser would not keep them, and stops saying so once it does. */
async function saved(write: Promise<void>): Promise<void> {
    const status = byId('save-status');
    try {
        await write;
        status.textContent = '';
    } catch (error) {
        status.textContent = `Not saved: ${describe(error)}`;
    }
}

/** What each endpoint is, in the hint that says SignLens asks none. */
const ENDPOINT_NAMES: Readonly<Record<(typeof ENDPOINTS)[number], string>> = { apiUrl: 'API', rpcUrl: 'RPC', tokenApiUrl: 'token list' };

/**
 * Says what is wrong with endpoint `name`, and what SignLens uses instead:
 * `kept`, the address it keeps (typed now, a bad address is not saved), or
 * none when that one is no good either (kept from before the rule). Or
 * clears the field's hint.
 */
function flagEndpoint(name: (typeof ENDPOINTS)[number], problem: string | null, kept?: string): void {
    const instead =
        kept !== undefined && !endpointProblem(kept)
            ? `SignLens keeps using ${kept}.`
            : `SignLens asks no ${ENDPOINT_NAMES[name]} until it is fixed.`;
    byId(`${name}-hint`).textContent = problem ? `Not used: ${problem}. ${instead}` : '';
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
    const refused: [(typeof ENDPOINTS)[number], string][] = [];
    for (const name of ENDPOINTS) {
        const value = field(name).value.trim();
        const problem = value === '' ? null : endpointProblem(value);
        if (problem) {
            refused.push([name, problem]);
            continue;
        }
        flagEndpoint(name, null);
        if (value === '' || value === DEFAULTS[name]) reset.push(name);
        else update[name] = value;
    }
    const writes = Promise.all([saved(local.set(update)), saved(local.remove(...reset))]);
    if (flag && refused.length > 0) {
        // What is kept in place of each: the address saved before, untouched by these writes.
        const config = await settings();
        for (const [name, problem] of refused) flagEndpoint(name, problem, config[name]);
    }
    await writes;
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
    const list = byId('sites', HTMLUListElement);
    const none = byId('sites-empty');
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
                take.addEventListener(
                    'click',
                    () =>
                        void done(
                            send({ type: 'revoke', origin, address }),
                            'save-status',
                            `${withoutScheme(origin)} could not be revoked; try again.`,
                        ),
                );
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

/**
 * When a request came: the time for today's; the date and the minute for
 * another day's, short enough that the row keeps its room for the site.
 * The full moment is in the element, and shown on hover.
 */
function when(time: number): HTMLTimeElement {
    const at = new Date(time);
    const today = at.toDateString() === new Date().toDateString();
    const node = element(
        'time',
        '',
        today ? at.toLocaleTimeString() : at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    );
    node.dateTime = at.toISOString();
    node.title = at.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'medium' });
    return node;
}

/** What became of a request, in a word or two: none for one that never got so far. */
function became(entry: HistoryEntry, consent: boolean): string | null {
    if (!entry.decision) return null;
    if (entry.refused) return 'refused';
    if (consent) return entry.decision === 'continue' ? 'allowed' : 'denied';
    // Watch-only mode passes nothing on, whatever the window said.
    if (entry.mode === 'watch') return 'watch-only';
    if (entry.decision === 'continue') return entry.unasked ? 'passed on, not asked' : 'passed on';
    return 'rejected';
}

/** One row of the history: what came of it, where and when on one line, what it is under it, and the explanation when opened. */
function historyRow(entry: HistoryEntry, row: Row, part?: number): HTMLElement {
    // A site that asked to see the watched address has no verdict: it was allowed or denied.
    const consent = row.kind === 'consent';
    const verdict = consent ? 'connect' : rowVerdictWord(row);
    const summary = element('summary');
    const head = element('div', 'row-line');
    // The parts are spaced by the layout for the eye, and by spaces for the screen reader, which reads the row as one line.
    head.append(element('span', `verdict ${verdict}`, verdict), ' ');
    // What became of it sits by the verdict, where it cannot be cut off.
    const outcome = became(entry, consent);
    if (outcome) head.append(element('span', 'decision', outcome), ' ');
    // The host may break anywhere, as a long one must; the call only as a whole.
    const where = element('span', 'where', `${withoutScheme(entry.origin)} · `);
    where.append(element('span', 'call', methodName(entry.method)));
    head.append(where, ' ', when(entry.time));
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
            ...(part ? { part } : {}),
        }),
    );
    const item = element('li', 'request');
    item.append(details);
    return item;
}

/** The history, newest first, one row per transaction; a request that failed as a whole, or a message, is one row. A kept answer never changes, so a row is made once. */
function renderHistory(history: HistoryEntry[]): void {
    const clear = byId('clear');
    const before = document.activeElement;
    empty.hidden = history.length > 0;
    clear.hidden = history.length === 0;
    const seen = new Map<string, number>();
    const wanted = history.flatMap((entry) =>
        entry.rows.map((row, i) => {
            const base = `${entry.time} ${entry.origin ?? ''} ${entry.method ?? ''} ${i}`;
            const repeat = seen.get(base) ?? 0;
            seen.set(base, repeat + 1);
            return { key: `${base} ${repeat}`, make: () => historyRow(entry, row, entry.rows.length > 1 ? i + 1 : undefined) };
        }),
    );
    updateList(historyList, wanted, empty, [clear], before);
}

/**
 * The access the settings need (access.ts). Kept current as the endpoints
 * change, since the button that asks must ask at once, in its click.
 */
let hosts = { origins: hostsNeeded([]) };

async function checkPermissions(): Promise<void> {
    const needed = await access();
    hosts = needed.hosts;
    byId('allow').textContent = needed.label;
    const granted = needed.granted;
    const ask = byId('permissions');
    const hadFocus = ask.contains(document.activeElement);
    ask.hidden = granted;
    // Its button goes once it has done its part: the focus goes to the view's tab, not to nowhere.
    if (granted && hadFocus) document.querySelector<HTMLElement>('.tab[aria-selected="true"]')?.focus();
}

/** Opens the setup page in a tab of its own; the popup closes as the tab takes the focus. */
function openSetup(): void {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }).catch(() => {});
}

/** Whether an address was just added from the requests' own field: it says so there, until the popup closes. */
let addedHere = false;

/**
 * The requests' own field for your address, while pass-through mode has
 * none: until then, the first request asks which is yours. Not over the
 * settings, which list them.
 */
async function showSetup(): Promise<void> {
    const { mode, myAddresses } = await settings();
    const missing = parseAddresses(myAddresses).addresses.length === 0;
    const onSettings = byId('tab-settings').getAttribute('aria-selected') === 'true';
    byId('setup').hidden = onSettings || mode !== 'passthrough' || !(missing || addedHere);
}

async function start(): Promise<void> {
    const config = await settings();
    yourAddresses(byId('my-addresses'));
    yourAddresses(byId('setup-add'), {
        list: false,
        onAdded: () => {
            addedHere = true;
            byId('setup-ask').textContent = 'Added. SignLens calls it “you” from now on; your addresses are in the settings.';
            byId('setup-add').hidden = true;
            void showSetup();
        },
    });
    showInstructions = config.showInstructions;
    field('mode').value = config.mode;
    field('address').value = config.address;
    // The list may wait on a tab that never answers: nothing else waits on it.
    void showWallets(config.upstream);
    field('askFirst').checked = config.askFirst;
    field('contacts').value = config.contacts;
    field('apiUrl').value = config.apiUrl;
    field('rpcUrl').value = config.rpcUrl;
    field('lookupTokens').checked = config.lookupTokens;
    field('simulate').checked = config.simulate;
    field('lookupAccounts').checked = config.lookupAccounts;
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
    for (const name of ENDPOINTS) {
        field(name).addEventListener('change', () => void saveEndpoints(true).then(checkEngine).then(checkPermissions));
    }
    form.addEventListener('submit', (event) => event.preventDefault());

    byId('setup-again').addEventListener('click', openSetup);
    void checkPermissions();
    byId('allow').addEventListener('click', async () => {
        try {
            await chrome.permissions.request(hosts);
        } catch {
            // Refused, or not askable here.
        }
        void checkPermissions();
        void checkEngine();
    });
    byId('clear').addEventListener(
        'click',
        () => void done(send({ type: 'clear' }), 'clear-status', 'The requests could not be cleared; try again.'),
    );
    for (const tab of document.querySelectorAll<HTMLElement>('.tab')) {
        tab.addEventListener('click', () => showView(tab.dataset.view ?? 'requests', true));
        tab.addEventListener('keydown', onTabKey);
    }
    const { history = [], unseen = 0, view = '' } = await session.get('history', 'unseen', 'view');
    renderHistory(history);
    showUnseen(unseen);
    // Seen only once read: told first, the worker could zero the count before the popup shows it.
    // The badge clears the next time, if not now.
    send({ type: 'seen' }).catch(() => {});
    // New requests open on the requests; otherwise the view last used, and
    // the settings until there is a request to show.
    showView(unseen > 0 || !view ? (history.length > 0 ? 'requests' : 'settings') : view);
    onChange('local', (changes) => {
        if ('showInstructions' in changes) showInstructions = Boolean(changes.showInstructions);
        if ('watchSites' in changes || 'address' in changes) void showSites();
        if ('mode' in changes || 'myAddresses' in changes) void showSetup();
    });
    onChange('session', (changes) => {
        if ('history' in changes) renderHistory(changes.history ?? []);
    });
}

void start();
