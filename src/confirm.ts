// The window: what the dapp asked, explained, the user's decision, sent to
// the background worker that opened the window, and a word of feedback on
// the explanation. The verdict and the one-line summary stay at the top
// and the buttons at the bottom; the explanation scrolls between them.

import { MAX_COMMENT, send } from './messages.ts';
import type { Decision, ExplainedRow, Row, VerdictWord } from './model.ts';
import { element, originNode, renderRow } from './render.ts';
import { settings } from './settings.ts';
import { getPending, local } from './store.ts';
import { methodName, withoutScheme } from './text.ts';
import type { Rating } from './types.ts';
import { rowVerdictWord, summaryOf, worstVerdict } from './verdict.ts';
import { byId, noLongerPending, requestId, sendDecision } from './windows.ts';

/** Remembers whether the reader keeps the instructions open, for the next window and the popup. */
function onShowInstructions(shown: boolean): void {
    local.set({ showInstructions: shown }).catch(() => {});
}

/** The verdict as the window's title says it. */
const TITLE_VERDICT: Record<Exclude<VerdictWord, 'message'>, string> = { ok: 'OK', warning: 'Warning', blocked: 'Blocked', error: 'Error' };

/** Sends the feedback strip's rating, if one was given and not sent yet: on a "clear", and with the decision. */
let sendFeedback: () => void = () => {};

/**
 * Sends the decision to the worker. A Continue that no request is waiting
 * for any more (its page closed or stopped waiting, or the worker was
 * restarted) went nowhere: the window says so rather than close as if it
 * had been passed on.
 */
function decide(decision: Decision): void {
    // A comment or the cover box goes with the decision, so neither is lost.
    sendFeedback();
    sendDecision(decision, () =>
        noLongerPending(
            'This request is no longer pending: nothing was passed on. The page was told it was refused.',
            byId('continue'),
            byId('reject'),
        ),
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
    const strip = byId('feedback');
    const explained = list.filter((row): row is ExplainedRow => row.kind === 'explained' && Boolean(row.digest));
    if (explained.length === 0) return;
    strip.hidden = false;
    const cover = byId<HTMLLabelElement>('feedback-cover');
    const coverBox = cover.querySelector('input') as HTMLInputElement;
    const comment = byId<HTMLTextAreaElement>('feedback-comment');
    comment.maxLength = MAX_COMMENT;
    const note = byId('feedback-note');
    const ratings = [...strip.querySelectorAll<HTMLButtonElement>('button[data-rating]')];
    const coverable = (row: ExplainedRow) => row.verdict !== 'ok';
    cover.hidden = !explained.some(coverable);
    let rating: Rating | null = null;
    let sent = false;
    sendFeedback = () => {
        if (!rating || sent) return;
        sent = true;
        // Done, but not disabled: a disabled button drops the focus a keyboard user just pressed it with.
        for (const button of ratings) button.setAttribute('aria-disabled', 'true');
        comment.disabled = true;
        coverBox.disabled = true;
        const records = explained.map((row) => ({
            digest: row.digest,
            transaction: coverBox.checked && coverable(row) ? row.transaction : null,
        }));
        send({ type: 'feedback', payload: { rating, comment: comment.value.slice(0, MAX_COMMENT), records } })
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
            if (sent) return;
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

/**
 * Escape rejects, as closing the window does, unless it has something
 * nearer to close: a help term the focus is on closes its note, and a box
 * being typed in keeps the request, so a key pressed to leave the box
 * does not refuse it.
 */
function onEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    const at = event.target;
    if (at instanceof HTMLTextAreaElement || (at instanceof HTMLInputElement && at.type === 'text')) return;
    if (at instanceof HTMLElement && at.matches('.term[aria-expanded="true"]')) {
        at.click();
        return;
    }
    decide('reject');
}

async function start(): Promise<void> {
    const entry = await getPending('confirm.html', requestId);
    const proceed = byId<HTMLButtonElement>('continue');
    const reject = byId<HTMLButtonElement>('reject');
    const note = byId('note');
    if (!entry) {
        byId('band').hidden = true;
        noLongerPending('This request is no longer pending.', proceed, reject);
        reject.addEventListener('click', () => window.close());
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') window.close();
        });
        return;
    }
    const method = methodName(entry.method);
    const list = entry.rows;
    const { showInstructions, gate } = await settings();
    const transactions = /transaction/i.test(method);
    const title = transactions ? (list.length > 1 ? `Sign ${list.length} transactions` : 'Sign a transaction') : 'Sign a message';
    byId('title').textContent = title;
    byId('what').textContent = method;
    byId('where').replaceChildren(originNode(entry.origin, ' asks you to sign'));

    const worst = worstVerdict(list);
    // Where the window is listed (the taskbar, the window switcher, a screen reader as it opens), the verdict comes first.
    document.title = `${worst === 'message' ? '' : `${TITLE_VERDICT[worst]}: `}${title} for ${withoutScheme(entry.origin) || 'an unknown page'} · SignLens`;
    const band = byId('band');
    band.classList.add(worst);
    const bandVerdict = byId('band-verdict');
    bandVerdict.textContent = worst;
    bandVerdict.classList.add(worst);
    const many = list.length > 1;
    // The band carries one summary: the transaction's, or, of several, the most serious one's.
    const at = Math.max(
        0,
        list.findIndex((row) => rowVerdictWord(row) === worst),
    );
    const lead = list[at];
    const summary = lead ? summaryOf(lead) : '';
    byId('band-summary').textContent = many ? `${summary} (transaction ${at + 1} of ${list.length}; each is below)` : summary;

    const container = byId<HTMLOListElement>('rows');
    // One transaction's summary is the band's; of several, each has its own, under its heading.
    container.classList.toggle('single', !many);
    for (const [i, row] of list.entries()) {
        const item = element('li');
        if (many) {
            const head = element('h2', 'row-head');
            head.append(
                `Transaction ${i + 1} of ${list.length}`,
                ' ',
                element('span', `verdict ${rowVerdictWord(row)}`, rowVerdictWord(row)),
            );
            item.append(head);
        }
        item.append(renderRow(row, { showInstructions, onShowInstructions, heading: many ? 'h3' : 'h2' }));
        container.append(item);
    }
    if (transactions) feedbackStrip(list);

    const stopped = worst === 'blocked' || worst === 'error';
    if (entry.mode === 'passthrough') {
        // The button names only what SignLens knows: the wallet in the
        // settings. With none named the page picks the first it has, and what
        // it calls that one is its word, given as such in the note: a page
        // could otherwise put any words on SignLens's own button.
        const wallet = entry.upstream || 'your wallet';
        const to = entry.upstream
            ? `${entry.upstream},`
            : entry.wallet
              ? `the first wallet the page has, which it calls “${entry.wallet}”, and`
              : 'your wallet,';
        // The setting is named as the settings name it.
        note.textContent = !stopped
            ? `Continue hands the request unchanged to ${to} which asks for its own approval.`
            : gate
              ? `SignLens would refuse this. Continuing hands it unchanged all the same to ${to} which asks for its own approval.`
              : `“Show the explanation and ask first” is off, but SignLens still asks before passing on what it would refuse. Continuing hands this unchanged to ${to} which asks for its own approval.`;
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
    document.addEventListener('keydown', onEscape);
    // Rejecting is the safe default: it has focus, so Enter cannot approve.
    reject.focus();
}

void start();
