// Shared by the popup and the windows: how one row of a request is shown.
// A transaction explained is its summary, findings and effects first, the
// instructions and the engine's full text a click away; a transaction not
// explained says so, why, and what was read; a message is shown as it is;
// and a site asking, or a page naming an address, says what it asked.

import type { ExplainedRow, Row } from '../shared/model.ts';
import { short } from '../shared/text.ts';
import type { Address, Amount, Field, Message, Section, Severity, Trust, Value, WordedEffect } from '../shared/types.ts';
import { type Id, spoken, t } from '../shared/words.ts';
import { nodes } from './localize.ts';

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * A page's origin, as a node for a line that names it: the scheme muted,
 * the host in bold, so lookalike hosts read differently. The line is a
 * message the origin is an argument of (`nodes('window-where', { origin })`);
 * `asks`, after it, is for a caller with words of its own.
 */
export function originNode(origin: string | undefined, asks = ''): DocumentFragment {
    const node = document.createDocumentFragment();
    const match = /^(\w+:\/\/)(.*)$/.exec(origin ?? '');
    if (match) {
        node.append(element('span', 'scheme', match[1]), element('b', 'host', match[2]));
    } else {
        node.append(origin ?? t('window-unknown-page'));
    }
    node.append(asks);
    return node;
}

/** A finding's severity as the window words it: its own words, not the document's value with a capital made in code. */
const SEVERITY_WORD = {
    info: 'row-severity-info',
    warning: 'row-severity-warning',
    high: 'row-severity-high',
    critical: 'row-severity-critical',
} as const satisfies Record<Severity, Id>;

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
 * Appends the trust marker for `trust` to `node`: a verified value's badge,
 * or a claim's warning in words, as the engine's text marks a claim, each
 * a term. `help` replaces the marker's usual text and `host` is where the
 * help opens; otherwise it opens under the nearest value. A fact has none.
 */
