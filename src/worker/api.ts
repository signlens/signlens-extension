// The SignLens API as the worker drives it: the engine's request with the
// transaction inside it goes out as JSON, and the engine's explanation
// document comes back, checked and typed by `parseExplanation`
// (explanation.ts). This file has no browser dependency beyond `fetch`,
// so the same code is tested in Node. Later the WebAssembly module takes
// the place of `explainRemotely`; the feedback and the status are the
// server's, and go with it.

import { refusedEndpoint, within } from '../shared/endpoint.ts';
import { objectFields } from '../shared/json.ts';
import { describe, printable } from '../shared/text.ts';
import { type ApiStatus, type EngineAnswer, type EngineRequest, type ErrorDocument, type Feedback, isError } from '../shared/types.ts';
import { DocumentError, EXPLANATION_SCHEMA, parseExplanation } from './explanation.ts';
import { toBase64 } from './solana.ts';

const TIMEOUT_MS = 20_000;
/** The longest answer read, in characters: an explanation is tens of kilobytes. */
const MAX_DOCUMENT = 2_000_000;
/** What a deploy, a restart or a busy server looks like from here: worth one more try. */
const RETRY_STATUSES = new Set([502, 503, 530]);
/** The pause before that try without a `Retry-After`, and the longest with one. */
const RETRY_PAUSE_MS = 500;
const MAX_RETRY_PAUSE_MS = 2_000;
/** The code of the error document for a call the API refused for its limit, whatever the API's own code: the calls after it would be refused too. */
export const LIMITED = 'limited';

/** `apiUrl` without a trailing slash. */
function root(apiUrl: string): string {
    return apiUrl.trim().replace(/\/+$/, '');
}

/** Waits `ms`, or rejects as soon as `signal` gives up. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(signal.reason);
        const timer = setTimeout(resolve, ms);
        signal.addEventListener(
            'abort',
            () => {
                clearTimeout(timer);
                reject(signal.reason);
            },
            { once: true },
        );
    });
}

/** The pause a `Retry-After` of whole seconds asks for, within `MAX_RETRY_PAUSE_MS`. */
function retryPause(retryAfter: string | null): number {
    const seconds = Number(retryAfter);
    if (retryAfter === null || retryAfter.trim() === '' || !Number.isFinite(seconds) || seconds < 0) return RETRY_PAUSE_MS;
    return Math.min(seconds * 1_000, MAX_RETRY_PAUSE_MS);
}

/**
 * `send`, and once more after a short pause when the first try met no
 * server or an answer in `RETRY_STATUSES`: the second answer stands,
 * whatever it is. A request `signal` gave up on is not tried again. Only
 * for requests that change nothing on the server, which a second try
 * cannot do twice.
 */
async function withOneRetry(send: () => Promise<Response>, signal: AbortSignal): Promise<Response> {
    let wait = RETRY_PAUSE_MS;
    try {
        const first = await send();
        if (!RETRY_STATUSES.has(first.status)) return first;
        wait = retryPause(first.headers.get('retry-after'));
        await first.body?.cancel();
    } catch (error) {
        if (signal.aborted) throw error;
    }
    await pause(wait, signal);
    return send();
}

/** An error document in the API's shape, so callers read one kind. */
function errorDocument(code: string, message: string): ErrorDocument {
    return { schema: 'signlens-api-error/1', error: { code, message } };
}

/** The API's error document, its own or the engine's refusal, with only what is shown of it, cut to size. */
function passedOn(document: ErrorDocument): ErrorDocument {
    const code = typeof document.error.code === 'string' ? document.error.code.slice(0, 100) : 'api';
    return errorDocument(code, document.error.message.slice(0, 2_000));
}

/**
 * Asks the API what the engine makes of `bytes` with `request`. Returns
 * the explanation document, or an error document; never throws. A server
 * that does not answer, answers late or answers something else is an
 * error document, which the wallet shows as "could not explain", never as
 * "nothing wrong". `stop` gives the call up: the request it is for went.
 */
