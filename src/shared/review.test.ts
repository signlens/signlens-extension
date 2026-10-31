import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { apply, digest, readCsv, record, sheet } from '../../scripts/review.ts';

/** A locale tree: English in two files, a translation of some of it. */
function tree(): string {
    const root = mkdtempSync(join(tmpdir(), 'signlens-review-'));
    mkdirSync(join(root, 'en'));
    mkdirSync(join(root, 'xx'));
    writeFileSync(
        join(root, 'en/window.ftl'),
        '# What the button does.\nwindow-reject = Reject\nwindow-also-reject = Reject\nwindow-count = { $count ->\n    [one] one row\n   *[other] { $count } rows\n}\nwindow-input =\n    .placeholder = Write here\n',
    );
    writeFileSync(join(root, 'en/popup.ftl'), 'popup-title = Requests\n');
    writeFileSync(join(root, 'xx/window.ftl'), 'window-reject = Rejecter\nwindow-also-reject = Rejecter\n');
    return root;
}

test('a sheet has a row per distinct English and translation, the signing window first and apart', () => {
    const root = tree();
    try {
        const rows = readCsv(sheet('xx', 'critical', 'window-reject\tReject it\t[Rejecter]\t\n', root));
        assert.deepEqual(rows[0], [
            'ids',
            'english',
            'comment',
            'translation',
            'back_translation',
            'example',
            'verdict',
            'correction',
            'note',
        ]);
        assert.deepEqual(rows[1], [
            'window-reject window-also-reject',
            'Reject',
            'What the button does.',
            'Rejecter',
            'Reject it',
            '[Rejecter]',
            '',
            '',
            '',
        ]);
        assert.equal(rows[2]?.[1], '{ $count ->\n    [one] one row\n   *[other] { $count } rows\n}');
        assert.equal(rows[3]?.[1], '\n.placeholder = Write here');
        assert.equal(rows.length, 4);
        assert.deepEqual(readCsv(sheet('xx', 'rest', undefined, root)).slice(1), [['popup-title', 'Requests', '', '', '', '', '', '', '']]);
    } finally {
        rmSync(root, { recursive: true });
    }
});

test('a correction goes to every identifier of its row, added where there was none', () => {
    const root = tree();
    try {
        const csv = 'ids,correction\n"window-also-reject window-reject","Refuser"\n"popup-title","Demandes"\n';
        assert.equal(apply('xx', csv, root), 3);
        assert.equal(readFileSync(join(root, 'xx/window.ftl'), 'utf8'), 'window-reject = Refuser\nwindow-also-reject = Refuser\n');
        assert.equal(readFileSync(join(root, 'xx/popup.ftl'), 'utf8'), 'popup-title = Demandes\n');
    } finally {
        rmSync(root, { recursive: true });
    }
});

test('a correction that is a choice, or attributes alone, reads back as the reviewer wrote it', () => {
    const root = tree();
    try {
        const choice = '{ $count ->\n    [one] une ligne\n   *[other] { $count } lignes\n}';
        const csv = `ids,correction\n"window-count","${choice}"\n"window-input","\n.placeholder = Écrire ici"\n`;
        assert.equal(apply('xx', csv, root), 2);
        const back = readCsv(sheet('xx', 'critical', undefined, root));
        assert.equal(back.find((row) => row[0] === 'window-count')?.[3], choice);
        assert.equal(back.find((row) => row[0] === 'window-input')?.[3], '\n.placeholder = Écrire ici');
    } finally {
        rmSync(root, { recursive: true });
    }
});

test('a review binds each translated message to its English, by role and day', () => {
    const root = tree();
    try {
        const review = JSON.parse(record('xx', ['a native speaker'], '2026-11-01', root));
        assert.deepEqual(review, {
            by: ['a native speaker'],
            on: '2026-11-01',
            digests: { 'window-also-reject': digest('Reject'), 'window-reject': digest('Reject') },
        });
    } finally {
        rmSync(root, { recursive: true });
    }
});
