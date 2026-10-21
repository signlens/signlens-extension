// Shared by the popup and the windows: how one row of a request is shown.
// A transaction explained is its summary, findings and effects first, the
// instructions and the engine's full text a click away; a transaction not
// explained says so, why, and what was read; a message is shown as it is;
// and a site asking, or a page naming an address, says what it asked.

import type { ExplainedRow, Row } from '../shared/model.ts';
import { short } from '../shared/text.ts';
import type { Address, Amount, Bound, Effect, Field, Section, Trust, Value } from '../shared/types.ts';

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
const MARKER: Record<Trust, string> = { fact: '', verified: ' (verified)', claimed: ' (claimed, unverified)' };

/** What a trust marker means, for a reader who opens it. */
const MARKER_HELP: Partial<Record<Trust, string>> = {
    verified:
        'This name comes from SignLens or from you: its reviewed descriptors, its verified token list, your addresses in its settings, or your address book. The site could not have supplied it.',
    claimed:
        'This came from the site or from the RPC the extension asked, not from the transaction itself. SignLens could not check it, so do not rely on it.',
};

/** What the marker on a whole section of claims means. */
const CLAIMS_HELP =
    'Everything in this section came from the RPC the extension asked, not from the transaction itself. SignLens could not check it, so treat it as a hint, not a fact.';

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

/** How many help notes this page has made, for their ids. */
let notes = 0;

/**
 * A term the reader can open: a button whose help appears as a note under
 * the value it sits in (`host`, or the nearest field, item or paragraph)
 * and goes away the same way. The button names the note it controls, and
 * while it is open is described by it, so a screen reader on the button
 * reads the help.
 */
function term(text: string, help: string, host?: HTMLElement): HTMLButtonElement {
    const node = button('term', text);
    node.setAttribute('aria-expanded', 'false');
    let note: HTMLElement | null = null;
    node.addEventListener('click', (event) => {
        // A term in a disclosure's head is its own control, not the head's.
        event.stopPropagation();
        if (note) {
            note.hidden = !note.hidden;
        } else {
            notes += 1;
            note = element('div', 'help-note', help);
            note.id = `help-${notes}`;
            node.setAttribute('aria-controls', note.id);
            (host ?? node.closest('dd, li, p') ?? node.parentElement)?.append(note);
        }
        node.setAttribute('aria-expanded', String(!note.hidden));
        if (note.hidden) node.removeAttribute('aria-describedby');
        else node.setAttribute('aria-describedby', note.id);
    });
    return node;
}

/**
 * Appends the trust marker for `trust` to `node`, as a term, when there is
 * one. `help` replaces the marker's usual text and `host` is where the
 * help opens; otherwise it opens under the nearest value.
 */
