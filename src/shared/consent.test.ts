// Firefox's consent for a rating to carry the site: asked only where the
// manifest says so, once, and the site sent only once it is given.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import { firefoxManifest, type Manifest } from '../../scripts/firefox-manifest.ts';
import { installFakeChrome } from '../../test/chrome.fake.ts';
import { askForSite, asksForSite, SITE_DATA, siteAllowed } from './consent.ts';
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

test('only the Firefox build asks before a rating carries the site', () => {
    assert.equal(asksForSite(FIREFOX), true);
    assert.equal(asksForSite(CHROME), false);
    assert.equal(asksForSite(undefined), false);
});

test('a rating carries the site in Chrome always, and in Firefox only once allowed', async () => {
    browser(CHROME);
    assert.equal(await siteAllowed(), true);
    browser(FIREFOX, [SITE_DATA]);
    assert.equal(await siteAllowed(), true);
    browser(FIREFOX, []);
    assert.equal(await siteAllowed(), false);
    // Firefox before 140 has no data collection to grant: nothing was allowed.
    browser(FIREFOX);
    assert.equal(await siteAllowed(), false);
});

test('Firefox is asked once, from the click, and Chrome never', async () => {
    const chrome = browser(CHROME);
    await askForSite(false);
    assert.deepEqual(chrome.asked, []);
    const firefox = browser(FIREFOX, []);
    await askForSite(false);
    assert.deepEqual(firefox.asked, [{ data_collection: [SITE_DATA] }]);
    assert.deepEqual(await local.get('siteAsked'), { siteAsked: true });
    await askForSite(true);
    assert.equal(firefox.asked.length, 1, 'asked before: the add-on manager has it from there');
});
