// The reader's languages as the API takes them.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followLanguage, readerLanguages } from '../shared/words.ts';
import { readerLocales } from './locale.ts';

test("a request names the browser's languages in their order, each once, at most eight", () => {
    assert.deepEqual(readerLocales(['pt-BR', 'pt', 'en-US']), ['pt-BR', 'pt', 'en-US']);
    assert.deepEqual(readerLocales(['ru', 'ru', 'not a tag', '']), ['ru']);
    assert.deepEqual(readerLocales(Array.from({ length: 12 }, (_, i) => `x${i}`)).length, 8);
    assert.deepEqual(readerLocales([]), []);
});

test("a language chosen in the settings is asked for first, then the browser's, each once", () => {
    try {
        followLanguage('zh-Hans', ['en-US']);
        assert.deepEqual(readerLocales(readerLanguages(['en-US', 'en'])), ['zh-Hans', 'en-US', 'en']);
        followLanguage('en', ['zh-CN']);
        assert.deepEqual(readerLocales(readerLanguages(['zh-CN', 'en'])), ['en', 'zh-CN']);
    } finally {
        followLanguage('', ['en']);
    }
});
