// The window: what the dapp asked, explained, the user's decision, sent to
// the background worker that opened the window, and a word of feedback on
// the explanation. The verdict and the one-line summary stay at the top
// and the buttons at the bottom; the explanation scrolls between them.

import { element, type HistoryEntry, originNode, type Row, renderRow } from './render.ts';
import { settings } from './settings.ts';
import type { Rating } from './types.ts';
import { rows, rowVerdictWord, worstVerdict } from './verdict.ts';

const id = new URLSearchParams(window.location.search).get('id') ?? '';

function byId<T extends HTMLElement>(name: string): T {
    return document.getElementById(name) as T;
}

/** Sends the feedback strip's rating, if one was given and not sent yet: on a "clear", and with the decision. */
let sendFeedback: () => void = () => {};

/**
 * Sends the decision to the worker. A Continue that no request is waiting
 * for any more (its page closed or stopped waiting, or the worker was
 * restarted) went nowhere: the window says so rather than close as if it
 * had been passed on.
 */
function decide(decision: 'continue' | 'reject'): void {
    // A comment or the cover box goes with the decision, so neither is lost.
    sendFeedback();
    chrome.runtime.sendMessage({ type: 'decision', id, decision }).then(
        (taken: unknown) => {
            if (taken === true || decision === 'reject') {
                window.close();
                return;
            }
            byId<HTMLElement>('note').textContent =
                'This request is no longer pending: nothing was passed on. The page was told it was refused.';
            byId<HTMLButtonElement>('continue').hidden = true;
            const reject = byId<HTMLButtonElement>('reject');
            reject.textContent = 'Close';
            reject.focus();
        },
        () => window.close(),
    );
}

/**
 * The feedback strip under the explanation: one of three ratings, a
 * comment, and, on a transaction SignLens did not call OK, the offer to
 * send the transaction itself so it gets covered. One record per explained
 * transaction, each with its own bytes or none, sent once, through the
 * worker, which knows the API; the window never waits for it.
 */
function feedbackStrip(list: Row[]): void {
    const strip = byId<HTMLElement>('feedback');
    const explained = list.filter((row) => Boolean(row.digest));
    if (explained.length === 0) return;
    strip.hidden = false;
    const cover = byId<HTMLLabelElement>('feedback-cover');
    const coverBox = cover.querySelector('input') as HTMLInputElement;
    const comment = byId<HTMLTextAreaElement>('feedback-comment');
    const note = byId<HTMLElement>('feedback-note');
    const ratings = [...strip.querySelectorAll<HTMLButtonElement>('button[data-rating]')];
    const coverable = (row: Row) => rowVerdictWord(row) !== 'ok' && Boolean(row.transaction);
    cover.hidden = !explained.some(coverable);
    let rating: Rating | null = null;
    let sent = false;
    sendFeedback = () => {
        if (!rating || sent) return;
        sent = true;
        for (const button of ratings) button.disabled = true;
        comment.disabled = true;
        coverBox.disabled = true;
        const records = explained.map((row) => ({
            digest: row.digest,
            transaction: coverBox.checked && coverable(row) ? (row.transaction ?? null) : null,
        }));
        chrome.runtime
            .sendMessage({ type: 'feedback', payload: { rating, comment: comment.value.slice(0, 2000), records } })
            .then(
                (taken: unknown) => taken === true,
                () => false,
            )
            .then((taken) => {
                note.textContent = taken ? 'Thank you. Sent to SignLens.' : 'The feedback could not be sent.';
            });
    };
    for (const button of ratings) {
        button.addEventListener('click', () => {
            rating = button.dataset.rating as Rating;
            for (const other of ratings) {
                other.classList.toggle('primary', other === button);
                other.setAttribute('aria-pressed', String(other === button));
            }
            comment.hidden = rating === 'clear';
            if (rating === 'clear') sendFeedback();
            else note.textContent = 'Add a word if you like; it is sent when you decide below.';
        });
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
    const { showInstructions, gate } = await settings();
    const transactions = /transaction/i.test(method);
    byId<HTMLElement>('title').textContent = transactions
        ? list.length > 1
            ? `Sign ${list.length} transactions`
            : 'Sign a transaction'
        : 'Sign a message';
    byId<HTMLElement>('what').textContent = method;
    byId<HTMLElement>('where').replaceChildren(originNode(entry.origin, ' asks you to sign'));

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
        item.append(renderRow(row, { showInstructions, heading: 'h2' }));
        container.append(item);
    }
    if (transactions) feedbackStrip(list);

    const stopped = worst === 'blocked' || worst === 'error';
    if (entry.mode === 'passthrough') {
        const wallet = entry.upstream || 'your wallet';
        note.textContent = stopped
            ? `${gate ? '' : 'The window is off in the settings, but opens for what SignLens would refuse. '}SignLens would refuse this. Continuing hands it unchanged to ${wallet} all the same, which asks for its own approval.`
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
