// The icons are the one drawing in docs/design/icon.svg (scripts/icons.ts):
// the wallet icon is that SVG, and each PNG is the size the manifest says.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { iconIn, SIZES, walletIcon } from '../scripts/icons.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root));

test('the wallet icon a dapp shows is the drawing in docs/design/icon.svg', () => {
    const icon = iconIn(read('src/page/injected.ts').toString('utf8'));
    assert.ok(icon, 'injected.ts has a wallet icon');
    assert.equal(icon, walletIcon(read('docs/design/icon.svg').toString('utf8')), 'run `npm run icons` after changing the drawing');
});

test('each icon PNG is the size its name and the manifest give it', () => {
    const manifest = JSON.parse(read('static/manifest.json').toString('utf8')) as { icons: Record<string, string> };
    assert.deepEqual(
        Object.keys(manifest.icons).map(Number),
        SIZES.map((s) => s.size),
    );
    for (const { size } of SIZES) {
        const png = read(`static/icons/icon-${size}.png`);
        // The PNG signature, then the IHDR chunk: width and height, big-endian.
        assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
        assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [size, size], `icon-${size}.png`);
    }
});

/** The RGBA pixels of an 8-bit, non-interlaced RGBA PNG, row by row. */
function pixels(png: Buffer): { width: number; height: number; at(x: number, y: number): [number, number, number, number] } {
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.deepEqual([png.readUInt8(24), png.readUInt8(25), png.readUInt8(28)], [8, 6, 0], '8-bit RGBA, not interlaced');
    const data: Buffer[] = [];
    for (let at = 8; at < png.length; ) {
        const length = png.readUInt32BE(at);
        if (png.subarray(at + 4, at + 8).toString('latin1') === 'IDAT') data.push(png.subarray(at + 8, at + 8 + length));
        at += length + 12;
    }
    const raw = inflateSync(Buffer.concat(data));
    const stride = width * 4;
    const out = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y += 1) {
        const filter = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x += 1) {
            const byte = raw[y * (stride + 1) + 1 + x] ?? 0;
            const left = x >= 4 ? (out[y * stride + x - 4] ?? 0) : 0;
            const up = y > 0 ? (out[(y - 1) * stride + x] ?? 0) : 0;
            const corner = x >= 4 && y > 0 ? (out[(y - 1) * stride + x - 4] ?? 0) : 0;
            const guess = left + up - corner;
            const paeth =
                Math.abs(guess - left) <= Math.abs(guess - up) && Math.abs(guess - left) <= Math.abs(guess - corner)
                    ? left
                    : Math.abs(guess - up) <= Math.abs(guess - corner)
                      ? up
                      : corner;
            const add = [0, left, up, (left + up) >> 1, paeth][filter ?? 0] ?? 0;
            out[y * stride + x] = (byte + add) & 0xff;
        }
    }
    return { width, height, at: (x, y) => [0, 1, 2, 3].map((c) => out[y * stride + x * 4 + c] ?? 0) as [number, number, number, number] };
}

/** The smallest box holding every pixel not fully transparent: [left, top, right, bottom], right and bottom exclusive. */
function drawn(icon: ReturnType<typeof pixels>): [number, number, number, number] {
    let [left, top, right, bottom] = [icon.width, icon.height, 0, 0];
    for (let y = 0; y < icon.height; y += 1) {
        for (let x = 0; x < icon.width; x += 1) {
            if (icon.at(x, y)[3] === 0) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x + 1);
            bottom = Math.max(bottom, y + 1);
        }
    }
    return [left, top, right, bottom];
}

test('the store icon is the drawing at 96 px inside 16 px of transparent padding, as the Chrome Web Store asks', () => {
    const [left, top, right, bottom] = drawn(pixels(read('static/icons/icon-128.png')));
    // Nothing in the border...
    assert.ok(left >= 16 && top >= 16 && right <= 112 && bottom <= 112, `drawn within the 96 px square: ${[left, top, right, bottom]}`);
    // ...and the drawing at its 96 px size, not smaller: it spans about four fifths of that square.
    assert.ok(right - left >= 67 && bottom - top >= 67, `drawn at 96 px: ${right - left} x ${bottom - top}`);
});

test('the toolbar icons are the drawing at their full size, with no padding of their own', () => {
    for (const size of [16, 32, 48]) {
        const [left, top, right, bottom] = drawn(pixels(read(`static/icons/icon-${size}.png`)));
        assert.ok(right - left >= 0.7 * size && bottom - top >= 0.7 * size, `icon-${size}.png spans ${right - left} x ${bottom - top}`);
    }
});
