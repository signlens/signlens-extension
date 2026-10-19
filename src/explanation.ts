// The explanation document as this version reads it. What the API answers
// (and later what the engine returns) is checked here field by field
// against types.ts and comes out typed, so nothing past this point casts.
// A document that does not hold together is refused with the path of what
// is wrong, and the window shows it as an error, never as a pass. A `type`
// this version does not know becomes `Unrecognized`, which the window says
// it cannot show; an unknown verdict, trust, severity or bound is refused,
// since the window would have to guess what it means.

import {
    type Address,
    type Amount,
    type Asset,
    BOUNDS,
    type Effect,
    type Explanation,
    type Field,
    type Finding,
    type Lifetime,
    type Raw,
    SEVERITIES,
    type Section,
    type SectionKind,
    TRUSTS,
    type Value,
    VERDICTS,
} from './types.ts';

export const EXPLANATION_SCHEMA = 'signlens-explanation/1';

/** How deep lists and proposed effects may nest. */
const MAX_DEPTH = 8;
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
        return value;
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

const address: Read<Address> = (value, path) => {
    const o = new Fields(value, path);
    return {
        text: o.read('text', text(100)),
        label: o.read('label', nullable(text(200))),
        label_trust: o.read('label_trust', oneOf(TRUSTS, 'a trust')),
        is_self: o.read('is_self', flag),
    };
};

const asset: Read<Asset> = (value, path) => {
    const o = new Fields(value, path);
    return {
        id: o.read('id', text(100)),
        symbol: o.read('symbol', nullable(text(100))),
        // A mint keeps its decimals in one byte.
        decimals: o.read('decimals', nullable(integer(0, 255))),
        trust: o.read('trust', oneOf(TRUSTS, 'a trust')),
    };
};

const amount: Read<Amount> = (value, path) => {
    const o = new Fields(value, path);
    return {
        units: o.read('units', decimal),
        asset: o.read('asset', asset),
        bound: o.read('bound', oneOf(BOUNDS, 'a bound')),
        note: o.read('note', nullable(text(500))),
    };
};

function valueAt(depth: number): Read<Value> {
    return (input, path) => {
        const { type, fields: o } = variant(input, path);
        switch (type) {
            case 'Text':
                return { type, value: o.read('value', text()) };
            case 'Amount':
                return { type, value: o.read('value', amount) };
            case 'Address':
                return { type, value: o.read('value', address) };
            case 'Integer':
                return { type, value: o.read('value', decimal) };
            case 'BasisPoints':
            case 'Duration':
            case 'Timestamp':
                return { type, value: o.read('value', finite) };
            case 'Bytes':
                return { type, value: o.read('value', hex(MAX_TEXT)) };
            case 'Bool':
                return { type, value: o.read('value', flag) };
            case 'List':
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
        label: o.read('label', text(200)),
        value: o.read('value', valueAt(0)),
        trust: o.read('trust', oneOf(TRUSTS, 'a trust')),
        help: o.read('help', nullable(text(2_000))),
    };
};

const index = integer(0, 10_000);

const sectionKind: Read<SectionKind> = (value, path) => {
    const { type, fields: o } = variant(value, path);
    switch (type) {
        case 'Summary':
        case 'Housekeeping':
        case 'Signers':
        case 'Fees':
        case 'Lifetime':
        case 'Claims':
        case 'Raw':
            return { type };
        case 'Instruction':
            return { type, value: o.read('value', (v, p) => ({ index: new Fields(v, p).read('index', index) })) };
        case 'Nested':
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
        title: o.read('title', text(200)),
        subtitle: o.read('subtitle', nullable(text(500))),
        fields: o.read('fields', list(field)),
        collapsed: o.read('collapsed', flag),
    };
};

/** How long a signature stays usable. Not open to new variants: the window would read one as "about a minute". */
const lifetime: Read<Lifetime> = (value, path) => {
    const { type, fields: o } = variant(value, path);
    switch (type) {
        case 'RecentBlockhash':
            return { type };
        case 'DurableNonce':
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
            case 'Transfer':
                return {
                    type,
                    value: value((v) => ({ from: v.read('from', address), to: v.read('to', address), amount: v.read('amount', amount) })),
                };
            case 'Burn':
                return { type, value: value((v) => ({ account: v.read('account', address), amount: v.read('amount', amount) })) };
            case 'AuthorityChange':
                return {
                    type,
                    value: value((v) => ({
                        subject: v.read('subject', address),
                        authority: v.read('authority', text(100)),
                        new_authority: v.read('new_authority', nullable(address)),
                    })),
                };
            case 'Delegate':
                return {
                    type,
                    value: value((v) => ({
                        subject: v.read('subject', address),
                        delegate: v.read('delegate', address),
                        amount: v.read('amount', amount),
                    })),
                };
            case 'Revoke':
                return { type, value: value((v) => ({ subject: v.read('subject', address) })) };
            case 'Create':
                return {
                    type,
                    value: value((v) => ({
                        account: v.read('account', address),
                        owner: v.read('owner', address),
                        deposit: v.read('deposit', nullable(amount)),
                        if_missing: v.read('if_missing', flag),
                    })),
                };
            case 'Close':
                return {
                    type,
                    value: value((v) => ({ account: v.read('account', address), destination: v.read('destination', address) })),
                };
            case 'Fee':
                return { type, value: value((v) => ({ payer: v.read('payer', address), amount: v.read('amount', amount) })) };
            case 'Lifetime':
                return { type, value: o.read('value', lifetime) };
            case 'Proposed':
                if (depth >= MAX_DEPTH) fail(path, 'is nested too deep');
                return { type, value: value((v) => ({ by: v.read('by', address), effect: v.read('effect', effectAt(depth + 1)) })) };
            case 'Other':
                return { type, value: value((v) => ({ description: v.read('description', text()) })) };
            default:
                return unrecognized(type);
        }
    };
}

const finding: Read<Finding> = (value, path) => {
    const o = new Fields(value, path);
    return {
        severity: o.read('severity', oneOf(SEVERITIES, 'a severity')),
        code: o.read('code', text(100)),
        message: o.read('message', text()),
        instruction: o.read('instruction', nullable(index)),
    };
};

const raw: Read<Raw> = (value, path) => {
    const o = new Fields(value, path);
    return {
        format: o.read('format', text(100)),
        payload: o.read('payload', hex(100_000)),
        digest: o.read('digest', nullable(hex(64))),
    };
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
        summary: o.read('summary', text(2_000)),
        verdict: o.read('verdict', oneOf(VERDICTS, 'a verdict')),
        findings: o.read('findings', list(finding)),
        sections: o.read('sections', list(section)),
        effects: o.read('effects', list(effectAt(0))),
        raw: o.read('raw', nullable(raw)),
    };
    const full = o.read('text', (v, p) => (v === undefined ? undefined : text(MAX_FULL_TEXT)(v, p)));
    return full === undefined ? explanation : { ...explanation, text: full };
}
