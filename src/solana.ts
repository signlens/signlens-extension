// The little of Solana's wire format the worker needs: finding the address
// lookup tables a transaction references and reading the addresses they
// load from the tables' accounts, the accounts a message names, and what a
// token account holds. Everything else is the engine's job; the worker is
// on the untrusted, online side and only gathers hints. Base58 is its
// own module (base58.ts), which the pages load without the rest.

export { base58Decode, base58Encode, isAddress } from './base58.ts';

import { base58Encode } from './base58.ts';
import { refusedEndpoint, within } from './endpoint.ts';
import { objectFields } from './json.ts';
import { withoutControls } from './text.ts';

/** Owner of every address lookup table account. */
export const LOOKUP_TABLE_PROGRAM = 'AddressLookupTab1e1111111111111111111111111';

/** Size of the metadata that precedes the addresses in a table account. */
const LOOKUP_TABLE_META_SIZE = 56;

export interface TableLookup {
    table: string;
    writable: number[];
    readonly: number[];
}

export interface MessageAccount {
    address: string;
    writable: boolean;
    signer: boolean;
}

export interface LoadedAddresses {
    writable: string[];
    readonly: string[];
}

/** An account as `getMultipleAccounts` returns it with base64 data. */
export interface RpcAccount {
    owner: string;
    lamports: number;
    data: [string, string];
}

export interface TokenHolding {
    mint: string;
    owner: string;
    amount: bigint;
}

export interface Balance {
    lamports: bigint;
    token: TokenHolding | null;
}

class Reader {
    offset = 0;
    private readonly bytes: Uint8Array;

    constructor(bytes: Uint8Array) {
        this.bytes = bytes;
    }

    take(count: number): Uint8Array {
        const end = this.offset + count;
        if (end > this.bytes.length) throw new Error('transaction is truncated');
        const slice = this.bytes.subarray(this.offset, end);
        this.offset = end;
        return slice;
    }

    u8(): number {
        return this.take(1)[0] ?? 0;
    }

    compactU16(): number {
        let value = 0;
        for (let shift = 0; shift < 21; shift += 7) {
            const byte = this.u8();
            value |= (byte & 0x7f) << shift;
            if ((byte & 0x80) === 0) return value;
        }
        throw new Error('compact-u16 is too long');
    }
}

/**
 * The address lookup tables `transaction` (a serialized legacy, v0 or v1
 * transaction) references, in the message's order. Only v0 has any.
 */
export function tableLookups(transaction: Uint8Array): TableLookup[] {
    // v1 puts the message first and has no lookup tables; a legacy or v0
    // transaction starts with its signature count, which is never 0x81.
    if (transaction.length === 0) throw new Error('transaction is empty');
    if (transaction[0] === 0x81) return [];
    const reader = new Reader(transaction);
    reader.take(reader.compactU16() * 64);
    const first = reader.u8();
    if ((first & 0x80) === 0) return [];
    if (first !== 0x80) throw new Error(`unsupported message version ${first & 0x7f}`);
    reader.take(3);
    reader.take(reader.compactU16() * 32);
    reader.take(32);
    for (let n = reader.compactU16(); n > 0; n -= 1) {
        reader.u8();
        reader.take(reader.compactU16());
        reader.take(reader.compactU16());
    }
    const lookups: TableLookup[] = [];
    for (let n = reader.compactU16(); n > 0; n -= 1) {
        const table = base58Encode(reader.take(32));
        const writable = [...reader.take(reader.compactU16())];
        const readonly = [...reader.take(reader.compactU16())];
        lookups.push({ table, writable, readonly });
    }
    if (reader.offset !== transaction.length) throw new Error('transaction has trailing bytes');
    return lookups;
}

/**
 * The static accounts of `transaction` with whether each may be written,
 * in the message's order. Accounts loaded from lookup tables are not in
 * the bytes; see `tableLookups` and `loadedAddresses` for those.
 */
