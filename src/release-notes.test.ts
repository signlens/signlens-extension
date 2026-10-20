// A release's notes are its changelog section: the right one, whole, and
// never none (scripts/release-notes.ts).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { changelogSection, releaseNotes } from '../scripts/release-notes.ts';

const CHANGELOG = `# Changelog

## [Unreleased]

- Something not released yet.

## [1.1.0] - 2026-12-01

The second version.

### Fixed

- A thing.

## [1.0.0] - 2026-11-01

The first version.

[Unreleased]: https://example.com/compare/v1.1.0...HEAD
[1.1.0]: https://example.com/compare/v1.0.0...v1.1.0
[1.0.0]: https://example.com/releases/tag/v1.0.0
`;

test('the section of a version is what follows its heading, up to the next section', () => {
    assert.equal(changelogSection(CHANGELOG, '1.1.0'), 'The second version.\n\n### Fixed\n\n- A thing.');
});

test('the last section stops at the links Keep a Changelog ends on', () => {
    assert.equal(changelogSection(CHANGELOG, '1.0.0'), 'The first version.');
});

test('a version with no section, or an empty one, has none, and no notes', () => {
    assert.equal(changelogSection(CHANGELOG, '2.0.0'), null);
    assert.equal(changelogSection('## [2.0.0] - 2027-01-01\n\n## [1.0.0]\n\nx\n', '2.0.0'), null);
    // A version that only starts like another is not it.
    assert.equal(changelogSection(CHANGELOG, '1.1'), null);
    assert.throws(() => releaseNotes(CHANGELOG, '2.0.0'), /CHANGELOG\.md has no section for 2\.0\.0/);
});

test('the notes are the section, then how to check the packages of that version', () => {
    const notes = releaseNotes(CHANGELOG, '1.1.0');
    assert.ok(notes.startsWith('The second version.'));
    assert.ok(!notes.includes('Something not released yet.'));
    assert.match(notes, /sha256sum -c signlens-extension-1\.1\.0\.zip\.sha256 signlens-extension-firefox-1\.1\.0\.zip\.sha256/);
    assert.match(notes, /gh attestation verify signlens-extension-firefox-1\.1\.0\.zip --owner signlens/);
});

test('the changelog has notes for the version package.json names, so its tag can be released', () => {
    const root = new URL('../', import.meta.url);
    const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };
    assert.doesNotThrow(() => releaseNotes(readFileSync(new URL('CHANGELOG.md', root), 'utf8'), version));
});
