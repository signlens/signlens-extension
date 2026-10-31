import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { generate } from '../../scripts/messages.ts';

test('a Chinese translation is held to its style note, and a clean one passes', () => {
    const root = mkdtempSync(join(tmpdir(), 'signlens-zh-'));
    try {
        mkdirSync(join(root, 'en'));
        mkdirSync(join(root, 'zh-Hans'));
        writeFileSync(join(root, 'zh-Hans.md'), '# Note\n\n## Kept in English\n\n`SignLens` `API`\n');
        const ids = ['clean', 'tight', 'spaced', 'half', 'nested', 'english', 'name', 'markup'];
        writeFileSync(join(root, 'en/window.ftl'), `${ids.map((id) => `${id} = English ${id} { $site }`).join('\n')}\nphantom = Phantom\n`);
        writeFileSync(
            join(root, 'zh-Hans/window.ftl'),
            [
                'clean = 打开 SignLens 的窗口：{ $site }（API）',
                'tight = 打开SignLens',
                'spaced = 地址 （已验证）',
                'half = 已拒绝,请重试',
                'nested = 地址（已验证（声称））',
                'english = 继续 Continue',
                'markup = 选择 <strong>SignLens</strong>',
                'phantom = Phantom',
            ].join('\n'),
        );
        const problems = generate({ locales: root }).problems.map((p) => p.replace(/^locales\/zh-Hans: /, ''));
        assert.deepEqual(
            problems.filter((p) => p.startsWith('clean') || p.startsWith('markup') || p.startsWith('phantom')),
            [],
        );
        assert.ok(
            problems.some((p) => p.startsWith('tight: a half-width space between Chinese and Latin')),
            problems.join('\n'),
        );
        assert.ok(
            problems.some((p) => p.startsWith('spaced: no space beside full-width punctuation')),
            problems.join('\n'),
        );
        assert.ok(
            problems.some((p) => p.startsWith('half: full-width punctuation in Chinese')),
            problems.join('\n'),
        );
        assert.ok(
            problems.some((p) => p.startsWith('nested: no full-width brackets inside full-width brackets')),
            problems.join('\n'),
        );
        assert.ok(
            problems.some((p) => p.startsWith('english: "Continue" is English the style note does not keep')),
            problems.join('\n'),
        );
    } finally {
        rmSync(root, { recursive: true });
    }
});
