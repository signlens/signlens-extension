// The window: what the dapp asked, explained, the user's decision, sent to
// the background worker that opened the window, and a word of feedback on
// the explanation. The verdict and the one-line summary stay at the top
// and the buttons at the bottom; the explanation scrolls between them.

import { askBeforeRating, asksBeforeRating } from '../shared/consent.ts';
import { MAX_COMMENT, send } from '../shared/messages.ts';
import type { Decision, ExplainedRow, Row } from '../shared/model.ts';
import { base64Bytes, instructionPrograms } from '../shared/programs.ts';
import { settings } from '../shared/settings.ts';
import { getPending, local } from '../shared/store.ts';
import { logged, methodName, withoutScheme } from '../shared/text.ts';
import { type Rating, SEVERITIES, type Seen } from '../shared/types.ts';
import { rowVerdictWord, summaryOf, verdictText, worstVerdict } from '../shared/verdict.ts';
import { t } from '../shared/words.ts';
import { byId } from './dom.ts';
import { localize, nodes } from './localize.ts';
import { languageChoice } from './pages.ts';
import { asWorded, element, messageNode, originNode, renderRow } from './render.ts';
import { goneAtOpen, noLongerPending, requestId, sendDecision } from './windows.ts';

/** Remembers whether the reader keeps the instructions open, for the next window and the popup. */
function onShowInstructions(shown: boolean): void {
    local.set({ showInstructions: shown }).catch(logged('remember whether the instructions were open'));
}

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
    sendDecision(decision, t('window-not-passed-on'), byId('continue'), byId('reject', HTMLButtonElement));
}

/** The engine's word for the window's verdict. */
const ENGINE_VERDICT = { ok: 'ok', warning: 'warn', blocked: 'block' } as const;

/**
 * What the window shows of an explained transaction, as a report carries
 * it: the verdict, the summary, the findings by code, and the program each
 * instruction calls, read from the bytes, which stay here unless the user
 * sends them.
 */
function seenOf(row: ExplainedRow): Seen {
    const titles = new Map<number, string>();
    for (const section of row.sections) {
        if (section.kind.type === 'instruction') titles.set(section.kind.value.index, section.title.text);
    }
    let programs: string[] = [];
    try {
        programs = instructionPrograms(base64Bytes(row.transaction) ?? new Uint8Array());
    } catch {
        // The instructions go without their programs; the rest of the report stands.
    }
    return {
        verdict: ENGINE_VERDICT[row.verdict],
        summary: row.reportedSummary,
        findings: row.findings.map((f) => ({ code: f.code, severity: f.severity, instruction: f.instruction })),
        instructions: programs.map((program, index) => ({ program, title: titles.get(index) ?? null })),
    };
}

/** The addresses the transaction's lookup tables loaded, from its capture's comment lines. */
function loadedOf(capture: string): { loaded_writable: string[]; loaded_readonly: string[] } {
    const list = (name: string) =>
        (capture.split('\n').find((line) => line.startsWith(`# ${name}:`)) ?? '')
            .slice(name.length + 3)
            .split(' ')
            .filter(Boolean);
    return { loaded_writable: list('loaded-writable'), loaded_readonly: list('loaded-readonly') };
}

/**
 * The feedback strip under the explanation: one of three ratings, a
 * comment, and the offer to send the transaction itself, whatever the
 * verdict, so a rendering called OK but rated wrong can be explained
 * again as the user saw it. One record per explained transaction, each
 * with its own bytes or none, sent once, through the worker, which knows
 * the API; the window never waits for it.
 */
