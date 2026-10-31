import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { generate } from '../../scripts/messages.ts';
import { record } from '../../scripts/review.ts';

/** A locale tree: English, a translation of it, and, when given, its review. */
function tree(english: string, translation: string): string {
    const root = mkdtempSync(join(tmpdir(), 'signlens-gate-'));
    mkdirSync(join(root, 'en'));
    mkdirSync(join(root, 'xx'));
    writeFileSync(join(root, 'en/window.ftl'), english);
    writeFileSync(join(root, 'xx/window.ftl'), translation);
    return root;
}

test('a translation reaches the catalog once reviewed, and leaves it when its English changes', () => {
    const root = tree('window-reject = Reject\nwindow-back = Back\n', 'window-reject = Rejecter\nwindow-back = Retour\n');
    try {
        // Drafts: none ships, and the locale is not complete.
        let generated = generate({ locales: root });
        assert.deepEqual(generated.problems, []);
        assert.deepEqual(generated.catalogs.xx, {});
        assert.deepEqual(generated.coverage.xx, {
            messages: 2,
            reviewed: 0,
            stale: [],
            unreviewed: ['window-back', 'window-reject'],
            missing: [],
        });
        // Under --dev, every draft does.
        assert.deepEqual(Object.keys(generate({ locales: root, dev: true }).catalogs.xx ?? {}).sort(), ['window-back', 'window-reject']);
        // Reviewed: both ship.
        writeFileSync(join(root, 'xx.review.json'), record('xx', ['a native speaker'], '2026-11-01', root));
        generated = generate({ locales: root });
        assert.deepEqual(Object.keys(generated.catalogs.xx ?? {}).sort(), ['window-back', 'window-reject']);
        assert.equal(generated.coverage.xx?.reviewed, 2);
        // The English of one changes: its translation is stale, and leaves the catalog until it is reviewed again.
        writeFileSync(join(root, 'en/window.ftl'), 'window-reject = Reject it\nwindow-back = Back\nwindow-new = New\n');
        generated = generate({ locales: root });
        assert.deepEqual(Object.keys(generated.catalogs.xx ?? {}), ['window-back']);
        assert.deepEqual(generated.coverage.xx, {
            messages: 3,
            reviewed: 1,
            stale: ['window-reject'],
            unreviewed: [],
            missing: ['window-new'],
        });
    } finally {
        rmSync(root, { recursive: true });
    }
});
