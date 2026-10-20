// The stylesheet's colours, held to WCAG 2.2 in both themes: text at 4.5:1
// on the page and on raised surfaces, and the edge of a text field at 3:1
// against both (1.4.11, non-text contrast), since an empty field is known
// by its edge alone.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../extension/popup.css', import.meta.url), 'utf8');

/**
 * The custom properties the block `block` matches in `source` sets (its
 * first group is the body), each a six-digit hex colour: a token written
 * otherwise (rgb(), three digits, a name) would be passed over, and the
 * theme checked with another colour in its place, so it fails instead.
 */
function tokens(source: string, block: RegExp): Map<string, string> {
    const body = block.exec(source)?.[1];
    assert.ok(body !== undefined, `no ${block} in the stylesheet`);
    const found = new Map<string, string>();
    for (const [, name = '', value = ''] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
        assert.match(value.trim(), /^#[0-9a-f]{6}$/i, `--${name}: ${value.trim()} is not a colour this test can check`);
        found.set(name, value.trim());
    }
    return found;
}

function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const LIGHT = /^:root \{([^}]*)\}/m;
const DARK = /@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/;
const light = tokens(css, LIGHT);
const dark = tokens(css, DARK);

test('the dark theme sets every colour the light one does, none left to the light value', () => {
    assert.deepEqual([...dark.keys()].sort(), [...light.keys()].sort());
});

test('a colour the test cannot read fails it, rather than being passed over', () => {
    assert.throws(() => tokens(':root { --text: rgb(20 33 61); }', LIGHT), /--text: rgb\(20 33 61\) is not a colour this test can check/);
    assert.throws(() => tokens(':root { --muted: #fff; }', LIGHT), /--muted/);
    assert.equal(tokens(':root { color-scheme: light dark; --text: #14213d; }', LIGHT).get('text'), '#14213d');
});

for (const [theme, colors] of [
    ['light', light],
    ['dark', dark],
] as const) {
    test(`in the ${theme} theme, text reads at 4.5:1 and a field's edge shows at 3:1`, () => {
        const color = (name: string) => colors.get(name) ?? assert.fail(`no --${name}`);
        for (const surface of ['ground', 'raised']) {
            for (const text of ['text', 'muted', 'accent', 'ok', 'warning', 'blocked']) {
                const ratio = contrast(color(text), color(surface));
                assert.ok(ratio >= 4.5, `--${text} on --${surface}: ${ratio.toFixed(2)}:1`);
            }
            const edge = contrast(color('field-line'), color(surface));
            assert.ok(edge >= 3, `--field-line on --${surface}: ${edge.toFixed(2)}:1`);
        }
        assert.ok(contrast(color('on-fill'), color('fill')) >= 4.5, 'text on the filled control');
    });
}

test('every text field is edged in the field colour', () => {
    const rule = /textarea,\s*select,\s*input\[type='text'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    assert.match(rule, /border:\s*1px solid var\(--field-line\)/);
});
