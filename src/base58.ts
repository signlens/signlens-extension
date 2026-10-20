// Solana addresses as they are written: base58, of 32 bytes. Apart from
// solana.ts, so that the pages (the settings check addresses as they are
// typed) load this and not the worker's RPC calls.

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Base58 of `bytes`, as addresses are written. */
export function base58Encode(bytes: Uint8Array): string {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    let out = '';
    while (n > 0n) {
        out = ALPHABET[Number(n % 58n)] + out;
        n /= 58n;
    }
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
    return '1'.repeat(zeros) + out;
}

/** The 32 bytes `text` is the base58 of, or `null` if it is not an address. */
export function base58Decode(text: unknown): Uint8Array | null {
    if (typeof text !== 'string' || text.length < 32 || text.length > 44) return null;
    let n = 0n;
    for (const c of text) {
        const digit = ALPHABET.indexOf(c);
        if (digit < 0) return null;
        n = n * 58n + BigInt(digit);
    }
    if (n >> 256n !== 0n) return null;
    const bytes = new Uint8Array(32);
    for (let i = 31; i >= 0; i -= 1) {
        bytes[i] = Number(n & 0xffn);
        n >>= 8n;
    }
    // One leading '1' per leading zero byte, no more and no fewer.
    let ones = 0;
    while (ones < text.length && text[ones] === '1') ones += 1;
    let zeros = 0;
    while (zeros < 32 && bytes[zeros] === 0) zeros += 1;
    return ones === zeros ? bytes : null;
}

/** Whether `text` is the base58 of exactly 32 bytes. */
export function isAddress(text: unknown): text is string {
    return base58Decode(text) !== null;
}
