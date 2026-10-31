// Your addresses, as the popup's settings and the setup page edit them: one
// row each, in full, to hold against your wallet's, with Remove; and a
// field that adds one, or several pasted at once, and takes nothing that
// is not a Solana address. Kept in the settings as they change
// (`myAddresses`, one per line, as the worker reads them), in turn with the
// address window, which adds one too; a change made elsewhere shows at once.

import { addAddresses, MAX_OWN_KEYS, parseAddresses, removeAddress, settings } from '../shared/settings.ts';
import { onChange } from '../shared/store.ts';
import { describe, short } from '../shared/text.ts';
import { t } from '../shared/words.ts';
import { element } from './render.ts';

/** A word that is not an address, as the status quotes it: cut short, since a paste can be anything. */
function quoted(word: string): string {
    return word.length > 24 ? `${word.slice(0, 24)}…` : word;
}

/** `items` as a list in a sentence. */
function listed(items: readonly string[]): string {
    return items.join(t('yours-list-separator'));
}

/**
 * Builds the list of your addresses in `host`, or only the field that adds
 * one, without `list`. `onAdded` hears the addresses each add took.
 */
export function yourAddresses(
    host: HTMLElement,
    { list = true, onAdded }: { list?: boolean; onAdded?: (added: string[]) => void } = {},
): void {
    const rows = element('ul', 'yours-list');
    rows.setAttribute('aria-label', t('yours-list-label'));
    rows.hidden = true;
    const none = element('p', 'yours-none', t('yours-none'));
    const input = element('input', 'yours-input');
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.placeholder = t('yours-input-placeholder');
    input.setAttribute('aria-label', t('yours-input-label'));
    // The filled button adds; Remove, which loses something, is in the blocked colour.
    const add = element('button', 'primary yours-add', t('yours-add'));
    add.type = 'button';
    const adding = element('div', 'yours-field');
    adding.append(input, add);
    const status = element('small', 'yours-status');
    status.setAttribute('role', 'status');
    const limit = element('small', 'yours-limit note');
    if (list) host.append(rows, none);
    host.append(adding, status);
    if (list) host.append(limit);

    const say = (text: string, bad = false) => {
        status.textContent = text;
        status.classList.toggle('bad', bad);
    };

    let shown: string[] = [];
    /** The rows for `addresses`, made anew only when they changed, so a focus in them stays. */
    const show = (addresses: string[]) => {
        if (!list || addresses.join('\n') === shown.join('\n')) return;
        shown = addresses;
        rows.replaceChildren(
            ...addresses.map((address) => {
                const row = element('li', 'yours-row');
                const remove = element('button', 'small danger', t('yours-remove'));
                remove.type = 'button';
                remove.setAttribute('aria-label', t('yours-remove-label', { address }));
                remove.addEventListener('click', () => void take(address));
                row.append(element('code', 'yours-address', address), remove);
                return row;
            }),
        );
        none.hidden = addresses.length > 0;
        rows.hidden = addresses.length === 0;
        limit.textContent = addresses.length > MAX_OWN_KEYS ? t('yours-limit', { max: MAX_OWN_KEYS }) : '';
    };

    /** Takes `address` out, and gives the focus to the row after it, or to the field. */
    const take = async (address: string) => {
        const at = shown.indexOf(address);
        try {
            await removeAddress(address);
        } catch (error) {
            say(t('yours-not-removed', { error: describe(error) }), true);
            return;
        }
        show(parseAddresses((await settings()).myAddresses).addresses);
        say(t('yours-removed', { address: short(address) }));
        (rows.querySelectorAll('button')[Math.min(at, shown.length - 1)] ?? input).focus();
    };

    /** Adds what the field holds: each address in it once; what is not one stays in the field, said so. */
    const put = async () => {
        const words = input.value.split(/[\s,;]+/).filter(Boolean);
        if (words.length === 0) {
            say(t('yours-empty'), true);
            input.focus();
            return;
        }
        const { addresses, bad } = parseAddresses(words.join('\n'));
        const notAddresses = bad.map((line) => words[line - 1] ?? '');
        const before = parseAddresses((await settings()).myAddresses).addresses;
        const fresh = addresses.filter((address) => !before.includes(address));
        try {
            if (fresh.length > 0) await addAddresses(fresh);
        } catch (error) {
            say(t('yours-not-added', { error: describe(error) }), true);
            return;
        }
        input.value = notAddresses.join(' ');
        input.setAttribute('aria-invalid', String(notAddresses.length > 0));
        if (notAddresses.length > 0) say(t('yours-not-address', { words: listed(notAddresses.map(quoted)) }), true);
        else if (fresh.length > 0) say(t('yours-added', { addresses: listed(fresh.map(short)) }));
        else say(t('yours-already'));
        show(parseAddresses((await settings()).myAddresses).addresses);
        input.focus();
        if (fresh.length > 0) onAdded?.(fresh);
    };

    add.addEventListener('click', () => void put());
    input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        // Not the form's submit: Enter here adds.
        event.preventDefault();
        void put();
    });
    // A word typed after a refusal is a new try: the refusal goes.
    input.addEventListener('input', () => {
        if (input.getAttribute('aria-invalid') !== 'true') return;
        input.setAttribute('aria-invalid', 'false');
        say('');
    });
    input.setAttribute('aria-invalid', 'false');

    onChange('local', (changes) => {
        if (changes.myAddresses !== undefined) show(parseAddresses(changes.myAddresses).addresses);
    });
    void settings().then(({ myAddresses }) => {
        show(parseAddresses(myAddresses).addresses);
        if (!list) none.hidden = true;
        // For the tests: the list holds what storage did.
        host.dataset.ready = 'true';
    });
}
