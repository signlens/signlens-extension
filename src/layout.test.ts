// The folders under src/ are split by where the code runs, and they import
// one way only: page/ imports nothing, shared/ nothing of the others, and
// worker/ and ui/ nothing of each other. Tests may reach anywhere.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const SRC = new URL('./', import.meta.url);
const FOLDERS = ['page', 'worker', 'ui', 'shared', 'testing'] as const;
type Folder = (typeof FOLDERS)[number];

/** What each folder may import from, besides itself. */
const MAY: Record<Folder, Folder[]> = {
    page: [],
    worker: ['shared'],
    ui: ['shared'],
    shared: [],
    testing: [],
};

/** The folders `source` imports from: every relative specifier, types included, that leaves its own folder. */
function importsOf(source: string): string[] {
    const found: string[] = [];
    for (const match of source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*'(\.[^']*)'/g)) {
        const spec = match[1] ?? '';
        const leaving = /^\.\.\/([a-z]+)\//.exec(spec);
        found.push(leaving ? (leaving[1] ?? '') : spec.startsWith('./') ? '.' : `outside src (${spec})`);
    }
    return found;
}

test('src/ holds only the folders, and the tests about the whole extension', () => {
    const entries = readdirSync(SRC, { withFileTypes: true });
    assert.deepEqual(
        entries
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort(),
        [...FOLDERS].sort(),
    );
    for (const file of entries.filter((e) => e.isFile())) assert.match(file.name, /\.test\.ts$/, `${file.name} belongs in a folder`);
});

test('each folder imports only what it may', () => {
    for (const folder of FOLDERS) {
        for (const name of readdirSync(new URL(`${folder}/`, SRC))) {
            if (name.endsWith('.test.ts')) continue;
            const source = readFileSync(new URL(`${folder}/${name}`, SRC), 'utf8');
            for (const from of importsOf(source)) {
                if (from === '.') continue;
                assert.ok((MAY[folder] as string[]).includes(from), `src/${folder}/${name} imports from ${from}, which ${folder}/ may not`);
            }
        }
    }
});

test('the page scripts import nothing at all: they run as classic scripts in the page', () => {
    for (const name of ['content.ts', 'injected.ts']) {
        assert.deepEqual(importsOf(readFileSync(new URL(`page/${name}`, SRC), 'utf8')), [], name);
    }
});
