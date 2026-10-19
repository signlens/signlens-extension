// The window: what the dapp asked, explained, the user's decision, sent to
// the background worker that opened the window, and a word of feedback on
// the explanation. The verdict and the one-line summary stay at the top
// and the buttons at the bottom; the explanation scrolls between them.

import { element, type HistoryEntry, type Row, type RowVerdictWord, renderRow, rows, rowVerdictWord, worstVerdict } from './render.ts';
import { settings } from './settings.ts';
import type { Rating } from './types.ts';

const id = new URLSearchParams(window.location.search).get('id') ?? '';

function byId<T extends HTMLElement>(name: string): T {
    return document.getElementById(name) as T;
}

function decide(decision: 'continue' | 'reject'): void {
    chrome.runtime.sendMessage({ type: 'decision', id, decision }).finally(() => window.close());
}

/** The origin as a line: the scheme muted, the host in bold, so lookalike hosts read differently. */
function originNode(origin: string | undefined): DocumentFragment {
    const node = document.createDocumentFragment();
    const match = /^(\w+:\/\/)(.*)$/.exec(origin ?? '');
    if (match) {
        node.append(element('span', 'scheme', match[1]), element('b', 'host', match[2]));
    } else {
        node.append(origin ?? 'an unknown page');
    }
    node.append(' asks you to sign');
    return node;
}

/**
 * The feedback strip under the explanation: one of three ratings, a
 * comment, and, on a transaction SignLens could not fully explain, the
 * offer to send the transaction itself so it gets covered. Sent through
 * the worker, which knows the API; the window never waits for it.
 */
function feedbackStrip(list: Row[], worst: RowVerdictWord): void {
    const strip = byId<HTMLElement>('feedback');
    const digests = list.map((row) => row.digest).filter((digest): digest is string => Boolean(digest));
    if (digests.length === 0) return;
    strip.hidden = false;
    const cover = byId<HTMLLabelElement>('feedback-cover');
    const coverBox = cover.querySelector('input') as HTMLInputElement;
    const comment = byId<HTMLTextAreaElement>('feedback-comment');
    const note = byId<HTMLElement>('feedback-note');
    const transactions = list.map((row) => row.transaction).filter((t): t is string => Boolean(t));
    cover.hidden = !(worst === 'blocked' || worst === 'warning' || worst === 'error') || transactions.length === 0;
    let rating: Rating | null = null;
    const send = () => {
        if (!rating) return;
        chrome.runtime
            .sendMessage({
                type: 'feedback',
                payload: { digests, rating, comment: comment.value.slice(0, 2000), transactions: coverBox.checked ? transactions : [] },
            })
            .catch(() => {});
        note.textContent = 'Thank you. Sent to SignLens.';
    };
    for (const button of strip.querySelectorAll<HTMLButtonElement>('button[data-rating]')) {
        button.addEventListener('click', () => {
            rating = button.dataset.rating as Rating;
            for (const other of strip.querySelectorAll<HTMLButtonElement>('button[data-rating]'))
                other.classList.toggle('primary', other === button);
            comment.hidden = rating === 'clear';
            if (rating === 'clear') send();
            else note.textContent = 'Add a word if you like; it is sent when you decide below.';
        });
    }
    // A comment or the cover box goes with the decision, so neither is lost.
    for (const button of [byId<HTMLButtonElement>('continue'), byId<HTMLButtonElement>('reject')]) {
        button.addEventListener('click', send, { capture: true });
    }
}

async function start(): Promise<void> {
    const stored = (await chrome.storage.session.get(`pending:${id}`)) as Record<string, HistoryEntry | undefined>;
    const entry = stored[`pending:${id}`];
    const proceed = byId<HTMLButtonElement>('continue');
    const reject = byId<HTMLButtonElement>('reject');
    const note = byId<HTMLElement>('note');
    if (!entry) {
        note.textContent = 'This request is no longer pending.';
        proceed.hidden = true;
        reject.textContent = 'Close';
        reject.addEventListener('click', () => window.close());
        byId<HTMLElement>('band').hidden = true;
        return;
    }
    const method = (entry.method ?? '').replace(/^\w+:/, '');
    const list = rows(entry);
    const { showInstructions } = await settings();
    const transactions = /transaction/i.test(method);
    byId<HTMLElement>('title').textContent = transactions
        ? list.length > 1
            ? `Sign ${list.length} transactions`
            : 'Sign a transaction'
        : 'Sign a message';
    byId<HTMLElement>('what').textContent = method;
    byId<HTMLElement>('where').replaceChildren(originNode(entry.origin));

    const worst = worstVerdict(list);
    const band = byId<HTMLElement>('band');
    band.classList.add(worst);
    const bandVerdict = byId<HTMLElement>('band-verdict');
    bandVerdict.textContent = worst;
    bandVerdict.classList.add(worst);
    const first = list[0];
    byId<HTMLElement>('band-summary').textContent =
        list.length === 1 && first
            ? (first.summary ?? first.error ?? (transactions ? '' : 'A message to sign, shown as it is'))
            : `${list.length} transactions`;

    const container = byId<HTMLOListElement>('rows');
    for (const row of list) {
        const item = element('li');
        if (list.length > 1) {
            const head = element('div', 'row-head');
            head.append(element('span', `verdict ${rowVerdictWord(row)}`, rowVerdictWord(row)));
            item.append(head);
        }
        item.append(renderRow(row, { showInstructions }));
        container.append(item);
    }
    if (transactions) feedbackStrip(list, worst);

    const stopped = worst === 'blocked' || worst === 'error';
    if (entry.mode === 'passthrough') {
        const wallet = entry.upstream || 'your wallet';
        note.textContent = stopped
            ? `SignLens would refuse this. Continuing hands it unchanged to ${wallet} all the same, which asks for its own approval.`
            : `Continue hands the request unchanged to ${wallet}, which asks for its own approval.`;
        proceed.textContent = stopped ? `Continue anyway to ${wallet}` : `Continue to ${wallet}`;
        // A refused request gets no inviting button.
        proceed.classList.toggle('primary', !stopped);
    } else {
        note.textContent = 'This wallet holds no keys: the request is refused either way.';
        proceed.hidden = true;
        reject.textContent = 'Close';
    }
    proceed.addEventListener('click', () => decide('continue'));
    reject.addEventListener('click', () => decide('reject'));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') decide('reject');
    });
    // Rejecting is the safe default: it has focus, so Enter cannot approve.
    reject.focus();

    // The worker that waits for the decision idles out otherwise.
    setInterval(() => chrome.runtime.sendMessage({ type: 'ping' }).catch(() => {}), 20_000);
}

void start();