export function messageAccounts(transaction: Uint8Array): MessageAccount[] {
    if (transaction.length === 0) throw new Error('transaction is empty');
    const reader = new Reader(transaction);
    let header: [number, number, number];
    let count: number;
    if (transaction[0] === 0x81) {
        // v1 (SIMD-0385): the message first, the signatures after it. The
        // header is followed by the config mask (4 bytes), the lifetime
        // (32) and the instruction count (1), then the account count in
        // one byte.
        reader.u8();
        header = [reader.u8(), reader.u8(), reader.u8()];
        reader.take(4 + 32 + 1);
        count = reader.u8();
    } else {
        reader.take(reader.compactU16() * 64);
        const first = reader.u8();
        if ((first & 0x80) !== 0) {
            if (first !== 0x80) throw new Error(`unsupported message version ${first & 0x7f}`);
            header = [reader.u8(), reader.u8(), reader.u8()];
        } else {
            header = [first, reader.u8(), reader.u8()];
        }
        count = reader.compactU16();
    }
    const [signed, readonlySigned, readonlyUnsigned] = header;
    const accounts: MessageAccount[] = [];
    for (let i = 0; i < count; i += 1) {
        const address = base58Encode(reader.take(32));
        const signer = i < signed;
        const writable = signer ? i < signed - readonlySigned : i < count - readonlyUnsigned;
        accounts.push({ address, writable, signer });
    }
    return accounts;
}

/**
 * The addresses `lookups` load, in the order the runtime appends them to a
 * message's accounts: every table's writable addresses, then every table's
 * read-only ones. `tables` maps a table's address to its account data.
 */
export function loadedAddresses(lookups: TableLookup[], tables: Map<string, Uint8Array>): LoadedAddresses {
    const pick = (table: string, index: number): string => {
        const data = tables.get(table);
        if (!data) throw new Error(`lookup table ${table} was not found`);
        const start = LOOKUP_TABLE_META_SIZE + index * 32;
        if (start + 32 > data.length) throw new Error(`lookup table ${table} has no index ${index}`);
        return base58Encode(data.subarray(start, start + 32));
    };
    return {
        writable: lookups.flatMap((l) => l.writable.map((i) => pick(l.table, i))),
        readonly: lookups.flatMap((l) => l.readonly.map((i) => pick(l.table, i))),
    };
}

/**
 * Fetches the accounts of `addresses` that are lookup tables from the RPC
 * at `url`, as a map from address to account data. Accounts that do not
 * exist or are not owned by the lookup table program are left out.
 */
export async function fetchLookupTables(url: string, addresses: string[], stop?: AbortSignal): Promise<Map<string, Uint8Array>> {
    const accounts = await multipleAccounts(url, addresses, stop);
    const tables = new Map<string, Uint8Array>();
    accounts.forEach((account, i) => {
        const address = addresses[i];
        if (account?.owner === LOOKUP_TABLE_PROGRAM && address !== undefined) tables.set(address, fromBase64(account.data[0]));
    });
    return tables;
}

/** How many accounts one `getMultipleAccounts` asks for: public endpoints block longer lists. */
const ACCOUNTS_PER_CALL = 10;

/**
 * The accounts at `addresses` over the RPC, in order, `null` where there
 * is none: one `getMultipleAccounts` per ten, since public endpoints such
 * as publicnode refuse a longer list outright (HTTP 403, "Request
 * blocked"). The data is base64 at the confirmed commitment.
 */
export async function multipleAccounts(url: string, addresses: string[], stop?: AbortSignal): Promise<(RpcAccount | null)[]> {
    const accounts: (RpcAccount | null)[] = [];
    for (let at = 0; at < addresses.length; at += ACCOUNTS_PER_CALL) {
        const batch = addresses.slice(at, at + ACCOUNTS_PER_CALL);
        const read = (result: unknown) => readAccountList(objectFields(result)?.value, batch.length);
        accounts.push(
            ...(await rpcCall(url, 'getMultipleAccounts', [batch, { encoding: 'base64', commitment: 'confirmed' }], read, 10_000, stop)),
        );
    }
    return accounts;
}

/** An account as the RPC answers one with base64 data, `null` where there is none, or `undefined` when it is not one. */
function readAccount(value: unknown): RpcAccount | null | undefined {
    if (value === null) return null;
    const { owner, lamports, data } = objectFields(value) ?? {};
    if (typeof owner !== 'string' || typeof lamports !== 'number' || !Number.isInteger(lamports) || lamports < 0) return undefined;
    if (!Array.isArray(data) || typeof data[0] !== 'string' || data[1] !== 'base64') return undefined;
    return { owner, lamports, data: [data[0], 'base64'] };
}

