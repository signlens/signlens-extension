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

const SELF = { address: 'Ffz5kwUjkUNw7hV4r6iCJnUoXXsAPFHkCMCmKKDypiwg', label: null, label_trust: 'fact', is_self: true, stand_in: null };
const USDC = { id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6, trust: 'verified', description: null };

/** `text` as the engine's words, with no identifier. */
const words = (text: string) => ({ id: null, parts: [{ text }], text });

/** A small explanation, with `changes` on top. */
function document(changes: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        schema: 'signlens-explanation/2',
        chain: 'solana',
        summary: words('Send 1 USDC'),
        actions: [{ instruction: 0, summary: words('Send 1 USDC') }],
        verdict: 'ok',
        findings: [{ severity: 'info', code: 'fee', message: words('A fee is paid'), instruction: null }],
        sections: [
            {
                kind: { type: 'instruction', value: { index: 0 } },
                title: words('Transfer'),
                subtitle: null,
                fields: [
                    {
                        label: words('Amount'),
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
                message: words('You send 1 USDC (verified) from Ffz5…ypiwg to Ffz5…ypiwg'),
            },
        ],
        raw: { format: 'solana legacy', digest: 'ab'.repeat(32) },
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
    // The engine writes the signed bytes as hex; the API leaves them out, and so does the parser.
    const engines = parseExplanation(document({ raw: { format: 'solana legacy', payload: 'abcd', digest: 'ab'.repeat(32) } }));
    assert.deepEqual(engines.raw, { format: 'solana legacy', digest: 'ab'.repeat(32) });
});

test('the actions come through one by one; an engine that lists none gives an empty list', () => {
    const actions = [
        { instruction: 0, summary: words('Send 1 USDC') },
        { instruction: 2, summary: words('Swap 1 USDC for SOL') },
    ];
    assert.deepEqual(parseExplanation(document({ actions })).actions, actions);
    const { actions: _, ...before } = document();
    assert.deepEqual(parseExplanation(before).actions, []);
    assert.equal(refusal(document({ actions: [{ instruction: -1, summary: words('x') }] })).path, 'explanation.actions[0].instruction');
    assert.equal(refusal(document({ actions: [{ instruction: 0 }] })).path, 'explanation.actions[0].summary');
});

test('the accounts an explanation wants come through, and one that is not an address is refused', () => {
    const wanted = [{ address: SELF.address, reason: words('the transaction proposal #7 stores') }];
    assert.deepEqual(parseExplanation(document({ wanted_accounts: wanted })).wanted_accounts, wanted);
    assert.equal('wanted_accounts' in parseExplanation(document()), false);
    // Its address is asked of the RPC.
    assert.equal(
        refusal(document({ wanted_accounts: [{ address: 'not an address', reason: words('x') }] })).path,
        'explanation.wanted_accounts[0].address',
    );
    assert.equal(refusal(document({ wanted_accounts: [{ address: SELF.address }] })).path, 'explanation.wanted_accounts[0].reason');
});

test('a type this version does not know is shown as unrecognized, wherever it is', () => {
    const parsed = parseExplanation(
        document({
            effects: [{ type: 'drain', value: { everything: true }, message: words('Drain everything') }],
            sections: [
                {
                    kind: { type: 'hooks' },
                    title: words('Hooks'),
                    subtitle: null,
                    fields: [{ label: words('Hook'), value: { type: 'matrix', value: [[1]] }, trust: 'fact', help: null }],
                    collapsed: true,
                },
            ],
        }),
    );
    // An effect keeps the engine's words for it, whatever its type.
    assert.deepEqual(parsed.effects, [{ type: 'Unrecognized', value: { type: 'drain' }, message: words('Drain everything') }]);
    assert.deepEqual(parsed.sections[0]?.kind, { type: 'Unrecognized', value: { type: 'hooks' } });
    assert.deepEqual(parsed.sections[0]?.fields[0]?.value, { type: 'Unrecognized', value: { type: 'matrix' } });
});

test('an unknown verdict, trust, severity, bound or lifetime is refused, with where', () => {
    const transfer = (document().effects as Record<string, Record<string, unknown>>[])[0];
    const cases: [Record<string, unknown>, string, RegExp][] = [
        [{ verdict: 'Review' }, 'explanation.verdict', /"Review" is not a verdict this version knows/],
        [{ verdict: undefined }, 'explanation.verdict', /undefined is not a verdict/],
        [
            { findings: [{ severity: 'Notice', code: 'x', message: words('x'), instruction: null }] },
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
            {
                sections: [
                    { kind: { type: 'nested', value: { index: 1 } }, title: words('t'), subtitle: null, fields: [], collapsed: false },
                ],
            },
            'explanation.sections[0].kind.value.parent',
        ],
        [{ findings: [{ severity: 'high', code: 'x', message: 7, instruction: null }] }, 'explanation.findings[0].message'],
        [{ raw: { format: 'x', digest: 'AB'.repeat(32) } }, 'explanation.raw.digest'],
        [{ schema: 'signlens-explanation/1' }, 'explanation.schema'],
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
    for (let i = 0; i < 20; i += 1) nested = { type: 'list', value: [nested] };
    const deep = {
        sections: [
            {
                kind: { type: 'fees' },
                title: words('t'),
                subtitle: null,
                fields: [{ label: words('x'), value: nested, trust: 'fact', help: null }],
                collapsed: false,
            },
        ],
    };
    assert.match(refusal(document(deep)).message, /nested too deep/);
    assert.match(
        refusal(document({ findings: Array(501).fill({ severity: 'info', code: 'x', message: words('x'), instruction: null }) })).message,
        /more than 500/,
    );
    assert.match(refusal(document({ summary: words('x'.repeat(2_001)) })).message, /longer than 2000/);
    // A value nested past anything JSON.stringify can write out is named by its kind, not quoted.
    let tower: unknown = 'x';
    for (let i = 0; i < 10_000; i += 1) tower = [tower];
    assert.equal(refusal(document({ verdict: tower })).message, 'explanation.verdict a list is not a verdict this version knows');
    assert.equal(refusal(document({ verdict: { Ok: true } })).message, 'explanation.verdict an object is not a verdict this version knows');
    // A proposed effect proposes another, and so on, as deep as a list.
    let proposed: object = { type: 'unheard', value: null };
    for (let i = 0; i < 20; i += 1) proposed = { type: 'proposed', value: { by: SELF, effect: proposed } };
    assert.match(refusal(document({ effects: [proposed] })).message, /effects\[0\](\.value\.effect)+ is nested too deep/);
    // The full text has a bound of its own, far above a line's.
    assert.equal(parseExplanation(document({ text: 'x'.repeat(1_000_000) })).text?.length, 1_000_000);
    assert.match(refusal(document({ text: 'x'.repeat(1_000_001) })).message, /text is longer than 1000000 characters/);
});

test('no text from the API hides or reorders what is around it', () => {
    const read = parseExplanation(
        document({
            summary: words('Refund \u202eDEFAS'),
            findings: [{ severity: 'info', code: 'fee', message: words('A\u200bfee\u2028paid'), instruction: null }],
        }),
    );
    assert.equal(read.summary.text, 'Refund ?DEFAS');
    assert.equal(read.summary.parts[0]?.text, 'Refund ?DEFAS');
    assert.equal(read.findings[0]?.message.text, 'A?fee?paid');
});

test("a message's parts come through, words and the values or the short addresses they name", () => {
    const sent = {
        id: 'effect-send',
        parts: [
            { text: 'You send ' },
            { value: { type: 'amount', value: { units: '1000000', asset: USDC, bound: 'exact', note: null } }, text: '1 USDC (verified)' },
            { text: ' to ' },
            { short: SELF, text: 'Ffz5…ypiw' },
        ],
        text: 'You send 1 USDC (verified) to Ffz5…ypiw',
    };
    assert.deepEqual(parseExplanation(document({ summary: sent })).summary, sent);
    // A descriptor's words are named by the program's address and the identifier of their place.
    const described = { ...sent, id: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4/route_v2-fields-args_in_amount.help' };
    assert.deepEqual(parseExplanation(document({ summary: described })).summary, described);
    const cases: [unknown, string, RegExp][] = [
        [{ ...sent, id: 'Effect Send' }, 'explanation.summary.id', /not a message identifier/],
        [{ ...sent, id: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4/Route' }, 'explanation.summary.id', /not a message identifier/],
        [{ ...sent, id: 'route/route_v2-intent' }, 'explanation.summary.id', /not a message identifier/],
        [{ ...sent, parts: [{ text: 'x', value: { type: 'text', value: 'x' }, short: SELF }] }, 'explanation.summary.parts[0]', /both/],
        [{ ...sent, parts: [{ value: { type: 'text', value: 'x' } }] }, 'explanation.summary.parts[0].text', /not a string/],
        [{ id: null, text: 'x' }, 'explanation.summary.parts', /not a list/],
        [{ ...sent, parts: Array(201).fill({ text: 'x' }) }, 'explanation.summary.parts', /more than 200/],
        ['Send 1 USDC', 'explanation.summary', /not an object/],
    ];
    for (const [summary, path, problem] of cases) {
        const error = refusal(document({ summary }));
        assert.equal(error.path, path);
        assert.match(error.message, problem);
    }
});

test('words stand in for an address or a mint the engine does not know, and one of the two is always there', () => {
    const unread = {
        address: null,
        label: words('not read'),
        label_trust: 'fact',
        is_self: false,
        stand_in: words('lookup table AyC4…kX9m[6]'),
    };
    const held = { id: null, symbol: null, decimals: null, trust: 'fact', description: words('token in 4Nd1…kL2m') };
    const fee = (payer: object, asset: object) => ({
        effects: [{ type: 'fee', value: { payer, amount: { units: '1', asset, bound: 'exact', note: null } }, message: words('x') }],
    });
    const parsed = parseExplanation(document(fee(unread, held)));
    assert.deepEqual(parsed.effects[0], fee(unread, held).effects[0]);
    assert.equal(refusal(document(fee({ ...unread, stand_in: null }, held))).path, 'explanation.effects[0].value.payer.address');
    assert.equal(refusal(document(fee(unread, { ...held, description: null }))).path, 'explanation.effects[0].value.amount.asset.id');
});
