// The program each top-level instruction of a transaction calls, read from
// its bytes: legacy, v0 and v1 alike. Programs are always static keys, so
// no lookup table is needed. Apart from the worker's solana.ts, so that the
// window, which reports what it showed, loads this and not the RPC calls.

import { base58Encode } from './base58.ts';

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

/** The bytes of base64 `text`, or null when it is not base64. */
export function base64Bytes(text: string): Uint8Array | null {
    try {
        const binary = atob(text);
        return Uint8Array.from(binary, (c) => c.charCodeAt(0));
    } catch {
        return null;
    }
}

/** The base58 program of each top-level instruction of `transaction`, in order. */
export function instructionPrograms(transaction: Uint8Array): string[] {
    if (transaction.length === 0) throw new Error('transaction is empty');
    const reader = new Reader(transaction);
    const keys: string[] = [];
    const programs: number[] = [];
    if (transaction[0] === 0x81) {
        // v1 (SIMD-0385): the message first. After the header, the config
        // mask, the lifetime and one-byte instruction and account counts;
        // then the keys, four bytes per config bit set, and each
        // instruction's program, account count and data length (u16)
        // ahead of the payloads.
        reader.take(4);
        const mask = new DataView(reader.take(4).slice().buffer).getUint32(0, true);
        reader.take(32);
        const instructions = reader.u8();
        const count = reader.u8();
        for (let i = 0; i < count; i += 1) keys.push(base58Encode(reader.take(32)));
        let bits = 0;
        for (let m = mask & 0x1f; m; m >>= 1) bits += m & 1;
        reader.take(4 * bits);
        for (let i = 0; i < instructions; i += 1) {
            programs.push(reader.u8());
            reader.take(3);
        }
    } else {
        reader.take(reader.compactU16() * 64);
        const first = reader.u8();
        if ((first & 0x80) !== 0) {
            if (first !== 0x80) throw new Error(`unsupported message version ${first & 0x7f}`);
            reader.take(3);
        } else {
            reader.take(2);
        }
        const count = reader.compactU16();
        for (let i = 0; i < count; i += 1) keys.push(base58Encode(reader.take(32)));
        reader.take(32);
        for (let n = reader.compactU16(); n > 0; n -= 1) {
            programs.push(reader.u8());
            reader.take(reader.compactU16());
            reader.take(reader.compactU16());
        }
    }
    return programs.map((index) => {
        const key = keys[index];
        if (key === undefined) throw new Error('an instruction names a program outside the keys');
        return key;
    });
}
