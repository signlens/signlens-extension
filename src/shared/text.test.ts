// Text from elsewhere as SignLens keeps it: nothing in it that is not seen,
// or that changes how the text around it reads.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { printable, withoutControls } from './text.ts';

test('control characters become "?", newline and tab stay', () => {
    assert.equal(withoutControls('a\u0000b\u0007c\u001bd\u007fe\u009bf'), 'a?b?c?d?e?f');
    assert.equal(withoutControls('line\nnext\tcell'), 'line\nnext\tcell');
});

test('what reorders or hides text becomes "?" too, so that it shows', () => {
    // Right-to-left overrides and isolates, marks, zero-width characters, separators that break a line, invisible fillers, tags.
    const hidden = ['\u202e', '\u202a', '\u2066', '\u2069', '\u200e', '\u061c', '\u200b', '\u200d', '\u2060', '\ufeff'];
    hidden.push('\u2028', '\u2029', '\u00ad', '\u034f', '\u3164', '\u{e0041}');
    for (const character of hidden) {
        assert.equal(withoutControls(`a${character}b`), 'a?b', `U+${character.codePointAt(0)?.toString(16)}`);
    }
    assert.equal(withoutControls('SAFE \u202eKCOLB'), 'SAFE ?KCOLB');
});

test('other text stays as it is, emoji with their variation selectors included', () => {
    const text = 'Caf\u00e9 \u65e5\u672c \u2764\ufe0f \u{1f680}';
    assert.equal(withoutControls(text), text);
});

test('a joiner between two characters of scripts that use it stays; one that touches ASCII, or nothing, shows', () => {
    // An emoji sequence, Persian with its zero-width non-joiner, Devanagari with a joiner: as written.
    for (const text of [
        '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}',
        '\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645',
        '\u0915\u094d\u200d\u0937',
    ]) {
        assert.equal(withoutControls(text), text);
    }
    // In a name read in ASCII it would hide: "Jup?iter" is not "Jupiter".
    assert.equal(withoutControls('Jup\u200diter'), 'Jup?iter');
    assert.equal(withoutControls('USDC\u200c\u{1f600}'), 'USDC?\u{1f600}');
    assert.equal(withoutControls('\u200d\u{1f600}\u200c'), '?\u{1f600}?');
    // Beside a character that is itself hidden, it shows too.
    assert.equal(withoutControls('\u0645\u200d\u202e'), '\u0645??');
});

test('printable is ASCII alone, cut to its length', () => {
    assert.equal(printable('Phan\u202etom \u{1f47b}', 60), 'Phan?tom ??');
    assert.equal(printable('abcdef', 3), 'abc');
});
