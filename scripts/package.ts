// `npm run package`: the extension as the stores take it, a zip under
// dist/ for Chrome and one for Firefox (the same files, with the manifest
// firefox-manifest.ts derives), built so that the same source gives the
// same bytes: entries in sorted order, stored uncompressed, every
// timestamp fixed. Each SHA-256 is printed and written beside its zip, so
// a published package can be checked against a build of its tag.

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefoxManifest, type Manifest } from './firefox-manifest.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const EXTENSION = join(ROOT, 'extension');
const DIST = join(ROOT, 'dist');

const version = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;

/** Every file under `dir`, as paths relative to it, sorted. */
function files(dir: string): string[] {
    const out: string[] = [];
    const walk = (at: string) => {
        for (const entry of readdirSync(at).sort()) {
            const path = join(at, entry);
            if (statSync(path).isDirectory()) walk(path);
            else out.push(relative(dir, path).split(/[\\/]/).join(posix.sep));
        }
    };
    walk(dir);
    return out.sort();
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** A store-only zip of `entries`, with one fixed DOS timestamp (2000-01-01). */
function zip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
    const DOS_TIME = 0;
    const DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1;
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBytes = new TextEncoder().encode(name);
        const crc = crc32(data);
        const local = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0x0800, true);
        lv.setUint16(8, 0, true);
        lv.setUint16(10, DOS_TIME, true);
        lv.setUint16(12, DOS_DATE, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        local.set(nameBytes, 30);
        const central = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0x0800, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, DOS_TIME, true);
        cv.setUint16(14, DOS_DATE, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);
        cv.setUint16(32, 0, true);
        cv.setUint16(34, 0, true);
        cv.setUint16(36, 0, true);
        cv.setUint32(38, 0, true);
        cv.setUint32(42, offset, true);
        central.set(nameBytes, 46);
        locals.push(local, data);
        centrals.push(central);
        offset += local.length + data.length;
    }
    const centralSize = centrals.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);
    const total = offset + centralSize + end.length;
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of [...locals, ...centrals, end]) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}

// What belongs in the package: the static files, and one script per source
// that is not a test, a test's fake or a declaration (which compiles to
// nothing). Anything else in extension/ is a
// leftover of an old build and refuses the package rather than ship.
const SOURCES = join(ROOT, 'src');
const expected = new Set([
    ...files(SOURCES)
        .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.fake.ts') && !name.endsWith('.d.ts'))
        .map((name) => name.replace(/\.ts$/, '.js')),
    'manifest.json',
    'popup.html',
    'style.css',
    'confirm.html',
    'connect.html',
    'address.html',
    ...['16', '32', '48', '128'].map((size) => `icons/icon-${size}.png`),
]);
const present = files(EXTENSION);
const missing = [...expected].filter((name) => !present.includes(name));
const stray = present.filter((name) => !expected.has(name));
if (missing.length > 0) {
    console.error(`the extension is not built (missing ${missing.join(', ')}); run \`npm run build\` first`);
    process.exit(1);
}
if (stray.length > 0) {
    console.error(`extension/ holds files that are not part of the package: ${stray.join(', ')}; remove them`);
    process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(EXTENSION, 'manifest.json'), 'utf8')) as Manifest & { version: string };
if (manifest.version !== version) {
    console.error(`extension/manifest.json says version ${manifest.version} but package.json says ${version}`);
    process.exit(1);
}
const entries = present.map((name) => ({ name, data: new Uint8Array(readFileSync(join(EXTENSION, name))) }));
const firefox = entries.map((entry) =>
    entry.name === 'manifest.json'
        ? { name: entry.name, data: new TextEncoder().encode(`${JSON.stringify(firefoxManifest(manifest), null, 2)}\n`) }
        : entry,
);
mkdirSync(DIST, { recursive: true });
for (const [name, list] of [
    [`signlens-extension-${version}.zip`, entries],
    [`signlens-extension-firefox-${version}.zip`, firefox],
] as const) {
    const bytes = zip(list);
    const digest = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(DIST, name), bytes);
    writeFileSync(join(DIST, `${name}.sha256`), `${digest}  ${name}\n`);
    console.log(`${digest}  dist/${name} (${list.length} files, ${bytes.length} bytes)`);
}
