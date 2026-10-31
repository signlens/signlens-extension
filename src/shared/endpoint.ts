// Where the extension may send what it is asked about: an https address,
// or plain http to this machine. The API is sent the transaction and the
// address book, the RPC the transaction, the token list the mints, so
// none of it in the clear. The popup refuses any other address as it is
// typed; the worker checks again at each use, since storage can hold one
// saved before the rule, or written some other way.

import { t } from './words.ts';

/** The names plain http may go to, each with a host permission in the manifest (manifest.test.ts). */
export const LOOPBACK: readonly string[] = ['localhost', '127.0.0.1'];

/** Why `url` cannot be an endpoint, or `null` when it can. */
export function endpointProblem(url: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return t('worker-endpoint-not-url');
    }
    if (parsed.protocol === 'https:') return null;
    if (parsed.protocol !== 'http:') return t('worker-endpoint-not-http');
    return LOOPBACK.includes(parsed.hostname)
        ? null
        : t('worker-endpoint-plain-http', { hosts: LOOPBACK.join(t('worker-list-separator')) });
}

/** Every https site: where dapps run and where the endpoints are, unless one is on this machine. */
export const HTTPS_HOSTS = 'https://*/*';

/**
 * The host permissions `endpoints` need: every https site, and a loopback
 * host only for an endpoint on it (a local API or RPC, for development).
 * Chrome grants the manifest's whole list at install; Firefox asks, and
 * the popup asks it for no more than this, so a user who runs nothing
 * locally never grants this machine.
 */
export function hostsNeeded(endpoints: readonly string[]): string[] {
    const hosts = [HTTPS_HOSTS];
    for (const endpoint of endpoints) {
        let parsed: URL;
        try {
            parsed = new URL(endpoint.trim());
        } catch {
            continue;
        }
        const host = `http://${parsed.hostname}/*`;
        if (parsed.protocol === 'http:' && LOOPBACK.includes(parsed.hostname) && !hosts.includes(host)) hosts.push(host);
    }
    return hosts;
}

/** The message that says an endpoint's address in the settings is not usable, by what the endpoint is. */
const REFUSED = {
    API: 'worker-endpoint-refused-api',
    RPC: 'worker-endpoint-refused-rpc',
    'token list': 'worker-endpoint-refused-tokens',
} as const;

/** Why `url`, the `what` address in the settings, is not to be used, as a line to show; `null` when it may be. */
export function refusedEndpoint(url: string, what: keyof typeof REFUSED): string | null {
    const problem = endpointProblem(url);
    return problem && t(REFUSED[what], { problem });
}

/**
 * The signal a call to an endpoint goes with: it stops after `ms`, or when
 * `stop` does (the request the call is for went), with `stop`'s reason.
 * Chrome before 116 has no `AbortSignal.any`.
 */
export function within(ms: number, stop?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(ms);
    if (!stop) return timeout;
    const either = new AbortController();
    if (stop.aborted) either.abort(stop.reason);
    stop.addEventListener('abort', () => either.abort(stop.reason), { once: true });
    timeout.addEventListener('abort', () => either.abort(timeout.reason), { once: true });
    return either.signal;
}
