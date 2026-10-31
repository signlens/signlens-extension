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

test('in Chinese, a space where the words meet an argument in Latin letters or digits, none beside Chinese or full-width punctuation', () => {
    const zh = (pattern: Pattern, args: Record<string, string | number>): string => word(pattern, args, 'zh-Hans');
    // A site, a number, a wallet: spaced from the Chinese around them, whatever the translation put there.
    assert.equal(zh([{ arg: 'site' }, '请求您签名'], { site: 'jup.ag' }), 'jup.ag 请求您签名');
    assert.equal(zh(['发送', { arg: 'count' }, '笔交易'], { count: 3 }), '发送 3 笔交易');
    assert.equal(zh(['继续前往 ', { arg: 'wallet' }, ' '], { wallet: 'Phantom' }), '继续前往 Phantom ');
    // Chinese words, full-width brackets: no space.
    assert.equal(zh(['您的 ', { arg: 'what' }], { what: '钱包' }), '您的钱包');
    assert.equal(zh(['（', { arg: 'n' }, '）'], { n: 'abc' }), '（abc）');
    assert.equal(zh(['原因： ', { arg: 'why' }], { why: 'timeout' }), '原因：timeout');
    // Two arguments side by side, a Chinese one and a Latin one.
    assert.equal(zh([{ arg: 'a' }, { arg: 'b' }], { a: '已拒绝', b: 'HTTP 503' }), '已拒绝 HTTP 503');
    // A half-width bracket keeps the Latin it holds tight.
    assert.equal(zh(['路由(', { arg: 'n' }, ')'], { n: 'x' }), '路由(x)');
    // English is as it is.
    assert.equal(word(['to', { arg: 'site' }], { site: 'jup.ag' }), 'tojup.ag');
});
