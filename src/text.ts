// Text from elsewhere (the page, the RPC, the API, a program's logs) as
// SignLens keeps and shows it: never with control characters, and ASCII
// only where a short line is all there is to tell two things apart; and
// the short forms of origins, methods and addresses every page uses.

/** `text` without control characters other than newline and tab. */
export function withoutControls(text: unknown): string {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is stripped
    return String(text ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '?');
}

/** `text` as printable ASCII, cut to `max`: an origin or a method, which never need more. */
export function printable(text: unknown, max: number): string {
    return withoutControls(text)
        .replace(/[^\x20-\x7e]/g, '?')
        .slice(0, max);
}

/** An error as one line to show. */
export function describe(error: unknown): string {
    return withoutControls(error instanceof Error ? error.message : String(error));
}

/** An origin without its scheme: its host, and its port if it has one. */
export function withoutScheme(origin: string | undefined): string {
    return (origin ?? '').replace(/^\w+:\/\//, '');
}

/** A Wallet Standard method without its namespace: `signTransaction` for `solana:signTransaction`. */
export function methodName(method: string | undefined): string {
    return (method ?? '').replace(/^\w+:/, '');
}

/** An address shortened as the engine shortens it, four characters each end; text that is not address-like stays whole. */
export function short(text: string): string {
    if (text.length <= 12 || /[^0-9A-Za-z]/.test(text)) return text;
    return `${text.slice(0, 4)}…${text.slice(-4)}`;
}
