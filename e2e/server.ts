// A local server for the tests: serves the dapp page on localhost, which
// the extension's content scripts match, answers `getMultipleAccounts` for
// the lookup tables of the fixtures it knows, and answers `/api/*` as the
// SignLens API, counting the calls and refusing them on request.
//
// The API's answers are replayed from e2e/fixtures/api/, one file per
// call (its method, path and body), so the suite needs no API; a call
// nothing was recorded for fails its test. With `SIGNLENS_API_URL` set,
// the calls go to that API instead and each answer is held against its
// recording: one that differs, or was never recorded, fails its test. With
// `SIGNLENS_RECORD=1` as well, each answer is kept instead
// (`npm run test:e2e:record`). Feedback is never sent anywhere: it is a
// write, answered here as the API would. Nothing else touches the network.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { base58Decode, base58Encode, tableLookups } from '../src/solana.ts';

const DAPP = readFileSync(new URL('dapp.html', import.meta.url));
const FIXTURES = new URL('fixtures/', import.meta.url);
export const RECORDINGS = new URL('api/', FIXTURES);
const LIVE = process.env.SIGNLENS_API_URL?.replace(/\/+$/, '');
const RECORD = process.env.SIGNLENS_RECORD === '1';
const LOOKUP_TABLE_PROGRAM = 'AddressLookupTab1e1111111111111111111111111';

/** A fixture file's bytes and the addresses its lookup tables load; `path` is its name under e2e/fixtures, with or without `.b64`. */
export interface Fixture {
    base64: string;
    bytes: Uint8Array;
    writable: string[];
    readonly: string[];
}

/** An API call and the answer it got, as kept under e2e/fixtures/api/. */
interface Recording {
    request: { method: string; path: string; body: unknown };
    /** The answer: its JSON as `body`, or, when it was not JSON, its `text`. */
    response: { status: number; body: unknown; text?: string };
}

/** `value` as JSON with its keys sorted, so the same request reads the same however it was built. */
function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}

/** The file the answer to a call is kept in: its method and path, and a hash of the three with the body. */
function recordingOf(method: string, path: string, body: unknown): URL {
    const hash = createHash('sha256')
        .update(`${method} ${path} ${canonical(body)}`)
        .digest('hex')
        .slice(0, 16);
    return new URL(`${method.toLowerCase()}${path.replace(/[^A-Za-z0-9]+/g, '-')}-${hash}.json`, RECORDINGS);
}

/** Whether an answer of `status` and `text` is the one `kept`, JSON compared as JSON. */
function sameAnswer(kept: Recording, status: number, text: string): boolean {
    if (kept.response.status !== status) return false;
    if (kept.response.text !== undefined) return kept.response.text === text;
    try {
        return canonical(text ? JSON.parse(text) : null) === canonical(kept.response.body);
    } catch {
        return false;
    }
}

/** An error document from the relay itself, in the API's shape. */
function relayError(code: string, message: string): string {
    return JSON.stringify({ schema: 'signlens-api/1', error: { code, message } });
}

/** The explanation the SignLens API gave for a fixture, recorded under e2e/fixtures as `<name>.explanation.json`. */
export function recorded(name: string): object {
    return JSON.parse(readFileSync(new URL(`${name}.explanation.json`, FIXTURES), 'utf8')) as object;
}

/** An explanation with nothing in it but `verdict` and `changes`, for a test that needs the API to answer exactly that. */
export function explanation(verdict: string, changes: Record<string, unknown> = {}): object {
    const summary = 'A transaction';
    return {
        schema: 'signlens-explanation/1',
        chain: 'solana:mainnet',
        summary,
        verdict,
        findings: [],
        sections: [],
        effects: [],
        raw: null,
        text: summary,
        ...changes,
    };
}

export function fixture(path: string): Fixture {
    const name = path.split('/').pop() ?? path;
    const url = new URL(name.endsWith('.b64') ? name : `${name}.b64`, FIXTURES);
    const text = readFileSync(url, 'utf8');
    const list = (key: string): string[] => {
        const line = text.split('\n').find((l) => l.startsWith(`# ${key}: `));
        return line
            ? line
                  .slice(key.length + 4)
                  .split(/\s+/)
                  .filter(Boolean)
            : [];
    };
    const base64 = text
        .split('\n')
        .filter((line) => !line.startsWith('#'))
        .join('');
    return {
        base64,
        bytes: new Uint8Array(Buffer.from(base64, 'base64')),
        writable: list('loaded-writable'),
        readonly: list('loaded-readonly'),
    };
}