/** `value` as a list of accounts, `count` of them when given, or `null` when it is not one: a wrong answer is no answer. */
export function readAccountList(value: unknown, count?: number): (RpcAccount | null)[] | null {
    if (!Array.isArray(value) || (count !== undefined && value.length !== count)) return null;
    const accounts = value.map(readAccount);
    return accounts.every((account) => account !== undefined) ? accounts : null;
}

/**
 * One JSON-RPC call to the RPC at `url`, given up after `timeoutMs` or when
 * `stop` aborts: its result as `read` makes it out, or an error naming what
 * went wrong. The answer is read, not cast: one that is not JSON-RPC, or
 * whose result `read` cannot make out (`null`), is an error, never taken
 * for what was asked.
 */
export async function rpcCall<T>(
    url: string,
    method: string,
    params: unknown[],
    read: (result: unknown) => T | null,
    timeoutMs = 15_000,
    stop?: AbortSignal,
): Promise<T> {
    const refused = refusedEndpoint(url, 'RPC');
    if (refused) throw new Error(refused);
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: within(timeoutMs, stop),
    });
    if (!response.ok) throw await refusal(url, response);
    const host = new URL(url).host;
    const body = objectFields(await response.json().catch(() => null));
    if (!body) throw new Error(`the RPC at ${host} answered something that is not JSON-RPC`);
    if (body.error !== undefined && body.error !== null) {
        const said = objectFields(body.error)?.message;
        throw new Error(`RPC error: ${typeof said === 'string' && said.trim() ? withoutControls(said).slice(0, 200) : 'no message'}`);
    }
    const result = read(body.result);
    if (result === null) throw new Error(`the RPC at ${host} answered ${method} with something else`);
    return result;
}

/** An HTTP answer that is not JSON-RPC, as an error naming the host and quoting what it said. */
export async function refusal(url: string, response: Response): Promise<Error> {
    const said = withoutControls(await response.text().catch(() => ''))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
    let host = 'the RPC';
    try {
        host = new URL(url).hostname;
    } catch {
        // Not a URL: named as what it is.
    }
    return new Error(`${host} answered HTTP ${response.status}${said ? `: ${said}` : ''}`);
}

/** The SPL Token and Token-2022 programs, which own token accounts and mints alike. */
export const TOKEN_PROGRAMS: ReadonlySet<string> = new Set([
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
]);

/** A token account's size without extensions; Token-2022 puts the account type right after. */
const TOKEN_ACCOUNT_SIZE = 165;
/** Token-2022's account type byte for a token account; a mint has 1, and both may be this long. */
const TOKEN_ACCOUNT_TYPE = 2;

/**
 * What an RPC account is for balances: its lamports, and the token it
 * holds when it is a token account: the mint, the owner and the amount.
 * A Token-2022 mint with extensions is as long as a token account, so
 * length alone does not tell them apart: a legacy token account is exactly
 * 165 bytes, and a Token-2022 one says what it is in byte 165.
 */
export function tokenBalance(account: RpcAccount | null | undefined): Balance | null {
    if (!account) return null;
    const data = fromBase64(account.data[0]);
    const isTokenAccount =
        TOKEN_PROGRAMS.has(account.owner) &&
        (data.length === TOKEN_ACCOUNT_SIZE || (data.length > TOKEN_ACCOUNT_SIZE && data[TOKEN_ACCOUNT_SIZE] === TOKEN_ACCOUNT_TYPE));
    const token = isTokenAccount
        ? {
              mint: base58Encode(data.subarray(0, 32)),
              owner: base58Encode(data.subarray(32, 64)),
              amount: new DataView(data.buffer, data.byteOffset + 64, 8).getBigUint64(0, true),
          }
        : null;
    return { lamports: BigInt(account.lamports), token };
}

/** The bytes of base64 `text`, in Node and in the browser alike. */
export function fromBase64(text: string): Uint8Array {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/** Base64 of `bytes`. */
export function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}
