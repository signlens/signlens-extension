// The pages SignLens runs on, as the manifest's content scripts match them,
// and what the popup says over a tab with no other wallet to list.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { languages, noWalletHint, runsOn } from './pages.ts';

test('SignLens runs on https pages and on this machine over http, as the manifest says, and nowhere else', () => {
    for (const url of ['https://jup.ag/swap', 'http://localhost:5173/', 'http://127.0.0.1:8080/app', 'http://localhost/']) {
        assert.equal(runsOn(url), true, url);
    }
    for (const url of [
        undefined,
        '',
        'chrome://extensions/',
        'about:blank',
        'chrome-extension://abc/popup.html',
        'http://jup.ag/',
        'http://localhost.evil.example/',
        'file:///tmp/x.html',
    ]) {
        assert.equal(runsOn(url), false, String(url));
    }
    const manifest = JSON.parse(readFileSync(new URL('../../static/manifest.json', import.meta.url), 'utf8')) as {
        content_scripts: { matches: string[] }[];
    };
    for (const script of manifest.content_scripts) {
        assert.deepEqual(script.matches, ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'], 'runsOn follows these');
    }
});

test('with no other wallet in the tab, the popup says why: not a page SignLens runs on, a tab to reload, or a page without one', () => {
    assert.match(noWalletHint('chrome://newtab/', false), /^SignLens does not run on this page\./);
    assert.match(noWalletHint(undefined, false), /^SignLens does not run on this page\./);
    assert.match(noWalletHint('https://jup.ag/', false), /^SignLens is not running in this tab yet\. Reload the tab/);
    assert.match(noWalletHint('https://jup.ag/', true), /^No other wallet found in this tab\./);
});

test('the popup names each language the API explains in and when it was reviewed, but no reviewer', () => {
    const names = (tag: string) => (tag === 'zh-Hans' ? 'Simplified Chinese' : tag);
    assert.equal(languages([], names), 'Explains in English.');
    assert.equal(
        languages([{ locale: 'zh-Hans', review: { kind: 'reviewed', by: ['a native speaker'], on: '2026-11-02' } }], names),
        'Explains in English, and in Simplified Chinese (zh-Hans), reviewed on 2026-11-02, when your browser asks for it.',
    );
    assert.match(languages([{ locale: 'xx', review: { kind: 'unreviewed' } }], names), /xx, not reviewed/);
});
