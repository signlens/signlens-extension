// The SignLens API as the worker drives it: the engine's request with the
// transaction inside it goes out as JSON, the engine's explanation document
// comes back unchanged. This file has no browser dependency beyond `fetch`,
// so the same code is tested in Node. Later the WebAssembly module takes
// this file's place and nothing else changes.

import { toBase64 } from './solana.ts';
import { type EngineAnswer, type EngineRequest, type ErrorDocument, type Feedback, isError, type PacksDocument } from './types.ts';

export const EXPLANATION_SCHEMA = 'signlens-explanation/1';
const TIMEOUT_MS = 20_000;

export type RowVerdict = 'ok' | 'warning' | 'blocked';

export interface ApiStatus {
    engine: string;
    programs: number;
    tokens: number;
    packsAt: number | null;
}

/** `apiUrl` without a trailing slash. */
function root(apiUrl: string): string {
    return apiUrl.trim().replace(/\/+$/, '');
}

function isHttp(base: string): boolean {
    return /^https?:\/\//.test(base);
}

/** An error document in the engine's own shape, so callers read one kind. */
function errorDocument(code: string, message: string): ErrorDocument {
    return { schema: 'signlens-api/1', error: { code, message } };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Asks the API what the engine makes of `bytes` with `request`. Returns
 * the explanation document, or an error document; never throws. A server
 * that does not answer, answers late or answers something else is an
 * error document, which the wallet shows as "could not explain", never as
 * "nothing wrong".
 */
export async function explainRemotely(apiUrl: string, bytes: Uint8Array, request: EngineRequest = {}): Promise<EngineAnswer> {
    const base = root(apiUrl);
    if (!isHttp(base)) return errorDocument('api', 'the API address in the settings is not an http(s) URL');
    let response: Response;
    try {
        response = await fetch(`${base}/v1/explain`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ transaction: toBase64(bytes), ...request }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (error) {
        return errorDocument('api', `the SignLens API at ${base} did not answer (${describe(error)})`);
    }
    let document: unknown;
    try {
        document = await response.json();
    } catch {
        return errorDocument('api', `the SignLens API answered HTTP ${response.status} without a document`);
    }
    if (typeof document !== 'object' || document === null) {
        return errorDocument('api', `the SignLens API answered HTTP ${response.status} with something that is not an explanation`);
    }
    const answer = document as EngineAnswer;
    if (isError(answer)) return answer;
    if (!response.ok || answer.schema !== EXPLANATION_SCHEMA) {
        return errorDocument('api', `the SignLens API answered HTTP ${response.status} with something that is not an explanation`);
    }
    return answer;
}

/** What the API is: its engine version and packs, from `GET /v1/packs`, or `{error}`. */
export async function apiStatus(apiUrl: string): Promise<ApiStatus | { error: string }> {
    const base = root(apiUrl);
    if (!isHttp(base)) return { error: 'the API address in the settings is not an http(s) URL' };
    try {
        const response = await fetch(`${base}/v1/packs`, { signal: AbortSignal.timeout(5_000) });
        const packs = (await response.json()) as Partial<PacksDocument>;
        if (!response.ok || !packs.descriptorPack) return { error: `the API at ${base} answered HTTP ${response.status}` };
        return {
            engine: packs.engine ?? '?',
            programs: packs.descriptorPack.programs,
            tokens: packs.tokenSnapshot?.tokens ?? 0,
            packsAt: packs.descriptorPack.createdAt ?? null,
        };
    } catch (error) {
        return { error: `the API at ${base} did not answer (${describe(error)})` };
    }
}

/**
 * Sends feedback about an explanation: a rating, a comment, and the
 * transaction only when the user asked for it to be covered. Resolves to
 * `true` when the API took it.
 */
export async function sendFeedback(apiUrl: string, feedback: Feedback): Promise<boolean> {
    const base = root(apiUrl);
    if (!isHttp(base)) return false;
    try {
        const response = await fetch(`${base}/v1/feedback`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ comment: '', transaction: null, ...feedback }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return response.status === 204;
    } catch {
        return false;
    }
}

/** The verdict a popup row shows for an explanation document, or `null` for an error document. */
export function rowVerdict(answer: EngineAnswer): RowVerdict | null {
    if (isError(answer)) return null;
    const verdicts: Record<string, RowVerdict> = { Ok: 'ok', Warn: 'warning', Block: 'blocked' };
    return verdicts[(answer as { verdict?: string }).verdict ?? ''] ?? null;
}
