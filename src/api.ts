// The SignLens API as the worker drives it: the engine's request with the
// transaction inside it goes out as JSON, and the engine's explanation
// document comes back, checked and typed by `parseExplanation`
// (explanation.ts). This file has no browser dependency beyond `fetch`,
// so the same code is tested in Node. Later the WebAssembly module takes
// the place of `explainRemotely`; the feedback and the status are the
// server's, and go with it.

import { refusedEndpoint } from './endpoint.ts';
import { DocumentError, EXPLANATION_SCHEMA, parseExplanation } from './explanation.ts';
import { toBase64 } from './solana.ts';
import { describe } from './text.ts';
import { type EngineAnswer, type EngineRequest, type ErrorDocument, type Feedback, isError, type PacksDocument } from './types.ts';

const TIMEOUT_MS = 20_000;
/** The longest answer read, in characters: an explanation is tens of kilobytes. */
const MAX_DOCUMENT = 2_000_000;

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

/** An error document in the engine's own shape, so callers read one kind. */
function errorDocument(code: string, message: string): ErrorDocument {
    return { schema: 'signlens-api/1', error: { code, message } };
}

/** The engine's or the API's own error document, with only what is shown of it, cut to size. */
function passedOn(document: ErrorDocument): ErrorDocument {
    const code = typeof document.error.code === 'string' ? document.error.code.slice(0, 100) : 'api';
    return errorDocument(code, document.error.message.slice(0, 2_000));
}

/**
 * Asks the API what the engine makes of `bytes` with `request`. Returns
 * the explanation document, or an error document; never throws. A server
 * that does not answer, answers late or answers something else is an
 * error document, which the wallet shows as "could not explain", never as
 * "nothing wrong".
 */
export async function explainRemotely(apiUrl: string, bytes: Uint8Array, request: EngineRequest): Promise<EngineAnswer> {
    const base = root(apiUrl);
    const problem = refusedEndpoint(base, 'API');
    if (problem) return errorDocument('api', problem);
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
    const notAnExplanation = errorDocument(
        'api',
        `the SignLens API answered HTTP ${response.status} with something that is not an explanation`,
    );
    if (Number(response.headers.get('content-length')) > MAX_DOCUMENT) return notAnExplanation;
    let document: unknown;
    try {
        const body = await response.text();
        if (body.length > MAX_DOCUMENT) return notAnExplanation;
        document = JSON.parse(body);
    } catch {
        return errorDocument('api', `the SignLens API answered HTTP ${response.status} without a document`);
    }
    if (typeof document !== 'object' || document === null) return notAnExplanation;
    if (isError(document)) return passedOn(document);
    if (!response.ok || (document as { schema?: unknown }).schema !== EXPLANATION_SCHEMA) return notAnExplanation;
    try {
        return parseExplanation(document);
    } catch (error) {
        if (!(error instanceof DocumentError)) throw error;
        return errorDocument('api', `the SignLens API answered an explanation this version cannot read: ${error.message}`);
    }
}

/** What the API is: its engine version and packs, from `GET /v1/packs`, or `{error}`. */
export async function apiStatus(apiUrl: string): Promise<ApiStatus | { error: string }> {
    const base = root(apiUrl);
    const problem = refusedEndpoint(base, 'API');
    if (problem) return { error: problem };
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
    if (refusedEndpoint(base, 'API')) return false;
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
