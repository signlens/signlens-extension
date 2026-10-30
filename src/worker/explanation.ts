// The explanation document as this version reads it. What the API answers
// (and later what the engine returns) is checked here field by field
// against types.ts and comes out typed, so nothing past this point casts.
// A document that does not hold together is refused with the path of what
// is wrong, and the window shows it as an error, never as a pass. A `type`
// this version does not know becomes `Unrecognized`, which the window says
// it cannot show; an unknown verdict, trust, severity or bound is refused,
// since the window would have to guess what it means. Text comes through
// without what would hide or reorder it (text.ts): it can carry what a
// transaction says of itself, a memo or a token's name. A message is read
// as strictly: its identifier, each part's words and the value or address
// it names, and its text.

import { isAddress } from '../shared/base58.ts';
import { withoutControls } from '../shared/text.ts';
import {
    type Action,
    type Address,
    type Amount,
    type Asset,
    BOUNDS,
    type Effect,
    type Explanation,
    type Field,
    type Finding,
    type Lifetime,
    type Message,
    type Part,
    type Raw,
    type Review,
    SEVERITIES,
    type Section,
    type SectionKind,
    TRUSTS,
    type Value,
    VERDICTS,
    type WantedAccount,
    type WordedEffect,
    type WordedIn,
} from '../shared/types.ts';

export const EXPLANATION_SCHEMA = 'signlens-explanation/2';

/** How deep messages, lists and proposed effects may nest. */
const MAX_DEPTH = 16;
/** How many parts a message may hold. */
const MAX_PARTS = 200;
/**
 * A message's identifier: the engine's, as its Fluent files name it (`effect-send`, `label-total.help`), or a
 * descriptor's, its program's address and the identifier of its place there (`JUP6…TaV4/route_v2-summary-absent`).
 */
const MESSAGE_ID = /^(?:[1-9A-HJ-NP-Za-km-z]{32,44}\/[a-z][a-z0-9_.-]*|[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)?)$/;
/** The longest identifier: a program's address and the engine's longest identifier of a place, 160 bytes. */
const MAX_ID = 205;
/** How many items a list of findings, sections, fields or effects may hold. */
const MAX_ITEMS = 500;
/** The longest string, other than the full text. */
const MAX_TEXT = 10_000;
/** The longest full text. */
const MAX_FULL_TEXT = 1_000_000;

/** What is wrong with a document, and where. */
export class DocumentError extends Error {
    readonly path: string;

    constructor(path: string, problem: string) {
        super(`${path} ${problem}`);
        this.path = path;
    }
}

type Read<T> = (value: unknown, path: string) => T;

function fail(path: string, problem: string): never {
    throw new DocumentError(path, problem);
}