/** The fee payer of a serialized transaction, base58. */
export function feePayer(bytes: Uint8Array): string {
    let i = 0;
    const signatures = bytes[i++] ?? 0;
    i += 64 * signatures;
    if ((bytes[i] ?? 0) & 0x80) i += 1;
    i += 3;
    i += 1;
    return base58Encode(bytes.subarray(i, i + 32));
}

/**
 * The lookup table accounts a fixture needs, laid out so that the indexes
 * its message references hold the addresses the fixture says they load.
 *
 * @returns table address to account data
 */
export function tablesOf({ bytes, writable, readonly }: Fixture): Map<string, Uint8Array> {
    const lookups = tableLookups(bytes);
    const tables = new Map<string, Uint8Array>();
    const place = (table: string, index: number, address: string | undefined) => {
        if (address === undefined) throw new Error(`no address for index ${index} of ${table}`);
        const needed = 56 + (index + 1) * 32;
        const existing = tables.get(table) ?? new Uint8Array(0);
        const data = new Uint8Array(Math.max(existing.length, needed));
        data.set(existing);
        const decoded = base58Decode(address);
        if (!decoded) throw new Error(`not an address: ${address}`);
        data.set(decoded, 56 + index * 32);
        tables.set(table, data);
    };
    const w = writable[Symbol.iterator]();
    const r = readonly[Symbol.iterator]();
    for (const lookup of lookups) for (const index of lookup.writable) place(lookup.table, index, w.next().value);
    for (const lookup of lookups) for (const index of lookup.readonly) place(lookup.table, index, r.next().value);
    return tables;
}

/**
 * Starts the server on a free port. `tables` is what the RPC knows; a
 * test adds a fixture's with `server.know(fixture)`.
 */
interface StoredAccount {
    owner: string;
    lamports: number;
    data?: Uint8Array;
}

export interface RpcCall {
    method?: string;
    query?: string;
    params?: unknown[];
    id?: number;
}

export interface ApiCall {
    method: string | undefined;
    path: string;
    body: unknown;
}

