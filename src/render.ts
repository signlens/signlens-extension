// Shared by the popup and the window: how one explained request is shown.
// The engine's structured explanation (summary, findings, effects,
// sections) is rendered effects first; its full text stays one click away,
// and is all there is for a message.

import type { Address, Amount, Bound, Effect, Field, Finding, Section, Trust, Value } from './types.ts';

/** One row of an answer: a transaction explained, or a message, or a failure. */
export interface Row {
    verdict?: 'ok' | 'warning' | 'blocked' | null;
    error?: string | null;
    text?: string;
    summary?: string;
    findings?: Finding[];
    effects?: Effect[];
    sections?: Section[];
    tables?: string;
    /** The chain the page named, when not mainnet: its word, read and simulated against the RPC in the settings all the same. */
    chain?: string;
    simulation?: string;
    hints?: string[];
    capture?: string;
    capturedAt?: number;
    site?: string;
    digest?: string | null;
    transaction?: string;
}

/** An answer as the worker keeps it: rows, or one failure or message. */
export interface Entry {
    results?: Row[];
    error?: string;
    text?: string;
}

/** An answer as the popup and the window keep it: the answer, and where it came from. */
export interface HistoryEntry extends Entry {
    time: number;
    origin?: string;
    method?: string;
    mode: 'passthrough' | 'watch';
    upstream: string;
    decision?: 'continue' | 'reject';
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** A page's origin and what it asks, as a line: the scheme muted, the host in bold, so lookalike hosts read differently. */
export function originNode(origin: string | undefined, asks: string): DocumentFragment {
    const node = document.createDocumentFragment();
    const match = /^(\w+:\/\/)(.*)$/.exec(origin ?? '');
    if (match) {
        node.append(element('span', 'scheme', match[1]), element('b', 'host', match[2]));
    } else {
        node.append(origin ?? 'an unknown page');
    }
    node.append(asks);
    return node;
}

/** The trust marker the engine's text uses, after a label or an amount. */
const MARKER: Record<Trust, string> = { Fact: '', Verified: ' (verified)', Claimed: ' (claimed, unverified)' };

/** What a trust marker means, for a reader who opens it. */
const MARKER_HELP: Partial<Record<Trust, string>> = {
    Verified:
        'This name comes from SignLens itself: its reviewed descriptors, its token list, or your own keys. The site could not have supplied it.',
    Claimed:
        'This came from the site or from the RPC the extension asked, not from the transaction itself. Signlens could not check it, so do not rely on it.',
};

/** What the marker on a whole section of claims means. */
const CLAIMS_HELP =
    'Everything in this section came from the RPC the extension asked, not from the transaction itself. Signlens could not check it, so treat it as a hint, not a fact.';

/**
 * What the engine's fixed labels mean, for a reader who opens one. Keyed by
 * the label as the engine writes it; a housekeeping label ("Create token
 * account if missing: Mint") is looked up by its last part. Labels a
 * descriptor chooses are not here: they differ per program, so the
 * descriptor carries their help and the field arrives with it.
 */
const HELP = new Map<string, string>(
    Object.entries({
        Total: 'What the network charges for this transaction. The fee payer pays it whether the transaction succeeds or fails.',
        Base: 'The flat part of the fee: the network charges it per signature.',
        Priority: 'A tip the site added so validators take the transaction sooner. It is optional, and it is yours to pay.',
        'Priority basis': 'How the tip was computed: the price per unit of work, times the work the transaction asked to be allowed.',
        'Rent deposits':
            'SOL locked to keep the accounts this transaction creates on chain. It is a deposit, not a fee: closing an account returns it to whoever closes it.',
        Expires:
            'How long the signature can be used. About a minute is normal; a durable nonce keeps it usable until the nonce is advanced.',
        'Nonce account':
            'The account that keeps this signature usable. Until it is advanced, anyone holding the signed transaction can submit it.',
        'Fee payer': 'The account that pays the fee: the first signer.',
        Signer: 'An account whose signature the transaction needs besides the fee payer.',
        'Additional accounts':
            'Additional accounts this instruction uses that its reviewed descriptor does not name. It is normal for instructions to need several.',
        'Compute unit limit': 'How much work the transaction may do. It affects the fee, not what the transaction does.',
        'Compute unit price': 'The tip per unit of work, in millionths of a lamport. With the limit, it sets the priority fee.',
        'Heap size': 'Memory a program asked for. It affects the fee, not what the transaction does.',
        'Loaded account data limit': 'How much account data the transaction may read. It affects the fee, not what the transaction does.',
        'Token account': 'An account that holds one token for one wallet. A wallet has a separate one for each token it holds.',
        Mint: 'The address that identifies the token itself, as opposed to an account holding some of it.',
        'Rent paid by': 'Who pays the small deposit that keeps a new account alive. It comes back when the account is closed.',
        'Token program': 'The program that manages this token: SPL Token or Token-2022.',
        Result: 'What the RPC says would happen if this were sent now. A simulation, not the real thing: the chain can differ by the time it lands.',
        'Compute units': 'How much work the transaction did in the simulation. The priority fee is paid per unit, so this is what it buys.',
    }),
);

/** The help for a label, or undefined when there is none. A map, since the label is the engine's text: "constructor" is no key. */
export function helpFor(label: string): string | undefined {
    const last = label.lastIndexOf(': ');
    return HELP.get(label) ?? (last >= 0 ? HELP.get(label.slice(last + 2)) : undefined);
}

/** A button, which the keyboard and the screen reader take as one: Enter and Space press it. */
function button(className: string, text?: string): HTMLButtonElement {
    const node = element('button', className, text);
    node.type = 'button';
    return node;
}

/**
 * A term the reader can open: a button whose help appears as a note under
 * the value it sits in (`host`, or the nearest field, item or paragraph)
 * and goes away the same way.
 */
export function term(text: string, help: string, host?: HTMLElement): HTMLButtonElement {
    const node = button('term', text);
    node.setAttribute('aria-expanded', 'false');
    let note: HTMLElement | null = null;
    node.addEventListener('click', (event) => {
        // A term in a disclosure's head is its own control, not the head's.
        event.stopPropagation();
        if (note) {
            note.remove();
            note = null;
        } else {
            note = element('div', 'help-note', help);
            (host ?? node.closest('dd, li, p') ?? node.parentElement)?.append(note);
        }
        node.setAttribute('aria-expanded', String(note !== null));
    });
    return node;
}

/**
 * Appends the trust marker for `trust` to `node`, as a term, when there is
 * one. `help` replaces the marker's usual text and `host` is where the
 * help opens; otherwise it opens under the nearest value.
 */
export function mark<T extends HTMLElement>(node: T, trust: Trust, help?: string, host?: HTMLElement): T {
    const marker = MARKER[trust];
    if (marker) node.append(' ', term(marker.trim(), help ?? MARKER_HELP[trust] ?? '', host));
    return node;
}

/** An address shortened as the engine shortens it: four characters each end. */
function short(text: string): string {
    if (text.length <= 12 || /[^0-9A-Za-z]/.test(text)) return text;
    return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

/** Digits grouped by thousands. */
function group(digits: string): string {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** An amount's quantity as the engine writes it: scaled by the asset's decimals, or raw units. */
export function quantity(amount: Amount): string {
    const decimals = amount.asset.decimals;
    let units: bigint;
    try {
        units = BigInt(amount.units);
    } catch {
        return `${amount.units} raw units`;
    }
    if (decimals === null || decimals === undefined) return `${units} raw units`;
    const sign = units < 0n ? '-' : '';
    const magnitude = units < 0n ? -units : units;
    const scale = 10n ** BigInt(decimals);
    const integer = group((magnitude / scale).toString());
    const fraction = (magnitude % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${sign}${fraction ? `${integer}.${fraction}` : integer}`;
}

const PREFIX: Record<Bound, string> = { Exact: '', AtLeast: '≥ ', AtMost: '≤ ', Unlimited: 'UNLIMITED ', Unknown: 'unknown amount of ' };

/** An amount as the engine's text writes it, as a node: the trust marker in it is a term. */
export function amountNode(amount: Amount): HTMLSpanElement {
    const node = element('span', 'amount');
    const prefix = PREFIX[amount.bound];
    const asset = amount.asset;
    if ((amount.bound === 'Unlimited' || amount.bound === 'Unknown') && asset.symbol) node.append(`${prefix}${asset.symbol}`);
    else if (amount.bound === 'Unlimited') node.append('UNLIMITED unverified token');
    else if (amount.bound === 'Unknown') node.append('unknown amount of an unverified token');
    else if (asset.symbol) node.append(`${prefix}${quantity(amount)} ${asset.symbol}`);
    else node.append(`${prefix}${quantity(amount)} of an unverified token`);
    mark(node, asset.trust);
    let tail = '';
    if (amount.note) tail += ` (${amount.note})`;
    if (!asset.symbol) tail += ` (${asset.id})`;
    if (tail) node.append(tail);
    return node;
}

/** An address as a node: its label in bold and its short form when it has one. The signer's own is green, and its label says so in words ("Your wallet"). */
export function addressNode(address: Address): HTMLSpanElement {
    const node = element('span', `address${address.is_self ? ' self' : ''}`);
    node.title = address.text;
    if (address.label) {
        node.append(element('b', '', address.label), ' (', element('span', 'key', short(address.text)), ')');
        mark(node, address.label_trust);
    } else {
        node.append(element('span', 'key', address.text));
    }
    return node;
}

/** What the window says of a variant this version does not know. */
function unrecognized(what: string, type: string): string {
    return `${what} this version cannot show (${type}); the full text below has it`;
}

/** A field's value as a node. */
export function valueNode(value: Value): HTMLElement {
    switch (value.type) {
        case 'Text':
        case 'Integer':
            return element('span', '', value.value);
        case 'Amount':
            return amountNode(value.value);
        case 'Address':
            return addressNode(value.value);
        case 'BasisPoints':
            return element('span', '', `${(value.value / 100).toFixed(2)}%`);
        case 'Duration':
            return element('span', '', `${value.value} seconds`);
        case 'Timestamp':
            return element('span', '', new Date(value.value * 1000).toLocaleString());
        case 'Bytes':
            return bytesNode(value.value);
        case 'Bool':
            return element('span', '', value.value ? 'yes' : 'no');
        case 'List': {
            const list = element('ul', 'list');
            for (const item of value.value) {
                const li = element('li');
                li.append(valueNode(item));
                list.append(li);
            }
            return list;
        }
        case 'Unrecognized':
            return element('span', 'unrecognized', unrecognized('A value', value.value.type));
    }
}

/** Hex longer than this many characters is folded to two lines with a control to show it all. */
const HEX_FOLD = 128;

/** A hex value, folded when long: the bytes stay in the DOM, only their display is clamped. */
function bytesNode(hex: string): HTMLElement {
    const code = element('code', 'bytes', `0x${hex}`);
    if (hex.length <= HEX_FOLD) return code;
    const node = element('span', 'bytes-fold');
    code.classList.add('clamped');
    const more = button('more-bytes', `show all ${hex.length / 2} bytes`);
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => {
        const clamped = code.classList.toggle('clamped');
        more.textContent = clamped ? `show all ${hex.length / 2} bytes` : 'show less';
        more.setAttribute('aria-expanded', String(!clamped));
    });
    node.append(code, more);
    return node;
}

/** Appends `parts` to `node`: strings as text, nodes as they are. */
function append<T extends HTMLElement>(node: T, ...parts: (string | Node)[]): T {
    for (const part of parts) node.append(part);
    return node;
}

/** One effect as a sentence, in the second person where the signer is the one it happens to. */
export function effectNode(effect: Effect): HTMLLIElement {
    const li = element('li', `effect ${effect.type.toLowerCase()}`);
    switch (effect.type) {
        case 'Transfer': {
            const v = effect.value;
            if (v.from.is_self && !v.to.is_self)
                return append(li, 'You send ', amountNode(v.amount), ' from ', addressNode(v.from), ' to ', addressNode(v.to));
            if (v.to.is_self && !v.from.is_self)
                return append(li, 'You receive ', amountNode(v.amount), ' into ', addressNode(v.to), ' from ', addressNode(v.from));
            return append(li, 'Transfer ', amountNode(v.amount), ' from ', addressNode(v.from), ' to ', addressNode(v.to));
        }
        case 'Burn': {
            const v = effect.value;
            return append(li, v.account.is_self ? 'You burn ' : 'Burn ', amountNode(v.amount), ' from ', addressNode(v.account));
        }
        case 'AuthorityChange': {
            const v = effect.value;
            return v.new_authority
                ? append(li, `Give the ${v.authority} authority over `, addressNode(v.subject), ' to ', addressNode(v.new_authority))
                : append(li, `Permanently remove the ${v.authority} authority over `, addressNode(v.subject));
        }
        case 'Delegate': {
            const v = effect.value;
            return append(li, 'Allow ', addressNode(v.delegate), ' to spend ', amountNode(v.amount), ' from ', addressNode(v.subject));
        }
        case 'Revoke': {
            const v = effect.value;
            return append(li, 'Revoke the delegate on ', addressNode(v.subject));
        }
        case 'Create': {
            const v = effect.value;
            append(li, 'Create ', addressNode(v.account), ' owned by ', addressNode(v.owner));
            if (v.deposit) append(li, ', depositing ', amountNode(v.deposit));
            if (v.if_missing) li.append(' unless it already exists');
            return li;
        }
        case 'Close': {
            const v = effect.value;
            return append(li, 'Close ', addressNode(v.account), ' and send its balance to ', addressNode(v.destination));
        }
        case 'Fee': {
            const v = effect.value;
            return v.payer.is_self
                ? append(li, 'You pay a fee of ', amountNode(v.amount))
                : append(li, addressNode(v.payer), ' pays a fee of ', amountNode(v.amount));
        }
        case 'Lifetime': {
            const v = effect.value;
            return v.type === 'DurableNonce'
                ? append(li, 'Valid FOREVER until nonce account ', addressNode(v.value.nonce_account), ' is advanced (durable nonce)')
                : append(li, 'Valid for about a minute (recent blockhash)');
        }
        case 'Proposed': {
            const inner = effectNode(effect.value.effect);
            inner.className = 'effect proposed';
            inner.prepend('Once approved, ', addressNode(effect.value.by), ' would: ');
            return inner;
        }
        case 'Other':
            return append(li, effect.value.description);
        case 'Unrecognized':
            return append(li, unrecognized('Something', effect.value.type));
    }
}

/**
 * A disclosure that is not a `details` element: the popup's history rows
 * are `details`, and their `summary` must stay the only one in a row. Its
 * head is a row holding the toggle, a button labelled `label`, and what
 * `aside` makes beside it (given the row, to open help in); a click on the
 * row's bare space toggles too. `onFlip` hears the new state.
 */
export function disclosure(
    className: string,
    label: string | Node,
    body: HTMLElement,
    open: boolean,
    onFlip?: (shown: boolean) => void,
    aside?: (head: HTMLElement) => Node,
): HTMLDivElement {
    const node = element('div', `disclosure ${className}`);
    const head = element('div', 'disclosure-head');
    const toggle = button('toggle');
    toggle.append(label);
    toggle.setAttribute('aria-expanded', String(open));
    head.append(toggle);
    if (aside) head.append(aside(head));
    body.classList.add('disclosure-body');
    body.hidden = !open;
    toggle.addEventListener('click', () => {
        body.hidden = !body.hidden;
        toggle.setAttribute('aria-expanded', String(!body.hidden));
        onFlip?.(!body.hidden);
    });
    head.addEventListener('click', (event) => {
        if (event.target === head) toggle.click();
    });
    node.append(head, body);
    return node;
}

function sectionIndex(section: Section): number | null {
    const kind = section.kind;
    return kind.type === 'Instruction' || kind.type === 'Nested' ? kind.value.index : null;
}

/** A section as a disclosure: its title, its subtitle, and its fields as a definition list. */
export function sectionNode(section: Section, open: boolean, nested: HTMLElement[]): HTMLDivElement {
    const label = element('span', 'section-head');
    const index = sectionIndex(section);
    const title = section.kind.type === 'Nested' && index !== null ? `Step ${index + 1}: ${section.title}` : section.title;
    label.append(element('span', 'section-title', title));
    if (section.subtitle) label.append(' ', element('span', 'section-subtitle', section.subtitle));
    const claims = section.kind.type === 'Claims';
    const body = element('div');
    const fields = element('dl', 'fields');
    for (const field of section.fields) fields.append(...fieldNodes(field, claims));
    body.append(fields);
    for (const child of nested) body.append(child);
    // A section of claims says so once, beside its toggle; its rows are not marked again.
    const marker = claims ? (head: HTMLElement) => mark(element('span', 'section-mark'), 'Claimed', CLAIMS_HELP, head) : undefined;
    return disclosure('section', label, body, open, undefined, marker);
}

function fieldNodes(field: Field, inClaims: boolean): [HTMLElement, HTMLElement] {
    const dt = element('dt');
    const dd = element('dd');
    const help = field.help ?? helpFor(field.label);
    dt.append(help ? term(field.label, help, dd) : field.label);
    dd.append(valueNode(field.value));
    if (field.trust === 'Claimed' && !inClaims) dd.append(mark(element('span', 'claimed'), 'Claimed'));
    return [dt, dd];
}

/** The sections of an explanation: the instructions, each with its steps, then the rest under one disclosure. */
function sectionsNode(row: Row & { sections: Section[] }): DocumentFragment {
    // A section of claims (the simulated outcome) is shown by the lines on
    // the simulation instead, where a reader looks for it.
    const flagged = new Set((row.findings ?? []).map((f) => f.instruction).filter((i): i is number => i !== null));
    const steps = new Map<number, Section[]>();
    const instructions: Section[] = [];
    const rest: Section[] = [];
    for (const section of row.sections) {
        const kind = section.kind;
        if (kind.type === 'Instruction') {
            instructions.push(section);
        } else if (kind.type === 'Nested') {
            const parent = kind.value.parent;
            const list = steps.get(parent) ?? [];
            list.push(section);
            steps.set(parent, list);
        } else if (kind.type !== 'Claims') {
            rest.push(section);
        }
    }
    const fragment = document.createDocumentFragment();
    for (const section of instructions) {
        const index = sectionIndex(section) ?? -1;
        const children = (steps.get(index) ?? []).map((step) => sectionNode(step, !step.collapsed, []));
        fragment.append(sectionNode(section, !section.collapsed || flagged.has(index), children));
    }
    if (rest.length) {
        const body = element('div');
        for (const section of rest) body.append(sectionNode(section, !section.collapsed, []));
        fragment.append(disclosure('more', `Details: ${rest.map((s) => s.title.toLowerCase()).join(', ')}`, body, false));
    }
    return fragment;
}

/**
 * The instructions and the details behind one toggle, closed unless the
 * reader opened it last time: the summary and the effects say what the
 * transaction does, and this is the proof for whoever wants to check.
 */
function instructionsNode(row: Row & { sections: Section[] }, open: boolean): HTMLDivElement {
    const count = row.sections.filter((s) => s.kind.type === 'Instruction').length;
    const title = count === 0 ? 'Details' : count === 1 ? 'Instruction and details' : `Instructions (${count}) and details`;
    const body = element('div');
    body.append(sectionsNode(row));
    const remember = (shown: boolean) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
        chrome.storage.local.set({ showInstructions: shown }).catch(() => {});
    };
    return disclosure('instructions', title, body, open, remember);
}

export interface RenderOptions {
    showInstructions?: boolean;
    /** The level of the row's own headings, under the page's: the window has none between its title and the row. */
    heading?: 'h2' | 'h3';
}

/**
 * The body of one row: the summary, the findings, what it does, then the
 * instructions and the details behind a toggle (open when
 * `options.showInstructions`), then the text.
 */
export function renderRow(row: Row, options: RenderOptions = {}): HTMLDivElement {
    const body = element('div', 'explanation');
    if (row.error) {
        body.append(element('pre', '', row.error));
        return body;
    }
    if (row.summary) body.append(element('p', 'summary-line', row.summary));
    if (row.findings?.length) {
        const list = element('ul', 'findings');
        for (const finding of row.findings) {
            // An informational finding is a note, not a warning, and reads as one.
            const item = element('li', finding.severity.toLowerCase());
            item.append(element('span', `severity ${finding.severity.toLowerCase()}`, finding.severity), ' ', finding.message);
            list.append(item);
        }
        body.append(list);
    }
    const structured = Array.isArray(row.sections) && Array.isArray(row.effects);
    if (structured && row.effects?.length) {
        body.append(element(options.heading ?? 'h3', 'effects-title', 'What this does'));
        const list = element('ul', 'effects');
        for (const effect of row.effects) list.append(effectNode(effect));
        body.append(list);
    }
    if (structured && row.sections) body.append(instructionsNode({ ...row, sections: row.sections }, Boolean(options.showInstructions)));
    if (row.chain) {
        body.append(
            element('p', 'tables', `Chain: the page says ${row.chain}; read and simulated on the RPC in the settings all the same`),
        );
    }
    if (row.tables && row.tables !== 'none') body.append(element('p', 'tables', `Lookup tables: ${row.tables}`));
    if (row.simulation && row.simulation !== 'off') body.append(element('p', 'tables', `Simulation: ${row.simulation}`));
    if (row.hints?.length) {
        body.append(element('p', 'tables', `Unlisted tokens named from the RPC and the token list, unverified: ${row.hints.join(', ')}`));
    }
    // What the simulation found, under the line that says it ran.
    for (const section of structured && row.sections ? row.sections.filter((s) => s.kind.type === 'Claims') : []) {
        body.append(sectionNode(section, !section.collapsed, []));
    }
    const text = element('pre', '', row.text ?? '');
    if (structured) {
        const holder = element('div');
        holder.append(text);
        body.append(disclosure('full-text', 'Full text, as the engine prints it', holder, false));
    } else {
        body.append(text);
    }
    if (row.capture) {
        const save = element('a', 'save', 'Save the transaction');
        const stamp = new Date(row.capturedAt ?? Date.now()).toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
        save.download = `${stamp}-${(row.site ?? 'capture').replace(/[^a-zA-Z0-9.-]/g, '_')}.b64`;
        save.href = `data:text/plain;charset=utf-8,${encodeURIComponent(row.capture)}`;
        save.title = 'The transaction with its lookup tables, as the SignLens engine reads it';
        body.append(save);
    }
    return body;
}