/** A value as an error message quotes it: short, whatever it is. */
function quote(value: unknown): string {
    // A list or an object by its kind only: writing out one nested deep enough overflows the stack.
    if (Array.isArray(value)) return 'a list';
    if (typeof value === 'object' && value !== null) return 'an object';
    const text = JSON.stringify(value) ?? String(value);
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/** An object of the document, read key by key, each at its own path. */
class Fields {
    readonly #object: Readonly<Record<string, unknown>>;
    readonly #path: string;

    constructor(value: unknown, path: string) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'is not an object');
        this.#object = value as Record<string, unknown>;
        this.#path = path;
    }

    read<T>(key: string, read: Read<T>): T {
        return read(Object.hasOwn(this.#object, key) ? this.#object[key] : undefined, `${this.#path}.${key}`);
    }
}

const text =
    (max = MAX_TEXT): Read<string> =>
    (value, path) => {
        if (typeof value !== 'string') return fail(path, 'is not a string');
        if (value.length > max) fail(path, `is longer than ${max} characters`);
        return withoutControls(value);
    };

const flag: Read<boolean> = (value, path) => (typeof value === 'boolean' ? value : fail(path, 'is not true or false'));

const finite: Read<number> = (value, path) => (typeof value === 'number' && Number.isFinite(value) ? value : fail(path, 'is not a number'));

const integer =
    (min: number, max: number): Read<number> =>
    (value, path) =>
        typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
            ? value
            : fail(path, `is not a whole number from ${min} to ${max}`);

/** A 128-bit integer, as the engine writes one: a decimal string. */
const decimal: Read<string> = (value, path) =>
    typeof value === 'string' && /^-?\d{1,40}$/.test(value) ? value : fail(path, 'is not a decimal integer');

const hex =
    (max: number): Read<string> =>
    (value, path) =>
        typeof value === 'string' && value.length <= max && /^(?:[0-9a-f]{2})*$/.test(value) ? value : fail(path, 'is not lowercase hex');

/** One of `allowed`; anything else is refused as not something this version knows. */
const oneOf =
    <T extends string>(allowed: readonly T[], what: string): Read<T> =>
    (value, path) => {
        const found = allowed.find((option) => option === value);
        return found ?? fail(path, `${quote(value)} is not ${what} this version knows`);
    };

const nullable =
    <T>(read: Read<T>): Read<T | null> =>
    (value, path) =>
        value === null ? null : read(value, path);

const list =
    <T>(read: Read<T>, max = MAX_ITEMS): Read<T[]> =>
    (value, path) => {
        if (!Array.isArray(value)) return fail(path, 'is not a list');
        if (value.length > max) fail(path, `holds more than ${max} items`);
        return value.map((item, i) => read(item, `${path}[${i}]`));
    };

/** The `type` of a tagged variant, and its fields. */
function variant(value: unknown, path: string): { type: string; fields: Fields } {
    const fields = new Fields(value, path);
    return { type: fields.read('type', text(100)), fields };
}

const unrecognized = (type: string) => ({ type: 'Unrecognized' as const, value: { type } });

/** A message, `max` the longest its text may be: an identifier or null, its parts and their text. */
function messageAt(depth: number, max = MAX_TEXT): Read<Message> {
    return (value, path) => {
        if (depth >= MAX_DEPTH) fail(path, 'is nested too deep');
        const o = new Fields(value, path);
        const id = o.read('id', nullable(text(MAX_ID)));
        if (id !== null && !MESSAGE_ID.test(id)) fail(`${path}.id`, `${quote(id)} is not a message identifier`);
        return {
            id,
            parts: o.read('parts', list(partAt(depth + 1, max), MAX_PARTS)),
            text: o.read('text', text(max)),
        };
    };
}

/** A part of a message: words, and the value or the short address it names, never both. */
function partAt(depth: number, max: number): Read<Part> {
    return (value, path) => {
        const o = new Fields(value, path);
        const part: Part = { text: o.read('text', text(max)) };
        const named = o.read('value', (v, p) => (v === undefined ? undefined : valueAt(depth)(v, p)));
        const short = o.read('short', (v, p) => (v === undefined ? undefined : addressAt(depth)(v, p)));
        if (named !== undefined && short !== undefined) fail(path, 'names both a value and an address');
        if (named !== undefined) part.value = named;
        if (short !== undefined) part.short = short;
        return part;
    };
}

/** An address, or the words that stand in for one the engine does not know: never neither. */
function addressAt(depth: number): Read<Address> {
    return (value, path) => {
        const o = new Fields(value, path);
        const address: Address = {
            address: o.read('address', nullable(text(100))),
            label: o.read('label', nullable(messageAt(depth, 200))),
            label_trust: o.read('label_trust', oneOf(TRUSTS, 'a trust')),
            is_self: o.read('is_self', flag),
            stand_in: o.read('stand_in', nullable(messageAt(depth, 200))),
        };
        if (address.address === null && address.stand_in === null) fail(`${path}.address`, 'is null, and nothing stands in for it');
        return address;
    };
}

/** A token, by its id or, when its mint is not known, by its description: never neither. */
function assetAt(depth: number): Read<Asset> {
    return (value, path) => {
        const o = new Fields(value, path);
        const asset: Asset = {
            id: o.read('id', nullable(text(100))),
            symbol: o.read('symbol', nullable(text(100))),
            // A mint keeps its decimals in one byte.
            decimals: o.read('decimals', nullable(integer(0, 255))),
            trust: o.read('trust', oneOf(TRUSTS, 'a trust')),
            description: o.read('description', nullable(messageAt(depth, 200))),
        };
        if (asset.id === null && asset.description === null) fail(`${path}.id`, 'is null, and nothing describes the token');
        return asset;
    };
}

function amountAt(depth: number): Read<Amount> {
    return (value, path) => {
        const o = new Fields(value, path);
        return {
            units: o.read('units', decimal),
            asset: o.read('asset', assetAt(depth)),
            bound: o.read('bound', oneOf(BOUNDS, 'a bound')),
            note: o.read('note', nullable(messageAt(depth, 500))),
        };
    };
}

const address = addressAt(0);
const amount = amountAt(0);

function valueAt(depth: number): Read<Value> {
    return (input, path) => {
        const { type, fields: o } = variant(input, path);
        switch (type) {
            case 'text':
                return { type, value: o.read('value', text()) };
            case 'words':
                return { type, value: o.read('value', messageAt(depth)) };
            case 'amount':
                return { type, value: o.read('value', amountAt(depth)) };
            case 'address':
                return { type, value: o.read('value', addressAt(depth)) };
            case 'integer':
                return { type, value: o.read('value', decimal) };
            case 'basis_points':
            case 'duration':
            case 'timestamp':
                return { type, value: o.read('value', finite) };
            case 'bytes':
                return { type, value: o.read('value', hex(MAX_TEXT)) };
            case 'bool':
                return { type, value: o.read('value', flag) };
            case 'list':
                if (depth >= MAX_DEPTH) fail(path, 'is nested too deep');
                return { type, value: o.read('value', list(valueAt(depth + 1))) };
            default:
                return unrecognized(type);
        }
    };
}

const field: Read<Field> = (value, path) => {
    const o = new Fields(value, path);
    return {
        label: o.read('label', messageAt(0, 200)),
        value: o.read('value', valueAt(0)),
        trust: o.read('trust', oneOf(TRUSTS, 'a trust')),
        help: o.read('help', nullable(messageAt(0, 2_000))),
    };
};

const index = integer(0, 10_000);

const sectionKind: Read<SectionKind> = (value, path) => {
    const { type, fields: o } = variant(value, path);
    switch (type) {
        case 'summary':
        case 'housekeeping':
        case 'signers':
        case 'fees':
        case 'lifetime':
        case 'claims':
        case 'raw':
            return { type };
        case 'instruction':
            return { type, value: o.read('value', (v, p) => ({ index: new Fields(v, p).read('index', index) })) };
        case 'nested':
            return {
                type,
                value: o.read('value', (v, p) => {
                    const nested = new Fields(v, p);
                    return { parent: nested.read('parent', index), index: nested.read('index', index) };
                }),
            };
        default:
            return unrecognized(type);
    }
};

const section: Read<Section> = (value, path) => {
    const o = new Fields(value, path);
    return {
        kind: o.read('kind', sectionKind),
        title: o.read('title', messageAt(0, 200)),
        subtitle: o.read('subtitle', nullable(messageAt(0, 500))),
        fields: o.read('fields', list(field)),
        collapsed: o.read('collapsed', flag),
    };
};

/** How long a signature stays usable. Not open to new variants: the window would read one as "about a minute". */
const lifetime: Read<Lifetime> = (value, path) => {
    const { type, fields: o } = variant(value, path);
    switch (type) {
        case 'recent_blockhash':
            return { type };
        case 'durable_nonce':
            return { type, value: o.read('value', (v, p) => ({ nonce_account: new Fields(v, p).read('nonce_account', address) })) };
        default:
            return fail(`${path}.type`, `${quote(type)} is not a lifetime this version knows`);
    }
};

function effectAt(depth: number): Read<Effect> {
    return (input, path) => {
        const { type, fields: o } = variant(input, path);
        const value = <T>(read: (fields: Fields) => T): T => o.read('value', (v, p) => read(new Fields(v, p)));
        switch (type) {
            case 'transfer':
                return {
                    type,
                    value: value((v) => ({ from: v.read('from', address), to: v.read('to', address), amount: v.read('amount', amount) })),
                };
            case 'burn':
                return { type, value: value((v) => ({ account: v.read('account', address), amount: v.read('amount', amount) })) };
            case 'authority_change':
                return {
                    type,
                    value: value((v) => ({
                        subject: v.read('subject', address),
                        authority: v.read('authority', messageAt(depth, 100)),
                        new_authority: v.read('new_authority', nullable(address)),
                    })),
                };
            case 'delegate':
                return {
                    type,
                    value: value((v) => ({
                        subject: v.read('subject', address),
                        delegate: v.read('delegate', address),
                        amount: v.read('amount', amount),
                    })),
                };
            case 'revoke':
                return { type, value: value((v) => ({ subject: v.read('subject', address) })) };
            case 'create':
                return {
                    type,
                    value: value((v) => ({
                        account: v.read('account', address),
                        owner: v.read('owner', address),
                        deposit: v.read('deposit', nullable(amount)),
                        if_missing: v.read('if_missing', flag),
                    })),
                };
            case 'close':
                return {
                    type,
                    value: value((v) => ({ account: v.read('account', address), destination: v.read('destination', address) })),
                };
            case 'fee':
                return { type, value: value((v) => ({ payer: v.read('payer', address), amount: v.read('amount', amount) })) };
            case 'lifetime':
                return { type, value: o.read('value', lifetime) };
            case 'proposed':
                if (depth >= MAX_DEPTH) fail(path, 'is nested too deep');
                return { type, value: value((v) => ({ by: v.read('by', address), effect: v.read('effect', effectAt(depth + 1)) })) };
            case 'other':
                return { type, value: value((v) => ({ description: v.read('description', messageAt(depth)) })) };
            default:
                return unrecognized(type);
        }
    };
}

/** An effect as the explanation lists it, with the message that words it; one of a type this version does not know keeps its message too. */
const wordedEffect: Read<WordedEffect> = (input, path) => ({
    ...effectAt(0)(input, path),
    message: new Fields(input, path).read('message', messageAt(0)),
});

const action: Read<Action> = (value, path) => {
    const o = new Fields(value, path);
    return {
        instruction: o.read('instruction', index),
        summary: o.read('summary', messageAt(0, 2_000)),
    };
};

const finding: Read<Finding> = (value, path) => {
    const o = new Fields(value, path);
    return {
        severity: o.read('severity', oneOf(SEVERITIES, 'a severity')),
        code: o.read('code', text(100)),
        message: o.read('message', messageAt(0)),
        instruction: o.read('instruction', nullable(index)),
    };
};

const raw: Read<Raw> = (value, path) => {
    const o = new Fields(value, path);
    return {
        format: o.read('format', text(100)),
        digest: o.read('digest', nullable(hex(64))),
    };
};

/** An account the explanation would read; its address is asked of the RPC, so it must be one. */
const wanted: Read<WantedAccount> = (value, path) => {
    const o = new Fields(value, path);
    const at = o.read('address', text(100));
    if (!isAddress(at)) fail(`${path}.address`, 'is not an address');
    return { address: at, reason: o.read('reason', messageAt(0, 500)) };
};

/**
 * `document`, the JSON of an explanation, as this version reads it, or a
 * `DocumentError` saying where it does not hold together. The result is a
 * new object: nothing of `document` is kept but strings, numbers and
 * booleans that were checked.
 */
export function parseExplanation(document: unknown): Explanation {
    const o = new Fields(document, 'explanation');
    const schema = o.read('schema', text(100));
    if (schema !== EXPLANATION_SCHEMA) fail('explanation.schema', `${quote(schema)} is not ${EXPLANATION_SCHEMA}`);
    const explanation: Explanation = {
        schema: EXPLANATION_SCHEMA,
        chain: o.read('chain', text(100)),
        summary: o.read('summary', messageAt(0, 2_000)),
        // An engine before 0.3 lists none; the summary then stands alone.
        actions: o.read('actions', (v, p) => (v === undefined ? [] : list(action)(v, p))),
        verdict: o.read('verdict', oneOf(VERDICTS, 'a verdict')),
        findings: o.read('findings', list(finding)),
        sections: o.read('sections', list(section)),
        effects: o.read('effects', list(wordedEffect)),
        raw: o.read('raw', nullable(raw)),
    };
    const full = o.read('text', (v, p) => (v === undefined ? undefined : text(MAX_FULL_TEXT)(v, p)));
    if (full !== undefined) explanation.text = full;
    // Left out when the explanation wants none.
    const wants = o.read('wanted_accounts', (v, p) => (v === undefined ? undefined : list(wanted)(v, p)));
    if (wants !== undefined) explanation.wanted_accounts = wants;
    // An engine before locales says none.
    const locale = o.read('locale', (v, p) => (v === undefined ? undefined : wordedIn(v, p)));
    if (locale !== undefined) explanation.locale = locale;
    return explanation;
}

/** A BCP 47 tag: letters, digits and dashes. */
const tag: Read<string> = (value, path) => {
    const found = text(35)(value, path);
    return /^[A-Za-z0-9-]{1,35}$/.test(found) ? found : fail(path, `${quote(found)} is not a BCP 47 tag`);
};

/** Whether a locale's words were reviewed, and by whom and when. */
const review: Read<Review> = (value, path) => {
    const o = new Fields(value, path);
    const kind = o.read('kind', oneOf(['generated', 'unreviewed', 'reviewed'] as const, 'a review'));
    if (kind === 'reviewed') return { kind, by: o.read('by', list(text(200), 16)), on: o.read('on', text(10)) };
    return { kind };
};

/** The locale an explanation is worded in, as the document says. */
const wordedIn: Read<WordedIn> = (value, path) => {
    const o = new Fields(value, path);
    return {
        asked: o.read('asked', list(tag, 8)),
        used: o.read('used', tag),
        direction: o.read('direction', oneOf(['ltr', 'rtl'] as const, 'a direction')),
        review: o.read('review', nullable(review)),
        fallbacks: o.read('fallbacks', integer(0, 1_000_000)),
    };
};
