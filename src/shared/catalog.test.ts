import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CATALOG, generate } from '../../scripts/messages.ts';
import { CATALOGS } from './catalog.ts';

const ROOT = join(import.meta.dirname, '../..');

/** Every file under `dir` whose name ends with `suffix`. */
function files(dir: string, suffix: string): string[] {
    return readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith(suffix) && !name.endsWith('.test.ts'))
        .map((name) => join(ROOT, dir, name));
}

test('the catalog is what the messages compile to, and they compile cleanly', () => {
    const { text, problems } = generate();
    assert.deepEqual(problems, []);
    assert.equal(readFileSync(CATALOG, 'utf8'), text, 'src/l10n/catalog.ts is out of date: run `npm run messages`');
});

test('every message a page names exists in English', () => {
    const english = CATALOGS.en ?? {};
    for (const page of files('static', '.html')) {
        for (const [, id] of readFileSync(page, 'utf8').matchAll(/data-l10n-id="([^"]+)"/g))
            assert.ok(id && id in english, `${page}: data-l10n-id="${id}" is no English message`);
    }
});

test('every English message is asked for, by a page or a script', () => {
    const sources = [...files('static', '.html'), ...files('src', '.ts')]
        .filter((file) => !file.endsWith('catalog.ts'))
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n');
    const unused = Object.keys(CATALOGS.en ?? {}).filter((id) => !sources.includes(`'${id}'`) && !sources.includes(`"${id}"`));
    assert.deepEqual(unused, []);
});