function feedbackStrip(list: Row[], page: { origin?: string; method?: string }): void {
    const strip = byId('feedback');
    const explained = list.filter((row): row is ExplainedRow => row.kind === 'explained' && Boolean(row.digest));
    if (explained.length === 0) return;
    strip.hidden = false;
    const cover = byId('feedback-cover', HTMLLabelElement);
    const coverBox = cover.querySelector('input') as HTMLInputElement;
    const comment = byId('feedback-comment', HTMLTextAreaElement);
    comment.maxLength = MAX_COMMENT;
    const note = byId('feedback-note');
    const ratings = [...strip.querySelectorAll<HTMLButtonElement>('button[data-rating]')];
    if (asksBeforeRating()) byId('feedback-what').textContent = t('window-feedback-what-firefox');
    (cover.querySelector('span') as HTMLElement).textContent = t('window-feedback-cover', { count: explained.length });
    let rating: Rating | null = null;
    let sent = false;
    // Firefox asks once whether a rating may carry the site and the
    // version; until storage says it has not asked yet, a click asks nothing.
    let askedBefore = true;
    local
        .get('ratingAsked')
        .then(({ ratingAsked }) => {
            askedBefore = ratingAsked === true;
        })
        .catch(logged('read whether Firefox asked about what a rating carries'));
    sendFeedback = () => {
        if (!rating || sent) return;
        sent = true;
        // Done, but not disabled: a disabled button drops the focus a keyboard user just pressed it with.
        for (const button of ratings) button.setAttribute('aria-disabled', 'true');
        comment.disabled = true;
        coverBox.disabled = true;
        const records = explained.map((row) => {
            const covered = coverBox.checked;
            return {
                digest: row.digest,
                transaction: covered ? row.transaction : null,
                seen: seenOf(row),
                ...(row.locale ? { locale: row.locale.used } : {}),
                ...(covered ? loadedOf(row.capture) : {}),
            };
        });
        const payload = { rating, comment: comment.value.slice(0, MAX_COMMENT), origin: page.origin, method: page.method, records };
        send({ type: 'feedback', payload })
            .catch(() => false)
            .then((taken) => {
                note.textContent = taken ? t('window-feedback-sent') : t('window-feedback-failed');
            });
    };
    for (const button of ratings) {
        button.addEventListener('click', () => {
            if (sent) return;
            // First, in the click itself, as Firefox asks only from one.
            const answered = askBeforeRating(askedBefore);
            askedBefore = true;
            rating = button.dataset.rating as Rating;
            for (const other of ratings) {
                other.classList.toggle('primary', other === button);
                other.setAttribute('aria-pressed', String(other === button));
            }
            comment.hidden = rating === 'clear';
            // A "clear" goes at once, after the answer if Firefox is asking.
            if (rating === 'clear') void answered.finally(() => sendFeedback());
            else note.textContent = t('window-feedback-add-word');
        });
    }
}

/** Why SignLens would refuse `row`, in a sentence: its most serious finding, or that nothing is known of it. */
function refusalOf(row: Row | undefined): string {
    if (row?.kind !== 'explained') return t('window-refusal-unexplained');
    let worst: ExplainedRow['findings'][number] | undefined;
    for (const finding of row.findings) {
        if (!worst || SEVERITIES.indexOf(finding.severity) > SEVERITIES.indexOf(worst.severity)) worst = finding;
    }
    return t('window-refusal-blocked', { why: (worst?.message ?? row.summary).text });
}

/**
 * The question "Continue anyway" asks on a request SignLens would refuse,
 * with why, before anything is passed on: one press is not enough to hand
 * on what was blocked, or what nothing is known of. Going back has the
 * focus, so an Enter goes back, and Escape closes the question, not the
 * window. Going back is the filled button, going on the one in the
 * blocked colour; the yes sits mid-window, away from where Continue was
 * pressed, so a double click does not reach it. Returns what opens it.
 */
function question(proceed: HTMLButtonElement, why: string): () => void {
    const dialog = byId('anyway', HTMLDialogElement);
    byId('anyway-why').textContent = why;
    const go = byId('anyway-go', HTMLButtonElement);
    byId('anyway-back').addEventListener('click', () => dialog.close());
    go.addEventListener('click', () => {
        dialog.close();
        decide('continue');
    });
    // Back where it was asked from, however it closed.
    dialog.addEventListener('close', () => proceed.focus());
    return () => dialog.showModal();
}

/**
 * "Try again", for a request with a transaction SignLens could not
 * explain: the worker explains it anew while it waits, with the settings
 * as they are now, and the window shows what that made, the decision still
 * to take. Pressed again while it works, it does nothing; a request no
 * longer waiting says so instead.
 */