export async function explainRemotely(
    apiUrl: string,
    bytes: Uint8Array,
    request: EngineRequest,
    stop?: AbortSignal,
): Promise<EngineAnswer> {
    const base = root(apiUrl);
    const problem = refusedEndpoint(base, 'API');
    if (problem) return errorDocument('api', problem);
    let response: Response;
    const signal = within(TIMEOUT_MS, stop);
    const body = JSON.stringify({ transaction: toBase64(bytes), ...request });
    try {
        // An explanation changes nothing on the server, so a deploy or a
        // restart between two tries is no harm.
        response = await withOneRetry(
            () => fetch(`${base}/v2/explain`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal }),
            signal,
        );
    } catch (error) {
        return errorDocument('api', `the SignLens API at ${base} did not answer (${describe(error)})`);
    }
    // An API from before /v2 has no such path, and would say the API lives under /v1.
    if (response.status === 404) {
        return errorDocument(
            'api',
            `the SignLens API at ${base} does not serve /v2/explain, which this version needs: update it, or use the default API in the settings`,
        );
    }
    // Refused for its limit, in the API's words or not: the calls after it would be refused too.
    const code = response.status === 429 ? LIMITED : 'api';
    const notAnExplanation = errorDocument(
        code,
        `the SignLens API answered HTTP ${response.status} with something that is not an explanation`,
    );
    if (Number(response.headers.get('content-length')) > MAX_DOCUMENT) return notAnExplanation;
    let document: unknown;
    try {
        const body = await response.text();
        if (body.length > MAX_DOCUMENT) return notAnExplanation;
        document = JSON.parse(body);
    } catch {
        return errorDocument(code, `the SignLens API answered HTTP ${response.status} without a document`);
    }
    if (typeof document !== 'object' || document === null) return notAnExplanation;
    if (isError(document)) return code === LIMITED ? errorDocument(LIMITED, passedOn(document).error.message) : passedOn(document);
    if (!response.ok || (document as { schema?: unknown }).schema !== EXPLANATION_SCHEMA) return notAnExplanation;
    try {
        return parseExplanation(document);
    } catch (error) {
        if (!(error instanceof DocumentError)) throw error;
        return errorDocument('api', `the SignLens API answered an explanation this version cannot read: ${error.message}`);
    }
}

/** A count from elsewhere: a whole number, not negative, or `null`. */
function count(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * What the API is: its engine version and packs, from `GET /v1/packs`, or
 * `{error}`. The document is read field by field, as the explanation is:
 * one without its program count is not a status, and the engine's name is
 * shown as plain text. It is asked past the browser's cache, whatever the
 * answer's headers say: a status kept from earlier would call an API ready
 * that no longer answers, or show packs a refresh has replaced.
 */
export async function apiStatus(apiUrl: string): Promise<ApiStatus | { error: string }> {
    const base = root(apiUrl);
    const problem = refusedEndpoint(base, 'API');
    if (problem) return { error: problem };
    try {
        const signal = AbortSignal.timeout(5_000);
        const response = await withOneRetry(() => fetch(`${base}/v1/packs`, { cache: 'no-store', signal }), signal);
        if (!response.ok) return { error: `the API at ${base} answered HTTP ${response.status}` };
        const packs = objectFields(await response.json().catch(() => null));
        const pack = objectFields(packs?.descriptor_pack);
        const programs = count(pack?.programs);
        if (!packs || programs === null) return { error: `the API at ${base} answered a status this version cannot read` };
        return {
            engine: typeof packs.engine === 'string' ? printable(packs.engine, 40) : '?',
            programs,
            tokens: count(objectFields(packs.token_snapshot)?.tokens) ?? 0,
            packsAt: typeof pack?.created_at === 'number' && Number.isFinite(pack.created_at) ? pack.created_at : null,
        };
    } catch (error) {
        return { error: `the API at ${base} did not answer (${describe(error)})` };
    }
}

/**
 * Sends feedback about an explanation: a rating, a comment, and the
 * transaction only when the user asked for it to be covered. Resolves to
 * `true` when the API took it. Tried once: a record that reached the
 * server before its answer was lost would be kept twice.
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
