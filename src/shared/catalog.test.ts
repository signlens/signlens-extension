import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { BROWSER_LOCALES, CATALOG, generate } from '../../scripts/messages.ts';
import { CATALOGS } from './catalog.ts';

const ROOT = join(import.meta.dirname, '../..');

/** Every file under `dir` whose name ends with `suffix`. */
function files(dir: string, suffix: string): string[] {
    return readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith(suffix) && !name.endsWith('.test.ts'))
        .map((name) => join(ROOT, dir, name));
}

test("the catalog and the manifest's words are what the messages compile to, and they compile cleanly", () => {
    const { text, problems, manifests } = generate();
    assert.deepEqual(problems, []);
    assert.equal(readFileSync(CATALOG, 'utf8'), text, 'src/shared/catalog.ts is out of date: run `npm run messages`');
    assert.deepEqual(
        readdirSync(BROWSER_LOCALES).sort(),
        Object.keys(manifests).sort(),
        'static/_locales/ holds other languages than the messages',
    );
    for (const [folder, json] of Object.entries(manifests))
        assert.equal(
            readFileSync(join(BROWSER_LOCALES, folder, 'messages.json'), 'utf8'),
            json,
            `static/_locales/${folder} is out of date: run \`npm run messages\``,
        );
});

test('every word the manifest names is a message, in English', () => {
    const manifest = readFileSync(join(ROOT, 'static/manifest.json'), 'utf8');
    const english = JSON.parse(readFileSync(join(BROWSER_LOCALES, 'en/messages.json'), 'utf8')) as Record<string, unknown>;
    for (const [, key] of manifest.matchAll(/__MSG_(\w+)__/g)) assert.ok(key && key in english, `__MSG_${key}__ is no English message`);
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
    // A manifest's message is asked for by its key in the manifest (__MSG_name__).
    const manifest = readFileSync(join(ROOT, 'static/manifest.json'), 'utf8');
    const asked = (id: string): boolean =>
        id.startsWith('manifest-')
            ? manifest.includes(`__MSG_${id.slice('manifest-'.length)}__`)
            : sources.includes(`'${id}'`) || sources.includes(`"${id}"`);
    const unused = Object.keys(CATALOGS.en ?? {}).filter((id) => !asked(id));
    assert.deepEqual(unused, []);
});
