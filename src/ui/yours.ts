// Your addresses, as the popup's settings and the setup page edit them: one
// row each, in full, to hold against your wallet's, with Remove; and a
// field that adds one, or several pasted at once, and takes nothing that
// is not a Solana address. Kept in the settings as they change
// (`myAddresses`, one per line, as the worker reads them), in turn with the
// address window, which adds one too; a change made elsewhere shows at once.

import { addAddresses, MAX_OWN_KEYS, parseAddresses, removeAddress, settings } from '../shared/settings.ts';
import { onChange } from '../shared/store.ts';
import { describe, short } from '../shared/text.ts';
import { element } from './render.ts';

/** A word that is not an address, as the status quotes it: cut short, since a paste can be anything. */
function quoted(word: string): string {
    return word.length > 24 ? `${word.slice(0, 24)}…` : word;
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
    rows.setAttribute('aria-label', 'Your addresses');
    rows.hidden = true;
    const none = element('p', 'yours-none', 'None yet.');
    const input = element('input', 'yours-input');
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.placeholder = 'Paste an address from your wallet';
    input.setAttribute('aria-label', 'Add an address');
    // The filled button adds; Remove, which loses something, is in the blocked colour.
    const add = element('button', 'primary yours-add', 'Add');
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
                const remove = element('button', 'small danger', 'Remove');
                remove.type = 'button';
                remove.setAttribute('aria-label', `Remove ${address}`);
                remove.addEventListener('click', () => void take(address));
                row.append(element('code', 'yours-address', address), remove);
                return row;
            }),
        );
        none.hidden = addresses.length > 0;
        rows.hidden = addresses.length === 0;
        limit.textContent =
            addresses.length > MAX_OWN_KEYS
                ? `A request carries ${MAX_OWN_KEYS} of these: those the site names, then the first in the list.`
                : '';
    };

    /** Takes `address` out, and gives the focus to the row after it, or to the field. */
    const take = async (address: string) => {
        const at = shown.indexOf(address);
        try {
            await removeAddress(address);
        } catch (error) {
            say(`Not removed: ${describe(error)}`, true);
            return;
        }
        show(parseAddresses((await settings()).myAddresses).addresses);
        say(`Removed ${short(address)}.`);
        (rows.querySelectorAll('button')[Math.min(at, shown.length - 1)] ?? input).focus();
    };

    /** Adds what the field holds: each address in it once; what is not one stays in the field, said so. */
    const put = async () => {
        const words = input.value.split(/[\s,;]+/).filter(Boolean);
        if (words.length === 0) {
            say('Paste an address first.', true);
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
            say(`Not added: ${describe(error)}`, true);
            return;
        }
        input.value = notAddresses.join(' ');
        input.setAttribute('aria-invalid', String(notAddresses.length > 0));
        if (notAddresses.length > 0) say(`Not a Solana address: ${notAddresses.map(quoted).join(', ')}.`, true);
        else if (fresh.length > 0) say(`Added ${fresh.map(short).join(', ')}.`);
        else say('Already in your list.');
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
