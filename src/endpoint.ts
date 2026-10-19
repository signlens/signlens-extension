// Where the extension may send what it is asked about: an https address,
// or plain http to this machine. The API is sent the transaction and the
// address book, the RPC the transaction, the token list the mints, so
// none of it in the clear. The popup refuses any other address as it is
// typed; the worker checks again at each use, since storage can hold one
// saved before the rule, or written some other way.

/** The names plain http may go to, each with a host permission in the manifest (manifest.test.ts). */
export const LOOPBACK: readonly string[] = ['localhost', '127.0.0.1'];

/** Why `url` cannot be an endpoint, or `null` when it can. */
export function endpointProblem(url: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return 'not a URL';
    }
    if (parsed.protocol === 'https:') return null;
    if (parsed.protocol !== 'http:') return 'not an http(s) URL';
    return LOOPBACK.includes(parsed.hostname) ? null : `plain http is for this machine only (${LOOPBACK.join(', ')}); use https`;
}

/** Why `url`, the `what` address in the settings, is not to be used, as a line to show; `null` when it may be. */
export function refusedEndpoint(url: string, what: string): string | null {
    const problem = endpointProblem(url);
    return problem && `the ${what} address in the settings is not usable: ${problem}`;
}
