import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Pattern, pieces, plain } from './fluent.ts';

const word = (pattern: Pattern, args: Record<string, string | number>, locale = 'en'): string =>
    plain(pieces(pattern, args, locale), locale);

test('a message is its text with its arguments in their places, a number as the locale writes it', () => {
    assert.equal(
        word(['Engine ', { arg: 'engine' }, ', ', { arg: 'tokens' }, ' tokens'], { engine: '0.3.0', tokens: 4003 }),
        'Engine 0.3.0, 4,003 tokens',
    );
    assert.equal(word([{ arg: 'missing' }], {}), '{missing}');
});

test('a choice by a number takes its exact value, else its plural category, else the default', () => {
    const requests: Pattern = [
        {
            select: 'count',
            cases: { '0': ['none'], one: [{ arg: 'count' }, ' request'], other: [{ arg: 'count' }, ' requests'] },
            other: 'other',
        },
    ];
    assert.equal(word(requests, { count: 0 }), 'none');
    assert.equal(word(requests, { count: 1 }), '1 request');
    assert.equal(word(requests, { count: 12 }), '12 requests');
    // Chinese has one plural form, other.
    assert.equal(word(requests, { count: 1 }, 'zh-Hans'), '1 requests');
});

test('a choice by words takes its value, else the default', () => {
    const verdict: Pattern = [{ select: 'kind', cases: { warn: ['careful'], other: ['fine'] }, other: 'other' }];
    assert.equal(word(verdict, { kind: 'warn' }), 'careful');
    assert.equal(word(verdict, { kind: 'block' }), 'fine');
});

test('the words alone leave out the markup, never what an argument holds', () => {
    assert.equal(
        word(['Choose <strong>', { arg: 'name' }, '</strong>, or <a data-l10n-name="docs">read</a>'], { name: '<b>x</b>' }),
        'Choose <b>x</b>, or read',
    );
});
