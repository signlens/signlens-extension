// The contract between the extension and the engine, as the SignLens API
// serves it and the WebAssembly module will: the explanation document
// (`signlens-explanation/1`, specified with the engine), the engine's
// request, and the feedback record. Keys are the Rust field names
// (`own_keys`, `label_trust`), enum variants the Rust names in snake_case
// ("block", "at_least", "authority_change"); 128-bit integers are decimal
// strings; bytes are lowercase hex.
//
// New variants may appear without a schema bump. `parseExplanation`
// (explanation.ts) reads a `type` this version does not know as
// `Unrecognized`, so every union here is closed and a `switch` on `type`
// covers it; an unknown value of the enums below is refused instead.

export const TRUSTS = ['fact', 'verified', 'claimed'] as const;
export const BOUNDS = ['exact', 'at_least', 'at_most', 'unlimited', 'unknown'] as const;
export const SEVERITIES = ['info', 'warning', 'high', 'critical'] as const;
export const VERDICTS = ['ok', 'warn', 'block'] as const;

export type Trust = (typeof TRUSTS)[number];
export type Bound = (typeof BOUNDS)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Verdict = (typeof VERDICTS)[number];

/** A variant this version does not know: its name, for the window to say what it cannot show. */
export interface Unrecognized {
    type: 'Unrecognized';
    value: { type: string };
}

export interface Address {
    address: string;
    label: string | null;
    label_trust: Trust;
    is_self: boolean;
}

export interface Asset {
    /** `"native"` for SOL, else the mint. */
    id: string;
    symbol: string | null;
    decimals: number | null;
    trust: Trust;
}

export interface Amount {
    /** Base units, as a decimal string. */
    units: string;
    asset: Asset;
    bound: Bound;
    note: string | null;
}

export type Value =
    | { type: 'text'; value: string }
    | { type: 'amount'; value: Amount }
    | { type: 'address'; value: Address }
    | { type: 'integer'; value: string }
    | { type: 'basis_points'; value: number }
    | { type: 'duration'; value: number }
    | { type: 'timestamp'; value: number }
    | { type: 'bytes'; value: string }
    | { type: 'bool'; value: boolean }
    | { type: 'list'; value: Value[] }
    | Unrecognized;

export interface Field {
    label: string;
    value: Value;
    trust: Trust;
    /** What the label means, from the reviewed descriptor. */
    help: string | null;
}

export type SectionKind =
    | { type: 'summary' }
    | { type: 'instruction'; value: { index: number } }
    | { type: 'nested'; value: { parent: number; index: number } }
    | { type: 'housekeeping' }
    | { type: 'signers' }
    | { type: 'fees' }
    | { type: 'lifetime' }
    | { type: 'claims' }
    | { type: 'raw' }
    | Unrecognized;

export interface Section {
    kind: SectionKind;
    title: string;
    subtitle: string | null;
    fields: Field[];
    collapsed: boolean;
}

export type Lifetime = { type: 'recent_blockhash' } | { type: 'durable_nonce'; value: { nonce_account: Address } };

export type Effect =
    | { type: 'transfer'; value: { from: Address; to: Address; amount: Amount } }
    | { type: 'burn'; value: { account: Address; amount: Amount } }
    | { type: 'authority_change'; value: { subject: Address; authority: string; new_authority: Address | null } }
    | { type: 'delegate'; value: { subject: Address; delegate: Address; amount: Amount } }
    | { type: 'revoke'; value: { subject: Address } }
    | { type: 'create'; value: { account: Address; owner: Address; deposit: Amount | null; if_missing: boolean } }
    | { type: 'close'; value: { account: Address; destination: Address } }
    | { type: 'fee'; value: { payer: Address; amount: Amount } }
    | { type: 'lifetime'; value: Lifetime }
    | { type: 'proposed'; value: { by: Address; effect: Effect } }
    | { type: 'other'; value: { description: string } }
    | Unrecognized;

export interface Finding {
    severity: Severity;
    code: string;
    message: string;
    instruction: number | null;
}

export interface Raw {
    format: string;
    /** Lowercase hex. */
    payload: string;
    /** SHA-256 of the payload, lowercase hex, or null. */
    digest: string | null;
}

/** The explanation document, `"schema": "signlens-explanation/1"`. */
export interface Explanation {
    schema: 'signlens-explanation/1';
    chain: string;
    summary: string;
    verdict: Verdict;
    findings: Finding[];
    sections: Section[];
    effects: Effect[];
    raw: Raw | null;
    /** The text rendering, when the request asked for it (`render: true`). */
    text?: string;
}

/** What the engine or the API answers instead of an explanation. */
export interface ErrorDocument {
    schema: string;
    error: { code: string; message: string };
}

/** What the engine answers: an explanation, or an error document. */
export type EngineAnswer = Explanation | ErrorDocument;

/** Whether `answer`, whatever it is, is an error document: an `error` object with a message. */
export function isError(answer: unknown): answer is ErrorDocument {
    if (typeof answer !== 'object' || answer === null || !('error' in answer)) return false;
    const error: unknown = answer.error;
    return typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string';
}

/** A contact as the engine takes it. */
export interface Contact {
    name: string;
    address: string;
}

/** A token the host names for a mint outside the snapshot: a claim. */
export interface TokenHint {
    mint: string;
    symbol: string;
    decimals: number;
}

/** One balance change the host's simulation saw. */
export interface SimulatedChange {
    account: string;
    owner?: string;
    mint?: string;
    /** After less before, in base units, as a decimal string. */
    delta: string;
}

export interface Simulation {
    failure: string | null;
    units: number | null;
    changes: SimulatedChange[];
}

/** The engine's request, as its C header declares it; the API takes it with `transaction` beside it. */
export interface EngineRequest {
    kind?: 'transaction' | 'message';
    own_keys?: string[];
    loaded_writable?: string[];
    loaded_readonly?: string[];
    contacts?: Contact[];
    token_hints?: TokenHint[];
    simulation?: Simulation;
    render?: boolean;
}

/** What `GET /v1/packs` answers. */
export interface PacksDocument {
    schema: string;
    engine?: string;
    descriptor_pack: { programs: number; created_at: number; source: string } | null;
    token_snapshot: { tokens: number; created_at: number; source: string } | null;
}

/** What the popup shows of a `PacksDocument`, as the worker reads it. */
export interface ApiStatus {
    engine: string;
    programs: number;
    tokens: number;
    packsAt: number | null;
}

export type Rating = 'clear' | 'unclear' | 'wrong';

/** One feedback record, `POST /v1/feedback`. */
export interface Feedback {
    /** The explanation's `raw.digest`. */
    message_hash: string;
    rating: Rating;
    comment?: string;
    /** The transaction, base64, only when the user asked for it to be covered. */
    transaction?: string | null;
}