function tryAgain(proceed: HTMLButtonElement, reject: HTMLButtonElement): HTMLElement {
    const holder = element('div', 'again');
    const button = element('button', 'primary', t('window-try-again'));
    button.type = 'button';
    const status = element('span', 'note');
    status.setAttribute('role', 'status');
    holder.append(button, ' ', status);
    button.addEventListener('click', () => {
        if (button.getAttribute('aria-disabled') === 'true') return;
        button.setAttribute('aria-disabled', 'true');
        status.textContent = t('window-asking-again');
        send({ type: 'retry', id: requestId })
            .catch(() => false)
            .then((again) => {
                // What the worker made is in the request's place: shown as the window opened on it.
                if (again) window.location.reload();
                else {
                    status.textContent = '';
                    noLongerPending(t('window-not-explained-again'), proceed, reject);
                }
            });
    });
    return holder;
}

/**
 * "Show in English" for an explanation worded in another language, "Show
 * in your language" for one asked for in English: the worker explains the
 * request anew in it while it waits, as "Try again" does, and the window
 * shows what that made, the decision still to take.
 */
function languageSwitch(choice: 'english' | 'reader', proceed: HTMLButtonElement, reject: HTMLButtonElement): HTMLElement {
    const english = choice === 'english';
    const holder = element('p', 'language');
    const button = element('button', 'small', english ? t('window-show-english') : t('window-show-yours'));
    button.type = 'button';
    const status = element('span', 'note');
    status.setAttribute('role', 'status');
    holder.append(button, ' ', status);
    button.addEventListener('click', () => {
        if (button.getAttribute('aria-disabled') === 'true') return;
        button.setAttribute('aria-disabled', 'true');
        status.textContent = english ? t('window-asking-english') : t('window-asking-yours');
        send({ type: 'retry', id: requestId, ...(english ? { english: true as const } : {}) })
            .catch(() => false)
            .then((again) => {
                if (again) window.location.reload();
                else {
                    status.textContent = '';
                    noLongerPending(t('window-not-explained-again'), proceed, reject);
                }
            });
    });
    return holder;
}

/**
 * Escape rejects, as closing the window does, unless it has something
 * nearer to close: an open help term, toggle or run of bytes the focus is
 * on closes, and a box being typed in keeps the request, so a key pressed
 * to leave the box does not refuse it. With the question "Continue anyway"
 * asks open, Escape closes only that.
 */
function onEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || byId('anyway', HTMLDialogElement).open) return;
    const at = event.target;
    if (at instanceof HTMLTextAreaElement || (at instanceof HTMLInputElement && at.type === 'text')) return;
    if (at instanceof HTMLElement && at.matches(':is(.term, .toggle, .more-bytes)[aria-expanded="true"]')) {
        at.click();
        return;
    }
    decide('reject');
}

