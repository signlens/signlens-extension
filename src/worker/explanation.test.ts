// The explanation document as this version reads it: the API's own answers
// come through whole, a variant it does not know is said to be one, and
// anything that does not hold together is refused with where it fails.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DocumentError, parseExplanation } from './explanation.ts';

const FIXTURES = new URL('../../test/fixtures/', import.meta.url);

/** The explanations the SignLens API gave for the mainnet fixtures, recorded. */
const recorded = readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.explanation.json'))
    .map((name) => ({ name, document: JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as Record<string, unknown> }));

const SELF = { address: 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg', label: null, label_trust: 'fact', is_self: true };
const USDC = { id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6, trust: 'verified' };

/** A small explanation, with `changes` on top. */
function document(changes: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        schema: 'signlens-explanation/1',
        chain: 'solana',
        summary: 'Send 1 USDC',
        verdict: 'ok',
        findings: [{ severity: 'info', code: 'fee', message: 'A fee is paid', instruction: null }],
        sections: [
            {
                kind: { type: 'instruction', value: { index: 0 } },
                title: 'Transfer',
                subtitle: null,
                fields: [
                    {
                        label: 'Amount',
                        value: { type: 'amount', value: { units: '1000000', asset: USDC, bound: 'exact', note: null } },
                        trust: 'fact',
                        help: null,
                    },
                ],
                collapsed: false,
            },
        ],
        effects: [
            {
                type: 'transfer',
                value: {
                    from: SELF,
                    to: { ...SELF, is_self: false },
                    amount: { units: '1000000', asset: USDC, bound: 'exact', note: null },
                },
            },
        ],
        raw: { format: 'solana legacy', payload: 'abcd', digest: 'ab'.repeat(32) },
        ...changes,
    };
}

/** The `DocumentError` parsing `input` throws. */
function refusal(input: unknown): DocumentError {
    try {
        parseExplanation(input);
    } catch (error) {
        if (error instanceof DocumentError) return error;
        throw error;
    }
    assert.fail('the document was taken');
}

test('the documents the API gave for the fixtures come through whole', () => {
    assert.ok(recorded.length >= 5);
    for (const { name, document } of recorded) assert.deepEqual(parseExplanation(document), document, name);
});

test('what is not in the contract is left out, and the result shares nothing with the input', () => {
    const input = document({ extra: 'ignored', ['__proto__']: { polluted: true } });
    const parsed = parseExplanation(input);
    assert.equal('extra' in parsed, false);
    assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
    assert.notEqual(parsed.effects, input.effects);
    assert.deepEqual(parseExplanation(document()), document());
});

test('a type this version does not know is shown as unrecognized, wherever it is', () => {
    const parsed = parseExplanation(
        document({
            effects: [{ type: 'drain', value: { everything: true } }],
            sections: [
                {
                    kind: { type: 'hooks' },
                    title: 'Hooks',
                    subtitle: null,
                    fields: [{ label: 'Hook', value: { type: 'matrix', value: [[1]] }, trust: 'fact', help: null }],
                    collapsed: true,
                },
            ],
        }),
    );
    assert.deepEqual(parsed.effects, [{ type: 'Unrecognized', value: { type: 'drain' } }]);
    assert.deepEqual(parsed.sections[0]?.kind, { type: 'Unrecognized', value: { type: 'hooks' } });
    assert.deepEqual(parsed.sections[0]?.fields[0]?.value, { type: 'Unrecognized', value: { type: 'matrix' } });
});

test('an unknown verdict, trust, severity, bound or lifetime is refused, with where', () => {
    const transfer = (document().effects as Record<string, Record<string, unknown>>[])[0];
    const cases: [Record<string, unknown>, string, RegExp][] = [
        [{ verdict: 'Review' }, 'explanation.verdict', /"Review" is not a verdict this version knows/],
        [{ verdict: undefined }, 'explanation.verdict', /undefined is not a verdict/],
        [
            { findings: [{ severity: 'Notice', code: 'x', message: 'x', instruction: null }] },
            'explanation.findings[0].severity',
            /a severity/,
        ],
        [
            { effects: [{ type: 'fee', value: { payer: { ...SELF, label_trust: 'Sure' }, amount: transfer?.value?.amount } }] },
            'explanation.effects[0].value.payer.label_trust',
            /a trust/,
        ],
        [
            { effects: [{ type: 'fee', value: { payer: SELF, amount: { units: '1', asset: USDC, bound: 'Around', note: null } } }] },
            'explanation.effects[0].value.amount.bound',
            /a bound/,
        ],
        [{ effects: [{ type: 'lifetime', value: { type: 'slot' } }] }, 'explanation.effects[0].value.type', /a lifetime/],
    ];
    for (const [changes, path, problem] of cases) {
        const error = refusal(document(changes));
        assert.equal(error.path, path);
        assert.match(error.message, problem);
    }
});

