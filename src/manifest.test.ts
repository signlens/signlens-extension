// The manifest as both browsers read it: Chrome takes the one in the
// extension directory, Firefox the one `npm run build:firefox` derives from
// it under dist/firefox/, since each warns about the other's background key.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { firefoxManifest, type Manifest } from '../scripts/firefox-manifest.ts';

const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8')) as Manifest & {
    manifest_version: number;
    content_security_policy: { extension_pages: string };
    icons: Record<string, string>;
    host_permissions: string[];
    permissions: string[];
    content_scripts: { js: string[] }[];
};

test('the manifest is Manifest V3 for Chrome, with nothing Chrome would warn about and no WebAssembly yet', () => {
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.background.service_worker, 'background.js');
    assert.equal(manifest.background.type, 'module');
    assert.equal(manifest.background.scripts, undefined);
    assert.equal(manifest.browser_specific_settings, undefined);
    assert.ok(!manifest.content_security_policy.extension_pages.includes('wasm-unsafe-eval'));
    for (const size of ['16', '32', '48', '128']) assert.equal(manifest.icons[size], `icons/icon-${size}.png`);
    assert.ok(manifest.host_permissions.includes('https://*/*'));
    assert.deepEqual(manifest.permissions, ['storage']);
    // The page scripts are classic scripts that import nothing, both at
    // document_start; the relay is listed first, though what keeps the
    // hand-off safe is that a posted message is dispatched only after
    // both have run (see `offer` in injected.ts).
    assert.deepEqual(
        manifest.content_scripts.map((s) => s.js),
        [['content.js'], ['injected.js']],
    );
});

test('the Firefox manifest runs the same worker as a background script, with the add-on id and what it sends away', () => {
    const firefox = firefoxManifest(manifest);
    assert.deepEqual(firefox.background, { type: 'module', scripts: ['background.js'] });
    const gecko = firefox.browser_specific_settings?.gecko;
    assert.match(gecko?.id ?? '', /^[^@]+@[^@]+$/);
    assert.ok(Number(gecko?.strict_min_version) >= 128, 'world: MAIN content scripts');
    // Required by addons.mozilla.org for new add-ons since November 2025.
    assert.deepEqual(gecko?.data_collection_permissions.required, ['financialAndPaymentInfo', 'personallyIdentifyingInfo']);
    assert.equal(firefox.minimum_chrome_version, undefined);
    const { background: _b, browser_specific_settings: _s, ...rest } = firefox;
    const { background: _c, minimum_chrome_version: _m, ...chrome } = manifest;
    assert.deepEqual(rest, chrome, 'everything else is the same file');
});
