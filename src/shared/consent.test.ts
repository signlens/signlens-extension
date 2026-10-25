// Firefox's consent for a rating to carry the site and the version: asked
// only where the manifest says so, once, and each sent only once given.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import { firefoxManifest, type Manifest } from '../../scripts/firefox-manifest.ts';
import { installFakeChrome } from '../../test/chrome.fake.ts';
import { askBeforeRating, asksBeforeRating, ratingAllowed, SITE_DATA, VERSION_DATA } from './consent.ts';
import { local } from './store.ts';

const CHROME = JSON.parse(readFileSync(new URL('../../static/manifest.json', import.meta.url), 'utf8')) as Manifest;
const FIREFOX = firefoxManifest(CHROME);

/** The fake chrome, with `manifest` as the extension's and Firefox's answers about data collection. */
function browser(manifest: Manifest, granted?: string[]) {
    const fake = installFakeChrome();
    const asked: unknown[] = [];
    const runtime = (globalThis.chrome as unknown as { runtime: Record<string, unknown> }).runtime;
    runtime.getManifest = () => manifest;
    (globalThis.chrome as unknown as { permissions: unknown }).permissions = {
        getAll: async () =>
            granted === undefined ? { origins: [], permissions: [] } : { origins: [], permissions: [], data_collection: granted },
        request: async (permissions: unknown) => {
            asked.push(permissions);
            return true;
        },
    };
    return { fake, asked };
}

beforeEach(() => {
    installFakeChrome();
});

test('only the Firefox build asks before a rating carries the site and the version', () => {
    assert.equal(asksBeforeRating(FIREFOX), true);
    assert.equal(asksBeforeRating(CHROME), false);
    assert.equal(asksBeforeRating(undefined), false);
});

test('a rating carries both in Chrome always, and in Firefox each only once allowed', async () => {
    browser(CHROME);
    assert.deepEqual(await ratingAllowed(), { site: true, version: true });
    browser(FIREFOX, [SITE_DATA, VERSION_DATA]);
    assert.deepEqual(await ratingAllowed(), { site: true, version: true });
    // Firefox's add-on manager lets the user take back one and keep the other.
    browser(FIREFOX, [VERSION_DATA]);
    assert.deepEqual(await ratingAllowed(), { site: false, version: true });
    browser(FIREFOX, []);
    assert.deepEqual(await ratingAllowed(), { site: false, version: false });
    // A Firefox with no data collection to grant has allowed nothing.
    browser(FIREFOX);
    assert.deepEqual(await ratingAllowed(), { site: false, version: false });
});

test('Firefox is asked once, for both in one question, from the click, and Chrome never', async () => {
    const chrome = browser(CHROME);
    await askBeforeRating(false);
    assert.deepEqual(chrome.asked, []);
    const firefox = browser(FIREFOX, []);
    await askBeforeRating(false);
    assert.deepEqual(firefox.asked, [{ data_collection: [SITE_DATA, VERSION_DATA] }]);
    assert.deepEqual(await local.get('ratingAsked'), { ratingAsked: true });
    await askBeforeRating(true);
    assert.equal(firefox.asked.length, 1, 'asked before: the add-on manager has it from there');
});