export interface TestServer {
    url: string;
    rpc: string;
    tokens: string;
    api: string;
    calls: RpcCall[];
    apiCalls: ApiCall[];
    /** The API calls nothing was recorded for, when replaying: the test's fixture fails on any. */
    apiMissed: string[];
    /** The API calls the live API answered otherwise than recorded, or that were never recorded: the test's fixture fails on any. */
    apiDrifted: string[];
    know(fixture: Fixture): void;
    knowMint(mint: string, symbol: string, decimals: number): void;
    wallet(address: string, before: number, after: number): void;
    tokenAccount(address: string, owner: string, mint: string, before: number | bigint, after: number | bigint): void;
    failSimulation(error: unknown, logs?: string[]): void;
    refuse(method: string, status: number, body: string): void;
    refuseApi(status: number, body?: string): void;
    answerApi(...documents: unknown[]): void;
    expireBlockhash(): void;
    close(): Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
    const tables = new Map<string, Uint8Array>();
    const mints = new Map<string, { symbol: string; decimals: number }>();
    /** Account state before and after the simulation, by address. */
    const state: {
        before: Map<string, StoredAccount>;
        after: Map<string, StoredAccount>;
        failure: unknown;
        logs: string[];
        units: number;
        blockhashExpired: boolean;
        refused: { method: string; status: number; body: string } | null;
    } = { before: new Map(), after: new Map(), failure: null, logs: [], units: 4200, blockhashExpired: false, refused: null };
    const calls: RpcCall[] = [];
    // Answers the relay gives instead of the API's, in turn, the last repeated.
    const api: { calls: ApiCall[]; missed: string[]; drifted: string[]; answers: { status: number; body: string }[] } = {
        calls: [],
        missed: [],
        drifted: [],
        answers: [],
    };
    const rpcAccount = (entry: StoredAccount | undefined) =>
        entry
            ? {
                  owner: entry.owner,
                  lamports: entry.lamports,
                  data: [Buffer.from(entry.data ?? new Uint8Array(0)).toString('base64'), 'base64'],
              }
            : null;
    const server = createServer((request, response) => {
        const { pathname } = new URL(request.url ?? '/', 'http://localhost');
        if (pathname.startsWith('/api/')) {
            let body = '';
            request.setEncoding('utf8').on('data', (chunk: string) => {
                body += chunk;
            });
            request.on('end', async () => {
                const method = request.method ?? 'GET';
                const path = pathname.slice(4);
                const sent: unknown = body ? JSON.parse(body) : null;
                api.calls.push({ method: request.method, path, body: sent });
                const reply = (status: number, text: string) => {
                    response.writeHead(status, { 'content-type': 'application/json' });
                    response.end(text);
                };
                const answer = api.answers.length > 1 ? api.answers.shift() : api.answers[0];
                if (answer) return reply(answer.status, answer.body);
                // Feedback is a write: the tests never send it to an API, live or not.
                if (method === 'POST' && path === '/v1/feedback') return reply(204, '');
                const file = recordingOf(method, path, sent);
                const name = file.pathname.split('/').pop();
                if (!LIVE) {
                    if (!existsSync(file)) {
                        api.missed.push(`${method} ${path} (${name})`);
                        return reply(
                            502,
                            relayError('recording', 'no recorded answer for this call; record with `npm run test:e2e:record`'),
                        );
                    }
                    const kept = JSON.parse(readFileSync(file, 'utf8')) as Recording;
                    const { status, body: json, text } = kept.response;
                    return reply(status, text ?? (json === null ? '' : JSON.stringify(json)));
                }
                // Relayed to the real API, body and all, so the tests see what a user sees.
                let status: number;
                let text: string;
                try {
                    const upstream = await fetch(`${LIVE}${path}`, {
                        method,
                        headers: { 'content-type': 'application/json' },
                        ...(method === 'POST' ? { body } : {}),
                    });
                    status = upstream.status;
                    text = await upstream.text();
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return reply(502, relayError('relay', `no SignLens API at ${LIVE}: ${message}`));
                }
                if (!RECORD) {
                    // Live: the answer held against its recording, so the recordings are known to hold.
                    if (!existsSync(file)) api.drifted.push(`${method} ${path}: nothing recorded (${name})`);
                    else if (!sameAnswer(JSON.parse(readFileSync(file, 'utf8')) as Recording, status, text)) {
                        api.drifted.push(`${method} ${path}: answered otherwise than recorded (${name})`);
                    }
                }
                if (RECORD) {
                    let answered: Recording['response'];
                    try {
                        answered = { status, body: text ? JSON.parse(text) : null };
                    } catch {
                        answered = { status, body: null, text };
                    }
                    const recording: Recording = { request: { method, path, body: sent }, response: answered };
                    mkdirSync(RECORDINGS, { recursive: true });
                    writeFileSync(file, `${JSON.stringify(recording, null, 2)}\n`);
                }
                return reply(status, text);
            });
            return;
        }
        if (request.method === 'GET' && pathname === '/dapp.html') {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end(DAPP);
            return;
        }
        if (request.method === 'GET' && pathname === '/tokens') {
            const query = new URL(request.url ?? '/', 'http://localhost').searchParams.get('query') ?? '';
            calls.push({ method: 'tokens', query });
            const list = query.split(',').flatMap((mint) => {
                const known = mints.get(mint);
                return known ? [{ id: mint, symbol: known.symbol, decimals: known.decimals, name: known.symbol }] : [];
            });
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify(list));
            return;
        }
        if (request.method === 'POST' && pathname === '/rpc') {
            let body = '';
            request.setEncoding('utf8').on('data', (chunk: string) => {
                body += chunk;
            });
            request.on('end', () => {
                const call = JSON.parse(body) as RpcCall & {
                    params: [string[], { accounts?: { addresses?: string[] }; replaceRecentBlockhash?: boolean }?];
                };
                calls.push(call);
                const refused = state.refused;
                if (refused && refused.method === call.method) {
                    response.writeHead(refused.status, { 'content-type': 'text/plain' });
                    response.end(refused.body);
                    return;
                }
                let result: unknown;
                if (call.method === 'getMultipleAccounts') {
                    result = {
                        context: { slot: 1 },
                        value: call.params[0].map((address: string) => {
                            const data = tables.get(address);
                            if (data) return { owner: LOOKUP_TABLE_PROGRAM, data: [Buffer.from(data).toString('base64'), 'base64'] };
                            const mint = mints.get(address);
                            if (mint) {
                                // A mint account: decimals at byte 44 of its 82.
                                const account = new Uint8Array(82);
                                account[44] = mint.decimals;
                                return {
                                    owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
                                    data: [Buffer.from(account).toString('base64'), 'base64'],
                                };
                            }
                            return rpcAccount(state.before.get(address));
                        }),
                    };
                }
                if (call.method === 'simulateTransaction') {
                    const addresses: string[] = call.params[1]?.accounts?.addresses ?? [];
                    const expired = state.blockhashExpired && call.params[1]?.replaceRecentBlockhash !== true;
                    const err = expired ? 'BlockhashNotFound' : state.failure;
                    result = {
                        context: { slot: 1 },
                        value: {
                            err,
                            logs: err ? state.logs : [],
                            unitsConsumed: err ? 0 : state.units,
                            accounts: err
                                ? null
                                : addresses.map((address: string) => rpcAccount(state.after.get(address) ?? state.before.get(address))),
                        },
                    };
                }
                response.writeHead(200, { 'content-type': 'application/json' });
                response.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, result }));
            });
            return;
        }
        response.writeHead(404);
        response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return {
        url: `http://localhost:${port}`,
        rpc: `http://127.0.0.1:${port}/rpc`,
        calls,
        know(fixture: Fixture) {
            for (const [table, data] of tablesOf(fixture)) tables.set(table, data);
        },
        /** Teaches the RPC and the token list a mint. */
        knowMint(mint: string, symbol: string, decimals: number) {
            mints.set(mint, { symbol, decimals });
        },
        /** A wallet's lamports before and after the simulation. */
        wallet(address: string, before: number, after: number) {
            state.before.set(address, { owner: '11111111111111111111111111111111', lamports: before, data: new Uint8Array(0) });
            state.after.set(address, { owner: '11111111111111111111111111111111', lamports: after, data: new Uint8Array(0) });
        },
        /** A token account's amount before and after the simulation. */
        tokenAccount(address: string, owner: string, mint: string, before: number | bigint, after: number | bigint) {
            const make = (amount: number | bigint): StoredAccount => {
                const data = new Uint8Array(165);
                data.set(base58Decode(mint) ?? new Uint8Array(32), 0);
                data.set(base58Decode(owner) ?? new Uint8Array(32), 32);
                new DataView(data.buffer).setBigUint64(64, BigInt(amount), true);
                return { owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', lamports: 2039280, data };
            };
            state.before.set(address, make(before));
            state.after.set(address, make(after));
        },
        /** Makes the simulation fail with this error, after these program logs. */
        failSimulation(error: unknown, logs: string[] = []) {
            state.failure = error;
            state.logs = logs;
        },
        /** Makes the RPC answer `method` with an HTTP refusal instead of JSON. */
        refuse(method: string, status: number, body: string) {
            state.refused = { method, status, body };
        },
        /** Makes the RPC refuse the signed blockhash unless the simulation replaces it. */
        expireBlockhash() {
            state.blockhashExpired = true;
        },
        tokens: `http://127.0.0.1:${port}/tokens`,
        /** The API as the extension should be pointed at: this server's relay. */
        api: `http://127.0.0.1:${port}/api`,
        /** The calls relayed to the API so far. */
        apiCalls: api.calls,
        apiMissed: api.missed,
        apiDrifted: api.drifted,
        /** Makes the relay answer every API call with this status and body instead. */
        refuseApi(
            status: number,
            body = '{"schema":"signlens-api/1","error":{"code":"busy","message":"every worker is busy; try again"}}',
        ) {
            api.answers = [{ status, body }];
        },
        /** Makes the relay answer the API calls with these documents in turn, the last for every call after, as the API would with HTTP 200. */
        answerApi(...documents: unknown[]) {
            api.answers = documents.map((document) => ({ status: 200, body: JSON.stringify(document) }));
        },
        close: () => {
            // The browser keeps connections alive; close waits for them otherwise.
            server.closeAllConnections();
            return new Promise<void>((resolve) => server.close(() => resolve()));
        },
    };
}
