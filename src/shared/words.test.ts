// The interface's words for what is kept: a reason as a message (`said`),
// worded when it is shown (`spoken`), and the same in English (`english`,
// `inEnglish`), which is what a page is told.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Row, refusal, type Said } from './model.ts';
import { summaryOf } from './verdict.ts';
import {
    chooseLocale,
    english,
    followLanguage,
    type Id,
    inEnglish,
    interfaceLanguages,
    interfaceLocale,
    readerLanguages,
    said,
    spoken,
} from './words.ts';

test('a reason kept as a message is worded when shown, and is in English what its page is told', () => {
    const reason = said('worker-refused-window-not-open', { error: 'no display' });
    assert.deepEqual(reason, { id: 'worker-refused-window-not-open', args: { error: 'no display' } });
    assert.deepEqual(said('worker-refused-no-decision'), { id: 'worker-refused-no-decision' });
    assert.equal(spoken(reason), 'the SignLens window could not open: no display');
    assert.equal(inEnglish(reason), english('worker-refused-window-not-open', { error: 'no display' }));
    assert.deepEqual(refusal('worker-refused-window-not-open', { error: 'no display' }), {
        decision: 'reject',
        refused: 'the SignLens window could not open: no display',
        said: reason,
    });
});

test('a message this version does not have is shown as its identifier, never as nothing', () => {
    assert.equal(spoken({ id: 'worker-refused-long-gone' as Id }), 'worker-refused-long-gone');
});

test("a request's line is its reason as the interface words it where there is one, else as its page was told", () => {
    const row = (said?: Said): Row => ({
        kind: 'failed',
        scope: 'request',
        error: 'not explained: the page closed or reloaded',
        ...(said ? { said } : {}),
    });
    assert.equal(summaryOf(row({ id: 'worker-failed-page-gone' })), 'Not explained: the page closed or reloaded');
    assert.equal(summaryOf(row()), 'Not explained: the page closed or reloaded');
});

test("the interface's locale is the reader's first language it has, by tag, else by language in the same script", () => {
    const have = ['en', 'zh-Hans', 'en-XA'];
    assert.equal(chooseLocale(['zh-CN', 'en'], have), 'zh-Hans');
    assert.equal(chooseLocale(['zh-SG'], have), 'zh-Hans');
    assert.equal(chooseLocale(['not a tag', 'zh'], have), 'zh-Hans');
    // Traditional Chinese is not answered in Simplified: the reader's next language is.
    assert.equal(chooseLocale(['zh-TW', 'en-GB'], have), 'en');
    assert.equal(chooseLocale(['zh-HK', 'zh-CN'], have), 'zh-Hans');
    assert.equal(chooseLocale(['en-GB', 'zh-CN'], have), 'en');
    // A pseudo-locale only by its own tag.
    assert.equal(chooseLocale(['en-XA'], have), 'en-XA');
    assert.equal(chooseLocale(['en-US'], have), 'en');
    assert.equal(chooseLocale(['fr-FR', 'de'], have), 'en');
    assert.equal(chooseLocale([], have), 'en');
});

test('a reader may choose English or a language shipped, never a pseudo-locale', () => {
    assert.deepEqual(interfaceLanguages(), ['en', 'zh-Hans']);
});

test("a language chosen in the settings comes before the browser's, whatever they are", () => {
    try {
        followLanguage('zh-Hans', ['en-US']);
        assert.equal(interfaceLocale(), 'zh-Hans');
        assert.deepEqual(readerLanguages(['en-US']), ['zh-Hans', 'en-US']);
        // Traditional Chinese goes on to the next language, unless the reader chooses Simplified.
        followLanguage('', ['zh-TW', 'en-GB']);
        assert.equal(interfaceLocale(), 'en');
        assert.deepEqual(readerLanguages(['zh-TW', 'en-GB']), ['zh-TW', 'en-GB']);
        followLanguage('zh-Hans', ['zh-TW', 'en-GB']);
        assert.equal(interfaceLocale(), 'zh-Hans');
        followLanguage('en', ['zh-CN']);
        assert.equal(interfaceLocale(), 'en');
        assert.deepEqual(readerLanguages(['zh-CN']), ['en', 'zh-CN']);
        // One the interface is not worded in, a pseudo-locale or a language a later version dropped, is no choice.
        for (const language of ['en-XA', 'fr']) {
            followLanguage(language, ['zh-CN']);
            assert.equal(interfaceLocale(), 'zh-Hans', language);
            assert.deepEqual(readerLanguages(['zh-CN']), ['zh-CN'], language);
        }
    } finally {
        followLanguage('', ['en']);
    }
});
