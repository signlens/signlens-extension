// The contract between the extension and the engine, as the SignLens API
// serves it and the WebAssembly module will: the explanation document
// (`signlens-explanation/1`, specified with the engine), the engine's
// request, and the feedback record. Enum variants are the Rust names;
// 128-bit integers are decimal strings; bytes are lowercase hex.
//
// New variants may appear without a schema bump. `parseExplanation`
// (explanation.ts) reads a `type` this version does not know as
// `Unrecognized`, so every union here is closed and a `switch` on `type`
// covers it; an unknown value of the enums below is refused instead.

export const TRUSTS = ['Fact', 'Verified', 'Claimed'] as const;
export const BOUNDS = ['Exact', 'AtLeast', 'AtMost', 'Unlimited', 'Unknown'] as const;
export const SEVERITIES = ['Info', 'Warning', 'High', 'Critical'] as const;
export const VERDICTS = ['Ok', 'Warn', 'Block'] as const;

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
    text: string;
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
    | { type: 'Text'; value: string }
    | { type: 'Amount'; value: Amount }
    | { type: 'Address'; value: Address }
    | { type: 'Integer'; value: string }
    | { type: 'BasisPoints'; value: number }
    | { type: 'Duration'; value: number }
    | { type: 'Timestamp'; value: number }
    | { type: 'Bytes'; value: string }
    | { type: 'Bool'; value: boolean }
    | { type: 'List'; value: Value[] }
    | Unrecognized;

export interface Field {
    label: string;
    value: Value;
    trust: Trust;
    /** What the label means, from the reviewed descriptor. */
    help: string | null;
}

export type SectionKind =
    | { type: 'Summary' }
    | { type: 'Instruction'; value: { index: number } }
    | { type: 'Nested'; value: { parent: number; index: number } }
    | { type: 'Housekeeping' }
    | { type: 'Signers' }
    | { type: 'Fees' }
    | { type: 'Lifetime' }
    | { type: 'Claims' }
    | { type: 'Raw' }
    | Unrecognized;

export interface Section {
    kind: SectionKind;
    title: string;
    subtitle: string | null;
    fields: Field[];
    collapsed: boolean;
}

export type Lifetime = { type: 'RecentBlockhash' } | { type: 'DurableNonce'; value: { nonce_account: Address } };

export type Effect =
    | { type: 'Transfer'; value: { from: Address; to: Address; amount: Amount } }
    | { type: 'Burn'; value: { account: Address; amount: Amount } }
    | { type: 'AuthorityChange'; value: { subject: Address; authority: string; new_authority: Address | null } }
    | { type: 'Delegate'; value: { subject: Address; delegate: Address; amount: Amount } }
    | { type: 'Revoke'; value: { subject: Address } }
    | { type: 'Create'; value: { account: Address; owner: Address; deposit: Amount | null; if_missing: boolean } }
    | { type: 'Close'; value: { account: Address; destination: Address } }
    | { type: 'Fee'; value: { payer: Address; amount: Amount } }
    | { type: 'Lifetime'; value: Lifetime }
    | { type: 'Proposed'; value: { by: Address; effect: Effect } }
    | { type: 'Other'; value: { description: string } }
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

export function isError(answer: EngineAnswer): answer is ErrorDocument {
    return 'error' in answer && typeof answer.error === 'object' && answer.error !== null && typeof answer.error.message === 'string';
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
    ownKeys?: string[];
    loadedWritable?: string[];
    loadedReadonly?: string[];
    contacts?: Contact[];
    tokenHints?: TokenHint[];
    simulation?: Simulation;
    render?: boolean;
}

/** What `GET /v1/packs` answers. */
export interface PacksDocument {
    schema: string;
    engine?: string;
    descriptorPack: { programs: number; createdAt: number; source: string } | null;
    tokenSnapshot: { tokens: number; createdAt: number; source: string } | null;
}

export type Rating = 'clear' | 'unclear' | 'wrong';

/** One feedback record, `POST /v1/feedback`. */
export interface Feedback {
    /** The explanation's `raw.digest`. */
    messageHash: string;
    rating: Rating;
    comment?: string;
    /** The transaction, base64, only when the user asked for it to be covered. */
    transaction?: string | null;
}