test('a known variant without what it needs is refused, with where', () => {
    const cases: [Record<string, unknown>, string][] = [
        [
            { effects: [{ type: 'transfer', value: { from: SELF, amount: { units: '1', asset: USDC, bound: 'exact', note: null } } }] },
            'explanation.effects[0].value.to',
        ],
        [{ effects: [{ type: 'other' }] }, 'explanation.effects[0].value'],
        [
            { sections: [{ kind: { type: 'nested', value: { index: 1 } }, title: 't', subtitle: null, fields: [], collapsed: false }] },
            'explanation.sections[0].kind.value.parent',
        ],
        [{ findings: [{ severity: 'high', code: 'x', message: 7, instruction: null }] }, 'explanation.findings[0].message'],
        [{ raw: { format: 'x', payload: 'ABCD', digest: null } }, 'explanation.raw.payload'],
        [{ schema: 'signlens-explanation/2' }, 'explanation.schema'],
        [{ summary: undefined }, 'explanation.summary'],
    ];
    for (const [changes, path] of cases) assert.equal(refusal(document(changes)).path, path);
    assert.equal(refusal([]).path, 'explanation');
    assert.equal(refusal(null).path, 'explanation');
});

test('what the window would choke on is refused: huge decimals, non-numbers, depth, length', () => {
    const amount = (asset: object, units = '1') => ({
        effects: [{ type: 'fee', value: { payer: SELF, amount: { units, asset, bound: 'exact', note: null } } }],
    });
    assert.match(refusal(document(amount({ ...USDC, decimals: 1e9 }))).message, /from 0 to 255/);
    assert.match(refusal(document(amount({ ...USDC, decimals: 1.5 }))).message, /whole number/);
    assert.match(refusal(document(amount(USDC, '1e9'))).message, /decimal integer/);
    assert.match(refusal(document(amount(USDC, '9'.repeat(41)))).message, /decimal integer/);
    let nested: object = { type: 'text', value: 'x' };
    for (let i = 0; i < 12; i += 1) nested = { type: 'list', value: [nested] };
    const deep = {
        sections: [
            {
                kind: { type: 'fees' },
                title: 't',
                subtitle: null,
                fields: [{ label: 'x', value: nested, trust: 'fact', help: null }],
                collapsed: false,
            },
        ],
    };
    assert.match(refusal(document(deep)).message, /nested too deep/);
    assert.match(
        refusal(document({ findings: Array(501).fill({ severity: 'info', code: 'x', message: 'x', instruction: null }) })).message,
        /more than 500/,
    );
    assert.match(refusal(document({ summary: 'x'.repeat(2_001) })).message, /longer than 2000/);
    // A value nested past anything JSON.stringify can write out is named by its kind, not quoted.
    let tower: unknown = 'x';
    for (let i = 0; i < 10_000; i += 1) tower = [tower];
    assert.equal(refusal(document({ verdict: tower })).message, 'explanation.verdict a list is not a verdict this version knows');
    assert.equal(refusal(document({ verdict: { Ok: true } })).message, 'explanation.verdict an object is not a verdict this version knows');
    // A proposed effect proposes another, and so on, as deep as a list.
    let proposed: object = { type: 'unheard', value: null };
    for (let i = 0; i < 12; i += 1) proposed = { type: 'proposed', value: { by: SELF, effect: proposed } };
    assert.match(refusal(document({ effects: [proposed] })).message, /effects\[0\](\.value\.effect)+ is nested too deep/);
    // The full text has a bound of its own, far above a line's.
    assert.equal(parseExplanation(document({ text: 'x'.repeat(1_000_000) })).text?.length, 1_000_000);
    assert.match(refusal(document({ text: 'x'.repeat(1_000_001) })).message, /text is longer than 1000000 characters/);
});

test('no text from the API hides or reorders what is around it', () => {
    const read = parseExplanation(
        document({
            summary: 'Refund \u202eDEFAS',
            findings: [{ severity: 'info', code: 'fee', message: 'A\u200bfee\u2028paid', instruction: null }],
        }),
    );
    assert.equal(read.summary, 'Refund ?DEFAS');
    assert.equal(read.findings[0]?.message, 'A?fee?paid');
});
