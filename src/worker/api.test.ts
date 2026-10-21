// The API client as the worker drives it, in Node against a local stub:
// the request it sends, and every way a bad answer becomes an error
// document rather than an explanation.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import type { Explanation } from '../shared/types.ts';
import { apiStatus, explainRemotely, sendFeedback } from './api.ts';

const EXPLANATION: Explanation = {
    schema: 'signlens-explanation/1',
    chain: 'solana',
    verdict: 'ok',
    summary: 'Send 1 SOL',
    findings: [],
    effects: [],
    sections: [],
    raw: { format: 'solana legacy', payload: '', digest: 'ab'.repeat(32) },
};

interface Answer {
    status: number;
    body?: unknown;
    raw?: string;
}

interface Call {
    method: string | undefined;
    path: string | undefined;
    body: unknown;
}

/** A stub API: answers `/v1/explain` with `explain`, `/v1/packs` with `packs`, `/v1/feedback` with 204; records calls. */
async function stub({
    explain = { status: 200, body: EXPLANATION },
    packs = {
        status: 200,
        body: {
            schema: 'signlens-ffi/1',
            engine: '0.1.0',
            descriptorPack: { programs: 44, createdAt: 1, source: 's' },
            tokenSnapshot: { tokens: 4003, createdAt: 1, source: 's' },
        },
    },
}: {
    explain?: Answer;
    packs?: Answer;
} = {}) {
    const calls: Call[] = [];
    const server = createServer((request, response) => {
        let body = '';
        request.setEncoding('utf8').on('data', (chunk: string) => {
            body += chunk;
        });
        request.on('end', () => {
            calls.push({ method: request.method, path: request.url, body: body ? JSON.parse(body) : null });
            const answer: Answer =
                request.url === '/v1/explain'
                    ? explain
                    : request.url === '/v1/packs'
                      ? packs
                      : request.url === '/v1/feedback'
                        ? { status: 204 }
                        : { status: 404, body: {} };
            response.writeHead(answer.status, { 'content-type': 'application/json' });
            response.end(answer.raw ?? (answer.body === undefined ? '' : JSON.stringify(answer.body)));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return { url: `http://127.0.0.1:${port}`, calls, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test('the request carries the transaction as base64 beside the engine request, and the document comes back as is', async () => {
    const api = await stub();
    try {
        const document = await explainRemotely(`${api.url}/`, new Uint8Array([1, 2, 3]), {
            ownKeys: ['A'],
            loadedWritable: [],
            render: true,
        });
        assert.deepEqual(document, EXPLANATION);
        assert.deepEqual(api.calls[0], {
            method: 'POST',
            path: '/v1/explain',
            body: { transaction: 'AQID', ownKeys: ['A'], loadedWritable: [], render: true },
        });
        assert.ok(!('error' in document) && document.verdict === 'ok');
    } finally {
        await api.close();
    }
});

test("the engine's error document is passed through, and anything else is an error document too", async () => {
    const engineError = await stub({
        explain: {
            status: 400,
            body: { schema: 'signlens-ffi/1', error: { code: 'transaction', message: 'not a transaction', trace: 'x' }, extra: 1 },
        },
    });
    try {
        const document = await explainRemotely(engineError.url, new Uint8Array([1]), {});
        // Only what is shown of it is kept.
        assert.deepEqual(document, { schema: 'signlens-api/1', error: { code: 'transaction', message: 'not a transaction' } });
    } finally {
        await engineError.close();
    }
    const busy = await stub({ explain: { status: 503, raw: 'Service Unavailable' } });
    try {
        const document = await explainRemotely(busy.url, new Uint8Array([1]), {});
        assert.ok('error' in document);
        assert.equal(document.error.code, 'api');
        assert.match(document.error.message, /HTTP 503 without a document/);
    } finally {
        await busy.close();
    }
    // An explanation that comes with a failure status is not taken for one.
    const failing = await stub({ explain: { status: 500, body: EXPLANATION } });
    try {
        const document = await explainRemotely(failing.url, new Uint8Array([1]), {});
        assert.ok('error' in document);
        assert.match(document.error.message, /HTTP 500 with something that is not an explanation/);
    } finally {
        await failing.close();
    }
    const wrong = await stub({ explain: { status: 200, body: { schema: 'something-else/1' } } });
    try {
        const document = await explainRemotely(wrong.url, new Uint8Array([1]), {});
        assert.ok('error' in document);
        assert.match(document.error.message, /not an explanation/);
    } finally {
        await wrong.close();
    }
    const nowhere = await explainRemotely('http://127.0.0.1:1', new Uint8Array([1]), {});
    assert.ok('error' in nowhere);
    assert.match(nowhere.error.message, /did not answer/);
    const bad = await explainRemotely('ftp://x', new Uint8Array([1]), {});
    assert.ok('error' in bad);
    assert.match(bad.error.message, /not an http\(s\) URL/);
    // The transaction and the address book do not go out in the clear.
    const clear = await explainRemotely('http://api.signlens.dev', new Uint8Array([1]), {});
    assert.ok('error' in clear);
    assert.match(clear.error.message, /plain http is for this machine only/);
});

test('the status names the engine and the packs, or why not', async () => {
    const api = await stub();
    try {
        assert.deepEqual(await apiStatus(api.url), { engine: '0.1.0', programs: 44, tokens: 4003, packsAt: 1 });
    } finally {
        await api.close();
    }
    const away = await apiStatus('http://127.0.0.1:1');
    assert.ok('error' in away);
    assert.match(away.error, /did not answer/);
});

test("the status is asked past the browser's cache, so a stale one never says the API is ready", async () => {
    const api = await stub();
    const real = globalThis.fetch;
    const asked: (RequestInit | undefined)[] = [];
    globalThis.fetch = (input, init) => {
        asked.push(init);
        return real(input, init);
    };
    try {
        assert.ok(!('error' in (await apiStatus(api.url))));
        assert.equal(asked.length, 1);
        assert.equal(asked[0]?.cache, 'no-store');
    } finally {
        globalThis.fetch = real;
        await api.close();
    }
});

test('a status that is not one is said to be so, and what is shown of it is plain text', async () => {
    const pack = { programs: 44, createdAt: 1, source: 's' };
    for (const body of [
        [],
        { descriptorPack: null },
        { descriptorPack: { ...pack, programs: '44' } },
        { descriptorPack: { ...pack, programs: -1 } },
    ]) {
        const api = await stub({ packs: { status: 200, body } });
        try {
            const status = await apiStatus(api.url);
            assert.ok('error' in status, JSON.stringify(body));
            assert.match(status.error, /^the API at http:\/\/127\.0\.0\.1:\d+ answered a status this version cannot read$/);
        } finally {
            await api.close();
        }
    }
    const odd = await stub({
        packs: { status: 200, body: { engine: '0.1\u202e.0', descriptorPack: pack, tokenSnapshot: { tokens: 'many' } } },
    });
    try {
        assert.deepEqual(await apiStatus(odd.url), { engine: '0.1?.0', programs: 44, tokens: 0, packsAt: 1 });
    } finally {
        await odd.close();
    }
});

test('feedback is one post per record and true only on 204', async () => {
    const api = await stub();
    try {
        assert.equal(
            await sendFeedback(api.url, { messageHash: 'ab'.repeat(32), rating: 'wrong', comment: 'says sell', transaction: 'AQID' }),
            true,
        );
        assert.deepEqual(api.calls[0]?.body, { messageHash: 'ab'.repeat(32), rating: 'wrong', comment: 'says sell', transaction: 'AQID' });
    } finally {
        await api.close();
    }
    assert.equal(await sendFeedback('http://127.0.0.1:1', { messageHash: 'ab'.repeat(32), rating: 'clear' }), false);
});

test('an explanation that does not hold together, or is too big to be one, is an error document that says where', async () => {
    const broken = await stub({ explain: { status: 200, body: { ...EXPLANATION, effects: [{ type: 'transfer', value: {} }] } } });
    try {
        const document = await explainRemotely(broken.url, new Uint8Array([1]), {});
        assert.ok('error' in document);
        assert.match(document.error.message, /cannot read: explanation\.effects\[0\]\.value\.from is not an object/);
    } finally {
        await broken.close();
    }
    const unknown = await stub({ explain: { status: 200, body: { ...EXPLANATION, verdict: 'Review' } } });
    try {
        const document = await explainRemotely(unknown.url, new Uint8Array([1]), {});
        assert.ok('error' in document);
        assert.match(document.error.message, /"Review" is not a verdict this version knows/);
    } finally {
        await unknown.close();
    }
    const huge = await stub({ explain: { status: 200, body: { ...EXPLANATION, text: 'x'.repeat(2_000_001) } } });
    try {
        const document = await explainRemotely(huge.url, new Uint8Array([1]), {});
        assert.ok('error' in document);
        assert.match(document.error.message, /not an explanation/);
    } finally {
        await huge.close();
    }
});
