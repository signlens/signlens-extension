// What the page's classic scripts (injected.ts, content.ts) must copy from
// the extension's modules, since they import nothing, held to the
// modules': the requests a page may make and which of them wait, the port
// they wait on, and the page's deadline against the worker's. The shared
// types are in page.d.ts; these are the values. What the content script
// does with them is content.test.ts's.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DECISION_TIMEOUT_MS } from './gate.ts';
import { PAGE_REQUESTS, REQUEST_PORT, WAITING_REQUESTS } from './messages.ts';

const content = readFileSync(new URL('content.ts', import.meta.url), 'utf8');
const injected = readFileSync(new URL('injected.ts', import.meta.url), 'utf8');

/** The quoted strings of the array `name` is set to in `source`. */
function list(source: string, name: string): string[] {
    const body = new RegExp(`const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(source)?.[1];
    assert.ok(body !== undefined, `no ${name}`);
    return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

/** The number `name` is set to in `source`, from digits, underscores and products. */
function number(source: string, name: string): number {
    const expression = new RegExp(`const ${name} = ([\\d_ *]+);`).exec(source)?.[1];
    assert.ok(expression, `no ${name}`);
    return expression.split('*').reduce((product, factor) => product * Number(factor.trim().replaceAll('_', '')), 1);
}

test('the content script relays what a page may ask, and sends what waits over the port the worker listens on', () => {
    assert.deepEqual(list(content, 'REQUESTS'), [...PAGE_REQUESTS]);
    assert.deepEqual(list(content, 'WAITING'), [...WAITING_REQUESTS]);
    assert.equal(/const REQUEST_PORT = '([^']+)';/.exec(content)?.[1], REQUEST_PORT);
});

test("the page's wallet asks only what a page may ask", () => {
    const asked = new Set([...injected.matchAll(/\b(?:request|notify|askExtension)\('([\w-]+)'/g)].map((m) => m[1]));
    assert.ok(asked.size >= 5, [...asked].join(', '));
    for (const type of asked) assert.ok((PAGE_REQUESTS as readonly unknown[]).includes(type), type);
});

test("the worker's deadline for a decision ends a little before the page's, so the window never takes one no one waits for", () => {
    const page = number(injected, 'DECISION_TIMEOUT_MS');
    assert.equal(page, 10 * 60_000);
    assert.ok(DECISION_TIMEOUT_MS < page);
    assert.ok(page - DECISION_TIMEOUT_MS <= 30_000);
});
