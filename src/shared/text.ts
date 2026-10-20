// Text from elsewhere (the page, the RPC, the API, a program's logs) as
// SignLens keeps and shows it: never with control characters, nor with
// characters that hide or reorder the text around them, and ASCII only
// where a short line is all there is to tell two things apart; and the
// short forms of origins, methods and addresses every page uses.

/**
 * Control characters other than newline and tab, and what reorders or hides
 * text: bidirectional controls, zero-width characters, the separators that
 * break a line, invisible fillers, and tags. The zero-width joiner and
 * non-joiner are `LONE_JOINER`'s.
 */
const HIDDEN =
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is matched
    /[\x00-\x08\x0b-\x1f\x7f-\x9f\xad\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b\u200e\u200f\u2028-\u202e\u2060-\u206f\u3164\ufeff\uffa0\ufff9-\ufffb\u{e0000}-\u{e007f}]|\u034f/gu;

/**
 * A zero-width joiner or non-joiner without a non-ASCII character on each
 * side. Between two, it is part of the text: an emoji sequence, Persian,
 * an Indic script. Beside ASCII, or at an end, it would only hide: a name
 * read in ASCII could pass for another ("Jup?iter" for "Jupiter").
 */
const LONE_JOINER =
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the class is everything but ASCII, written as its complement
    /(?<![^\x00-\x7f])[\u200c\u200d]|[\u200c\u200d](?![^\x00-\x7f])/gu;

/** `text` with each character in `HIDDEN`, and each `LONE_JOINER`, as "?", so that what was there still shows. */
export function withoutControls(text: unknown): string {
    return String(text ?? '')
        .replace(HIDDEN, '?')
        .replace(LONE_JOINER, '?');
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

/**
 * What a failure that changes nothing of the answer is handed to (the
 * badge, the history, a convenience for the popup): it is logged, as
 * "SignLens could not <what>", and goes no further.
 */
export function logged(what: string): (error: unknown) => void {
    return (error) => console.error(`SignLens could not ${what}`, error);
}