async function start(): Promise<void> {
    localize();
    const entry = await getPending('confirm.html', requestId);
    const proceed = byId('continue', HTMLButtonElement);
    const reject = byId('reject', HTMLButtonElement);
    const note = byId('note');
    if (!entry) {
        goneAtOpen(proceed, reject);
        reject.addEventListener('click', () => window.close());
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') window.close();
        });
        return;
    }
    const method = methodName(entry.method);
    const list = entry.rows;
    const { showInstructions, askFirst } = await settings();
    const transactions = /transaction/i.test(method);
    const title = transactions ? t('window-heading-transactions', { count: list.length }) : t('window-heading-message');
    byId('title').textContent = title;
    byId('what').textContent = method;
    byId('where').replaceChildren(nodes('window-where', { origin: originNode(entry.origin) }));

    const worst = worstVerdict(list);
    // Where the window is listed (the taskbar, the window switcher, a screen reader as it opens), the verdict comes first.
    document.title = t('window-page-title', {
        verdict: worst,
        request: title,
        site: withoutScheme(entry.origin) || t('window-unknown-page'),
    });
    const band = byId('band');
    band.classList.add(worst);
    const bandVerdict = byId('band-verdict');
    bandVerdict.textContent = verdictText(worst);
    bandVerdict.classList.add(worst);
    const many = list.length > 1;
    // The band carries one summary: the transaction's, or, of several, the most serious one's.
    const at = Math.max(
        0,
        list.findIndex((row) => rowVerdictWord(row) === worst),
    );
    const lead = list[at];
    const summary = lead ? bandLine(lead) : '';
    byId('band-summary').replaceChildren(many ? nodes('window-band-of-several', { summary, index: at + 1, count: list.length }) : summary);

    const choice = languageChoice(list, navigator.languages);
    if (choice) band.after(languageSwitch(choice, proceed, reject));

    // What the API or the RPC could not explain may be explained on a second try; a request refused as a whole would be refused again.
    const firstFailed = list.findIndex((row) => row.kind === 'failed' && row.scope === 'transaction');
    const again = firstFailed >= 0 ? tryAgain(proceed, reject) : null;
    const container = byId('rows', HTMLOListElement);
    // One transaction's summary is the band's; of several, each has its own, under its heading.
    container.classList.toggle('single', !many);
    for (const [i, row] of list.entries()) {
        const item = element('li');
        if (many) {
            const head = element('h2', 'row-head');
            head.append(
                t('window-transaction-of', { index: i + 1, count: list.length }),
                ' ',
                element('span', `verdict ${rowVerdictWord(row)}`, verdictText(rowVerdictWord(row))),
            );
            item.append(head);
        }
        item.append(
            renderRow(row, {
                showInstructions,
                onShowInstructions,
                heading: many ? 'h3' : 'h2',
                // Saved from the window as from the popup: named by when the page asked, the site, and which transaction.
                capturedAt: entry.time,
                site: withoutScheme(entry.origin),
                ...(many ? { part: i + 1 } : {}),
                ...(again ? { again: i === firstFailed ? again : (true as const) } : {}),
            }),
        );
        container.append(item);
    }
    if (transactions) feedbackStrip(list, entry);
    // Closing the window is a decision too (a refusal): a rating or comment left in it goes, as with Reject.
    window.addEventListener('pagehide', () => sendFeedback());

    const stopped = worst === 'blocked' || worst === 'error';
    let ask: (() => void) | null = null;
    if (entry.mode === 'passthrough') {
        // The button names only what SignLens knows: the wallet in the
        // settings. With none named the page picks the first it has, and what
        // it calls that one is its word, given as such in the note: a page
        // could otherwise put any words on SignLens's own button.
        const wallet = entry.upstream;
        const hands = { to: wallet ? 'settings' : entry.wallet ? 'page' : 'none', wallet: wallet || entry.wallet || '' };
        // The setting is named as the settings name it.
        note.textContent = !stopped
            ? t('window-note-continue', hands)
            : askFirst
              ? t('window-note-refused', hands)
              : t('window-note-refused-ask-off', hands);
        if (stopped) proceed.textContent = wallet ? t('window-continue-anyway-to', { wallet }) : t('window-continue-anyway-to-yours');
        else proceed.textContent = wallet ? t('window-continue-to', { wallet }) : t('window-continue-to-yours');
        // A refused request gets no inviting button, and one that asks again first.
        proceed.classList.toggle('primary', !stopped);
        if (stopped) {
            const why = refusalOf(lead);
            ask = question(proceed, many ? t('window-refusal-of-several', { why, index: at + 1, count: list.length }) : why);
        }
    } else {
        note.textContent = t('window-note-no-keys');
        proceed.hidden = true;
        reject.textContent = t('window-close');
    }
    proceed.addEventListener('click', () => (ask ? ask() : decide('continue')));
    reject.addEventListener('click', () => decide('reject'));
    document.addEventListener('keydown', onEscape);
    // Rejecting is the safe default: it has focus, so Enter cannot approve.
    reject.focus();
}

void start();

/**
 * The band's line for a transaction: several actions by their count, which
 * heads their list below; otherwise its summary, an explained one laid out
 * in its parts as the rows lay it out.
 */
function bandLine(row: Row): string | Node {
    if (row.kind !== 'explained') return summaryOf(row);
    const actions = row.actions ?? [];
    return actions.length > 1 ? t('row-actions', { count: actions.length }) : asWorded(row, () => messageNode(row.summary));
}