function mark<T extends HTMLElement>(node: T, trust: Trust, help?: string, host?: HTMLElement): T {
    if (trust === 'verified') {
        node.append(badge(help ?? t('row-help-verified'), host));
    } else if (trust === 'claimed') {
        const warning = term(t('row-claimed'), help ?? t('row-help-claimed'), host);
        warning.classList.add('unverified');
        node.append(' ', warning);
    }
    return node;
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * A verified value's badge: a check in a ring, drawn rather than written,
 * so that no name can carry it, named "verified" for a screen reader; its
 * help opens as a term's does.
 */
function badge(help: string, host?: HTMLElement): HTMLButtonElement {
    const node = term('', help, host);
    node.classList.add('verified-badge');
    // Its name, and no title: a title would become its description while
    // the help is closed, where the help describes it while open.
    node.setAttribute('aria-label', t('row-verified'));
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    const ring = document.createElementNS(SVG, 'circle');
    ring.setAttribute('cx', '8');
    ring.setAttribute('cy', '8');
    ring.setAttribute('r', '6.5');
    const check = document.createElementNS(SVG, 'path');
    check.setAttribute('d', 'M5 8.2 7.1 10.3 11 6');
    svg.append(ring, check);
    node.append(svg);
    return node;
}

/** Digits grouped by thousands. */
function group(digits: string): string {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** An amount's quantity as the engine writes it: scaled by the asset's decimals, or raw units, grouped either way. */
export function quantity(amount: Amount): string {
    const decimals = amount.asset.decimals;
    let units: bigint;
    try {
        units = BigInt(amount.units);
    } catch {
        // Not a number: its words as they are, which pick no form.
        return t('row-raw-units', { units: amount.units, count: Number.NaN });
    }
    // The digits grouped here, as a 128-bit number may have more than a number can hold; the count picks the form.
    if (decimals === null || decimals === undefined) return t('row-raw-units', { units: group(units.toString()), count: Number(units) });
    const sign = units < 0n ? '-' : '';
    const magnitude = units < 0n ? -units : units;
    const scale = 10n ** BigInt(decimals);
    const integer = group((magnitude / scale).toString());
    const fraction = (magnitude % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${sign}${fraction ? `${integer}.${fraction}` : integer}`;
}

/** Basis points as the engine writes a percentage: grouped, with the decimals it has and no more ("0.5%", "100%"). */
export function percentText(bps: number): string {
    const digits = String(bps).padStart(3, '0');
    const fraction = digits.slice(-2).replace(/0+$/, '');
    return `${group(digits.slice(0, -2))}${fraction ? `.${fraction}` : ''}%`;
}

/** A duration as the engine writes it: its two largest units, the smaller left out when it is zero ("2 days 3 hours"). */
export function durationText(seconds: number): string {
    const [day, hour, minute] = [86_400, 3_600, 60];
    if (seconds >= day) return t('row-duration-days', { days: Math.floor(seconds / day), hours: Math.floor((seconds % day) / hour) });
    if (seconds >= hour)
        return t('row-duration-hours', { hours: Math.floor(seconds / hour), minutes: Math.floor((seconds % hour) / minute) });
    if (seconds >= minute)
        return t('row-duration-minutes', { minutes: Math.floor(seconds / minute), seconds: Math.floor(seconds % minute) });
    // Under a minute, and under a second, which only zero is: in seconds.
    return t('row-duration-seconds', { seconds: Math.floor(seconds) });
}

/** An amount as the engine's text writes it, as a node: the trust marker in it is a term. */
function amountNode(amount: Amount): HTMLSpanElement {
    const node = element('span', 'amount');
    // The engine's words for the amount, in the explanation's language; the
    // window words it itself only for an engine that sends none.
    if (amount.words) {
        node.append(messageNode(amount.words));
        mark(node, amount.asset.trust);
        // The note in the locale's brackets; an engine before them sends the note alone.
        if (amount.note_words) node.append(messageNode(amount.note_words));
        else if (amount.note) node.append(nodes('row-amount-note', { note: messageNode(amount.note) }));
        return node;
    }
    const asset = amount.asset;
    // An amount unlimited or not known has no quantity to write.
    const counted = amount.bound !== 'unlimited' && amount.bound !== 'unknown';
    const words = { bound: amount.bound, quantity: counted ? quantity(amount) : '' };
    // A token without a symbol is named by its description when its mint is
    // not known, or by its mint, shortened.
    if (asset.symbol) node.append(nodes('row-amount-symbol', { ...words, symbol: asset.symbol }));
    else {
        const token = asset.description ? messageNode(asset.description) : t('row-unverified-token', { mint: short(asset.id ?? '') });
        node.append(nodes('row-amount-token', { ...words, token }));
    }
    mark(node, asset.trust);
    if (amount.note) node.append(nodes('row-amount-note', { note: messageNode(amount.note) }));
    return node;
}

/**
 * An address as a node: its label in bold and its short form when it has
 * one. The signer's own is green, and its label says so in words ("Your
 * wallet"). Words stand in for an address the engine does not know (a
 * lookup table's slot it did not read), where the address would be.
 */
function addressNode(address: Address): HTMLSpanElement {
    const node = element('span', `address${address.is_self ? ' self' : ''}`);
    if (address.label && address.words) {
        // The engine's words for it: the label in bold and the address, in
        // the locale's brackets and order.
        for (const part of address.words.parts) {
            if (part.value?.type === 'words') node.append(element('b', '', part.value.value.text));
            else if (part.short) node.append(keyNode(address, true));
            else node.append(part.text);
        }
        mark(node, address.label_trust);
        return node;
    }
    const key = keyNode(address, address.label !== null);
    if (address.label) {
        node.append(nodes('row-labelled-address', { label: element('b', '', address.label.text), address: key }));
        mark(node, address.label_trust);
    } else {
        node.append(key);
    }
    return node;
}

/**
 * The address itself, its whole on hover; or the words that stand in for
 * it. Shortened when `shorten`, it is a button that shows the whole
 * address and the short form again, by click, tap or keyboard, so the
 * whole can be read and copied where there is no hover.
 */
function keyNode(address: Address, shorten: boolean): HTMLElement {
    if (address.address === null) return messageNode(address.stand_in, 'key');
    const whole = address.address;
    const abridged = short(whole);
    if (!shorten || abridged === whole) {
        const node = element('span', 'key', whole);
        node.title = whole;
        return node;
    }
    const node = button('key', abridged);
    node.title = whole;
    node.setAttribute('aria-expanded', 'false');
    node.addEventListener('click', () => {
        const open = node.getAttribute('aria-expanded') !== 'true';
        node.textContent = open ? whole : abridged;
        node.setAttribute('aria-expanded', String(open));
    });
    return node;
}

/**
 * A message as a node: its words as text, and each value it names with the
 * node the window has for that value, so an amount or an address reads the
 * same in a sentence as in a field. The words are the engine's.
 */
export function messageNode(message: Message | null, className = ''): HTMLSpanElement {
    const node = element('span', className);
    for (const part of message?.parts ?? []) {
        if (part.value) node.append(isolated(valueNode(part.value), part.value.type === 'amount' || part.value.type === 'address'));
        else if (part.short) node.append(isolated(keyNode(part.short, true), true));
        else if (part.emphasis) node.append(element('strong', 'emphasis', part.text));
        else node.append(part.text);
    }
    return node;
}

/**
 * A value set apart from the words around it, so that in a right-to-left
 * language an address or an amount cannot reorder the sentence (ADR-0015,
 * decision 8): in `<bdi>`, left to right for an address or an amount.
 */
function isolated(node: HTMLElement, leftToRight: boolean): HTMLElement {
    const bdi = element('bdi');
    if (leftToRight) bdi.dir = 'ltr';
    bdi.append(node);
    return bdi;
}

/** A field's value as a node. */
function valueNode(value: Value): HTMLElement {
    switch (value.type) {
        case 'text':
        case 'integer':
            return element('span', '', value.value);
        case 'words':
            return messageNode(value.value);
        case 'amount':
            return amountNode(value.value);
        case 'address':
            return addressNode(value.value);
        case 'basis_points':
            return element('span', '', percentText(value.value));
        case 'duration':
            return element('span', '', durationText(value.value));
        case 'timestamp':
            return element('span', '', new Date(value.value * 1000).toLocaleString());
        case 'bytes':
            return bytesNode(value.value);
        case 'bool':
            return element('span', '', value.value ? t('row-yes') : t('row-no'));
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
            return element('span', 'unrecognized', t('row-unrecognized-value', { type: value.value.type }));
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
    const all = t('row-bytes-show-all', { count: hex.length / 2 });
    const more = button('more-bytes', all);
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => {
        const clamped = code.classList.toggle('clamped');
        more.textContent = clamped ? all : t('row-bytes-show-less');
        more.setAttribute('aria-expanded', String(!clamped));
    });
    node.append(code, more);
    return node;
}

/**
 * One effect, as the engine words it: in the second person where the signer
 * is the one it happens to, with the amounts and addresses it names laid out
 * as the fields lay them out. An effect of a type this version does not know
 * is shown by its words too.
 */
function effectNode(effect: WordedEffect): HTMLLIElement {
    const li = element('li', `effect ${effect.type.toLowerCase()}`);
    li.append(messageNode(effect.message));
    return li;
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
    const title =
        section.kind.type === 'nested' && index !== null
            ? t('row-step', { index: index + 1, title: section.title.text })
            : section.title.text;
    label.append(element('span', 'section-title', title));
    if (section.subtitle) label.append(' ', element('span', 'section-subtitle', section.subtitle.text));
    const claims = section.kind.type === 'claims';
    const body = element('div');
    const fields = element('dl', 'fields');
    for (const field of section.fields) fields.append(...fieldNodes(field, claims));
    body.append(fields);
    for (const child of nested) body.append(child);
    // A section of claims says so once, beside its toggle; its rows are not marked again.
    const marker = claims ? (head: HTMLElement) => mark(element('span', 'section-mark'), 'claimed', t('row-help-claims'), head) : undefined;
    return disclosure('section', label, body, open, undefined, marker);
}

function fieldNodes(field: Field, inClaims: boolean): [HTMLElement, HTMLElement] {
    const dt = element('dt');
    const dd = element('dd');
    // The engine's help: a descriptor's for its labels, the engine's own for its fixed ones.
    const help = field.help?.text;
    dt.append(help ? term(field.label.text, help, dd) : field.label.text);
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
        // The titles as the engine words them: changing their case in code would be wrong in a language with other rules (ADR-0015).
        const titles = rest.map((s) => s.title.text).join(t('row-list-separator'));
        fragment.append(disclosure('more', t('row-details-toggle', { sections: titles }), body, false));
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
    const title = t('row-instructions-toggle', { count });
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
    /**
     * In the window, which explains a request again itself: a transaction
     * SignLens could not explain says so without sending the user back to
     * the site, and holds this, its "Try again", when it is one.
     */
    again?: HTMLElement | true;
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
                // The window asks again itself; elsewhere the site is asked again.
                body.append(element('p', 'not-checked', options.again ? t('row-not-explained') : t('row-not-explained-ask-again')));
            }
            // What went wrong, then what can be done about it.
            body.append(element('pre', '', row.said ? spoken(row.said) : row.error));
            if (row.scope === 'transaction' && options.again instanceof HTMLElement) body.append(options.again);
            body.append(...readNotes(row));
            if (row.capture) body.append(saveLink(row.capture, options));
            return body;
        case 'message':
            body.append(element('p', 'tables', t('row-message-unchecked')), element('pre', '', row.text));
            return body;
        case 'consent':
            // The row's line already says who asked to see which address.
            body.append(element('p', '', t('row-consent-where')));
            return body;
        case 'address': {
            body.append(element('p', '', t('row-address-claimed')));
            for (const address of row.claimed) {
                const line = element('p');
                line.append(element('code', 'watched', address));
                body.append(line);
            }
            body.append(element('p', '', t('row-address-refused')));
            return body;
        }
        case 'explained':
            return explainedNode(body, row, options);
    }
}

/** What was read for a transaction besides its bytes: the chain the page named, when not mainnet, and the lookup tables. */
function readNotes(row: { chain?: string | undefined; tables?: string | null | undefined }): HTMLParagraphElement[] {
    const notes: HTMLParagraphElement[] = [];
    if (row.chain) notes.push(element('p', 'tables', t('row-chain', { chain: row.chain })));
    if (row.tables) notes.push(element('p', 'tables', t('row-tables', { tables: row.tables })));
    return notes;
}

/** A link that saves `capture`, the transaction as the engine reads it; one of several is numbered, so none is saved over another. */
function saveLink(capture: string, options: RenderOptions): HTMLAnchorElement {
    const save = element('a', 'save', options.part ? t('row-save-numbered', { part: options.part }) : t('row-save'));
    save.download = captureName(options.site, options.capturedAt ?? Date.now(), options.part);
    save.href = `data:text/plain;charset=utf-8,${encodeURIComponent(capture)}`;
    save.title = t('row-save-title');
    return save;
}

/** The file a transaction is saved to: its time, the site in letters, digits, dots and hyphens only, and which `part` of a request it is. */
export function captureName(site: string | undefined, at: number, part?: number): string {
    const stamp = new Date(at).toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
    return `${stamp}-${(site ?? 'capture').replace(/[^a-zA-Z0-9.-]/g, '_')}${part ? `-${part}` : ''}.b64`;
}

function explainedNode(body: HTMLDivElement, row: ExplainedRow, options: RenderOptions): HTMLDivElement {
    // The explanation's language and direction, which its words and their layout follow.
    if (row.locale) {
        body.lang = row.locale.used;
        body.dir = row.locale.direction;
    }
    // The summary, its actions and the findings lay out what they name, as the effects do.
    const actions = row.actions ?? [];
    if (actions.length > 1) {
        // Several actions are one line each, under their count, where the summary runs them together.
        body.append(element('p', 'summary-line', t('row-actions', { count: actions.length })));
        const list = element('ol', 'actions');
        for (const action of actions) {
            const item = element('li');
            item.append(messageNode(action.summary));
            list.append(item);
        }
        body.append(list);
    } else {
        const line = element('p', 'summary-line');
        line.append(messageNode(row.summary));
        body.append(line);
    }
    if (row.findings.length) {
        body.append(element(options.heading ?? 'h3', 'effects-title', t('row-findings-title')));
        const list = element('ul', 'findings');
        for (const finding of row.findings) {
            // An informational finding is a note, not a warning, and reads as one.
            const item = element('li', finding.severity);
            item.append(
                element('span', `severity ${finding.severity}`, t(SEVERITY_WORD[finding.severity])),
                ' ',
                messageNode(finding.message),
            );
            list.append(item);
        }
        body.append(list);
    }
    if (row.effects.length) {
        body.append(element(options.heading ?? 'h3', 'effects-title', t('row-effects-title')));
        const list = element('ul', 'effects');
        for (const effect of row.effects) list.append(effectNode(effect));
        body.append(list);
    }
    // A row slimmed to fit the history has no instructions left: no toggle with nothing behind it.
    if (row.sections.length > 0) body.append(instructionsNode(row, options));
    body.append(...readNotes(row));
    if (row.simulation !== null) body.append(element('p', 'tables', t('row-simulation', { simulation: row.simulation })));
    if (row.accounts?.length) {
        body.append(element('p', 'tables', t('row-accounts', { accounts: row.accounts.join(t('row-list-separator')) })));
    }
    if (row.hints.length) {
        body.append(element('p', 'tables', t('row-hints', { tokens: row.hints.join(t('row-list-separator')) })));
    }
    // What the simulation found, under the line that says it ran.
    for (const section of row.sections.filter((s) => s.kind.type === 'claims')) {
        body.append(sectionNode(section, !section.collapsed, []));
    }
    const holder = element('div');
    holder.append(element('pre', '', row.text));
    body.append(disclosure('full-text', t('row-full-text'), holder, false));
    // A row slimmed to fit the history has no bytes left to save.
    if (row.capture) body.append(saveLink(row.capture, options));
    return body;
}