function mark<T extends HTMLElement>(node: T, trust: Trust, help?: string, host?: HTMLElement): T {
    const marker = MARKER[trust];
    if (marker) node.append(' ', term(marker.trim(), help ?? MARKER_HELP[trust] ?? '', host));
    return node;
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

const PREFIX: Record<Bound, string> = { exact: '', at_least: '≥ ', at_most: '≤ ', unlimited: 'UNLIMITED ', unknown: 'unknown amount of ' };

/** An amount as the engine's text writes it, as a node: the trust marker in it is a term. */
function amountNode(amount: Amount): HTMLSpanElement {
    const node = element('span', 'amount');
    const prefix = PREFIX[amount.bound];
    const asset = amount.asset;
    if ((amount.bound === 'unlimited' || amount.bound === 'unknown') && asset.symbol) node.append(`${prefix}${asset.symbol}`);
    else if (amount.bound === 'unlimited') node.append('UNLIMITED unverified token');
    else if (amount.bound === 'unknown') node.append('unknown amount of an unverified token');
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
function addressNode(address: Address): HTMLSpanElement {
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
function valueNode(value: Value): HTMLElement {
    switch (value.type) {
        case 'text':
        case 'integer':
            return element('span', '', value.value);
        case 'amount':
            return amountNode(value.value);
        case 'address':
            return addressNode(value.value);
        case 'basis_points':
            return element('span', '', `${(value.value / 100).toFixed(2)}%`);
        case 'duration':
            return element('span', '', `${value.value} seconds`);
        case 'timestamp':
            return element('span', '', new Date(value.value * 1000).toLocaleString());
        case 'bytes':
            return bytesNode(value.value);
        case 'bool':
            return element('span', '', value.value ? 'yes' : 'no');
        case 'list': {
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
function effectNode(effect: Effect): HTMLLIElement {
    const li = element('li', `effect ${effect.type.toLowerCase()}`);
    switch (effect.type) {
        case 'transfer': {
            const v = effect.value;
            if (v.from.is_self && !v.to.is_self)
                return append(li, 'You send ', amountNode(v.amount), ' from ', addressNode(v.from), ' to ', addressNode(v.to));
            if (v.to.is_self && !v.from.is_self)
                return append(li, 'You receive ', amountNode(v.amount), ' into ', addressNode(v.to), ' from ', addressNode(v.from));
            return append(li, 'Transfer ', amountNode(v.amount), ' from ', addressNode(v.from), ' to ', addressNode(v.to));
        }
        case 'burn': {
            const v = effect.value;
            return append(li, v.account.is_self ? 'You burn ' : 'Burn ', amountNode(v.amount), ' from ', addressNode(v.account));
        }
        case 'authority_change': {
            const v = effect.value;
            return v.new_authority
                ? append(li, `Give the ${v.authority} authority over `, addressNode(v.subject), ' to ', addressNode(v.new_authority))
                : append(li, `Permanently remove the ${v.authority} authority over `, addressNode(v.subject));
        }
        case 'delegate': {
            const v = effect.value;
            return append(li, 'Allow ', addressNode(v.delegate), ' to spend ', amountNode(v.amount), ' from ', addressNode(v.subject));
        }
        case 'revoke': {
            const v = effect.value;
            return append(li, 'Revoke the delegate on ', addressNode(v.subject));
        }
        case 'create': {
            const v = effect.value;
            append(li, 'Create ', addressNode(v.account), ' owned by ', addressNode(v.owner));
            if (v.deposit) append(li, ', depositing ', amountNode(v.deposit));
            if (v.if_missing) li.append(' unless it already exists');
            return li;
        }
        case 'close': {
            const v = effect.value;
            return append(li, 'Close ', addressNode(v.account), ' and send its balance to ', addressNode(v.destination));
        }
        case 'fee': {
            const v = effect.value;
            return v.payer.is_self
                ? append(li, 'You pay a fee of ', amountNode(v.amount))
                : append(li, addressNode(v.payer), ' pays a fee of ', amountNode(v.amount));
        }
        case 'lifetime': {
            const v = effect.value;
            return v.type === 'durable_nonce'
                ? append(li, 'Valid FOREVER until nonce account ', addressNode(v.value.nonce_account), ' is advanced (durable nonce)')
                : append(li, 'Valid for about a minute (recent blockhash)');
        }
        case 'proposed': {
            const inner = effectNode(effect.value.effect);
            inner.className = 'effect proposed';
            inner.prepend('Once approved, ', addressNode(effect.value.by), ' would: ');
            return inner;
        }
        case 'other':
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
function disclosure(
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
    return kind.type === 'instruction' || kind.type === 'nested' ? kind.value.index : null;
}

/** A section as a disclosure: its title, its subtitle, and its fields as a definition list. */
function sectionNode(section: Section, open: boolean, nested: HTMLElement[]): HTMLDivElement {
    const label = element('span', 'section-head');
    const index = sectionIndex(section);
    const title = section.kind.type === 'nested' && index !== null ? `Step ${index + 1}: ${section.title}` : section.title;
    label.append(element('span', 'section-title', title));
    if (section.subtitle) label.append(' ', element('span', 'section-subtitle', section.subtitle));
    const claims = section.kind.type === 'claims';
    const body = element('div');
    const fields = element('dl', 'fields');
    for (const field of section.fields) fields.append(...fieldNodes(field, claims));
    body.append(fields);
    for (const child of nested) body.append(child);
    // A section of claims says so once, beside its toggle; its rows are not marked again.
    const marker = claims ? (head: HTMLElement) => mark(element('span', 'section-mark'), 'claimed', CLAIMS_HELP, head) : undefined;
    return disclosure('section', label, body, open, undefined, marker);
}

function fieldNodes(field: Field, inClaims: boolean): [HTMLElement, HTMLElement] {
    const dt = element('dt');
    const dd = element('dd');
    const help = field.help ?? helpFor(field.label);
    dt.append(help ? term(field.label, help, dd) : field.label);
    dd.append(valueNode(field.value));
    if (field.trust === 'claimed' && !inClaims) dd.append(mark(element('span', 'claimed'), 'claimed'));
    return [dt, dd];
}

/** The sections of an explanation: the instructions, each with its steps, then the rest under one disclosure. */
function sectionsNode(row: ExplainedRow): DocumentFragment {
    // A section of claims (the simulated outcome) is shown by the lines on
    // the simulation instead, where a reader looks for it.
    const flagged = new Set(row.findings.map((f) => f.instruction).filter((i): i is number => i !== null));
    const steps = new Map<number, Section[]>();
    const instructions: Section[] = [];
    const rest: Section[] = [];
    for (const section of row.sections) {
        const kind = section.kind;
        if (kind.type === 'instruction') {
            instructions.push(section);
        } else if (kind.type === 'nested') {
            const parent = kind.value.parent;
            const list = steps.get(parent) ?? [];
            list.push(section);
            steps.set(parent, list);
        } else if (kind.type !== 'claims') {
            rest.push(section);
        }
    }
    const fragment = document.createDocumentFragment();
    for (const section of instructions) {
        const index = sectionIndex(section) ?? -1;
        const children = (steps.get(index) ?? []).map((step) => sectionNode(step, !step.collapsed, []));
        steps.delete(index);
        fragment.append(sectionNode(section, !section.collapsed || flagged.has(index), children));
    }
    // A step whose instruction the explanation does not have is still shown, after the instructions: never left out.
    for (const stray of steps.values()) for (const step of stray) fragment.append(sectionNode(step, !step.collapsed, []));
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
function instructionsNode(row: ExplainedRow, options: RenderOptions): HTMLDivElement {
    const count = row.sections.filter((s) => s.kind.type === 'instruction').length;
    const title = count === 0 ? 'Details' : count === 1 ? 'Instruction and details' : `Instructions (${count}) and details`;
    const body = element('div');
    body.append(sectionsNode(row));
    return disclosure('instructions', title, body, Boolean(options.showInstructions), options.onShowInstructions);
}

interface RenderOptions {
    showInstructions?: boolean;
    /** Hears the reader open or close the instructions, to remember for next time. */
    onShowInstructions?: (shown: boolean) => void;
    /** The level of the row's own headings, under the page's: the window has none between its title and the row. */
    heading?: 'h2' | 'h3';
    /** When the transaction was captured, and from which site: what a saved file is named by. */
    capturedAt?: number;
    site?: string;
    /** Which of several transactions of a request this is, from 1: its save link and file are numbered by it. */
    part?: number;
}

/**
 * The body of one row: for a transaction explained, the summary, the
 * findings, what it does, then the instructions and the details behind a
 * toggle (open when `options.showInstructions`), the notes on what was
 * read, and the full text; for a transaction SignLens could not explain,
 * that nothing is known of it, why, and what was read; for anything else,
 * what there is to say.
 */
export function renderRow(row: Row, options: RenderOptions = {}): HTMLDivElement {
    const body = element('div', 'explanation');
    switch (row.kind) {
        case 'failed':
            if (row.scope === 'transaction') {
                body.append(
                    element(
                        'p',
                        'not-checked',
                        'SignLens could not explain this transaction: nothing is known of what it does. To try again, Reject and ask the site again.',
                    ),
                );
            }
            body.append(element('pre', '', row.error), ...readNotes(row));
            if (row.capture) body.append(saveLink(row.capture, options));
            return body;
        case 'message':
            body.append(
                element(
                    'p',
                    'tables',
                    'SignLens does not check messages: this one is shown as it is. Sign it only if you mean what it says.',
                ),
                element('pre', '', row.text),
            );
            return body;
        case 'consent':
            // The row's line already says who asked to see which address.
            body.append(
                element('p', '', 'The sites allowed to see the watched address are listed in the settings, where Revoke takes one back.'),
            );
            return body;
        case 'address': {
            body.append(element('p', '', 'The page named as yours an address that is not one of yours in SignLens:'));
            for (const address of row.claimed) {
                const line = element('p');
                line.append(element('code', 'watched', address));
                body.append(line);
            }
            body.append(element('p', '', 'The request was refused before anything was explained or sent anywhere.'));
            return body;
        }
        case 'explained':
            return explainedNode(body, row, options);
    }
}

/** What was read for a transaction besides its bytes: the chain the page named, when not mainnet, and the lookup tables. */
function readNotes(row: { chain?: string | undefined; tables?: string | null | undefined }): HTMLParagraphElement[] {
    const notes: HTMLParagraphElement[] = [];
    if (row.chain) {
        notes.push(element('p', 'tables', `Chain: the page says ${row.chain}; read and simulated on the RPC in the settings all the same`));
    }
    if (row.tables) notes.push(element('p', 'tables', `Lookup tables: ${row.tables}`));
    return notes;
}

/** A link that saves `capture`, the transaction as the engine reads it; one of several is numbered, so none is saved over another. */
function saveLink(capture: string, options: RenderOptions): HTMLAnchorElement {
    const save = element('a', 'save', options.part ? `Save transaction ${options.part}` : 'Save the transaction');
    save.download = captureName(options.site, options.capturedAt ?? Date.now(), options.part);
    save.href = `data:text/plain;charset=utf-8,${encodeURIComponent(capture)}`;
    save.title = 'The transaction with its lookup tables, as the SignLens engine reads it';
    return save;
}

/** The file a transaction is saved to: its time, the site in letters, digits, dots and hyphens only, and which `part` of a request it is. */
export function captureName(site: string | undefined, at: number, part?: number): string {
    const stamp = new Date(at).toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
    return `${stamp}-${(site ?? 'capture').replace(/[^a-zA-Z0-9.-]/g, '_')}${part ? `-${part}` : ''}.b64`;
}

function explainedNode(body: HTMLDivElement, row: ExplainedRow, options: RenderOptions): HTMLDivElement {
    body.append(element('p', 'summary-line', row.summary));
    if (row.findings.length) {
        body.append(element(options.heading ?? 'h3', 'effects-title', 'What SignLens found'));
        const list = element('ul', 'findings');
        for (const finding of row.findings) {
            // An informational finding is a note, not a warning, and reads as one.
            const item = element('li', finding.severity);
            // Shown as a word with a capital (High); the document's value is lowercase.
            const severity = finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1);
            item.append(element('span', `severity ${finding.severity}`, severity), ' ', finding.message);
            list.append(item);
        }
        body.append(list);
    }
    if (row.effects.length) {
        body.append(element(options.heading ?? 'h3', 'effects-title', 'What this does'));
        const list = element('ul', 'effects');
        for (const effect of row.effects) list.append(effectNode(effect));
        body.append(list);
    }
    // A row slimmed to fit the history has no instructions left: no toggle with nothing behind it.
    if (row.sections.length > 0) body.append(instructionsNode(row, options));
    body.append(...readNotes(row));
    if (row.simulation !== null) body.append(element('p', 'tables', `Simulation: ${row.simulation}`));
    if (row.hints.length) {
        body.append(element('p', 'tables', `Unlisted tokens named from the RPC and the token list, unverified: ${row.hints.join(', ')}`));
    }
    // What the simulation found, under the line that says it ran.
    for (const section of row.sections.filter((s) => s.kind.type === 'claims')) {
        body.append(sectionNode(section, !section.collapsed, []));
    }
    const holder = element('div');
    holder.append(element('pre', '', row.text));
    body.append(disclosure('full-text', 'Full text, as the engine prints it', holder, false));
    // A row slimmed to fit the history has no bytes left to save.
    if (row.capture) body.append(saveLink(row.capture, options));
    return body;
}
